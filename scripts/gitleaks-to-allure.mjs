#!/usr/bin/env node

/**
 * Converts gitleaks JSON report into Allure result JSON files.
 *
 * Usage: node scripts/gitleaks-to-allure.mjs <gitleaks-report.json>
 *
 * Output: allure-results/gitleaks/*.json
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const REPORT_PATH = process.argv[2];
const OUTPUT_DIR = 'allure-results/gitleaks';

if (!REPORT_PATH) {
  console.error('Usage: node scripts/gitleaks-to-allure.mjs <gitleaks-report.json>');
  process.exit(1);
}

function createAllureResult({ name, suite, historyId, status, message }) {
  const now = Date.now();
  return {
    uuid: randomUUID(),
    historyId,
    name,
    fullName: `gitleaks.${historyId}`,
    status,
    statusDetails: message ? { message } : undefined,
    stage: 'finished',
    start: now,
    stop: now + 1,
    labels: [
      { name: 'parentSuite', value: 'Gitleaks' },
      { name: 'suite', value: suite },
    ],
  };
}

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  let findings;
  try {
    const content = readFileSync(REPORT_PATH, 'utf-8');
    findings = JSON.parse(content);
  } catch (err) {
    // Empty report means no findings
    if (err.code === 'ENOENT' || err.message.includes('Unexpected end of JSON')) {
      findings = [];
    } else {
      console.error('Failed to parse gitleaks report:', err.message);
      process.exit(1);
    }
  }

  // Normalize: gitleaks may output an empty array or null
  if (!Array.isArray(findings)) {
    findings = [];
  }

  const results = [];

  // 1. Overall summary
  results.push(
    createAllureResult({
      name: `Secret Scanning: ${findings.length === 0 ? 'No leaks detected' : `${findings.length} leak(s) found`}`,
      suite: 'Summary',
      historyId: 'gitleaks-summary',
      status: findings.length === 0 ? 'passed' : 'failed',
      message:
        findings.length > 0
          ? `${findings.length} secret(s)/credential(s) found in the codebase. These must be rotated and removed.`
          : 'No secrets or credentials detected in the codebase.',
    })
  );

  // 2. Individual findings
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    const ruleId = f.RuleID || f.ruleID || 'unknown';
    const filePath = f.File || f.file || 'unknown';
    const line = f.StartLine || f.startLine || 0;
    const description = f.Description || f.description || ruleId;

    results.push(
      createAllureResult({
        name: `[LEAK] ${ruleId}: ${filePath}:${line}`,
        suite: 'Findings',
        historyId: `gitleaks-${ruleId}-${filePath}-${line}`,
        status: 'failed',
        message: `Rule: ${ruleId}\nDescription: ${description}\nFile: ${filePath}:${line}\n\nThis secret must be rotated immediately.`,
      })
    );
  }

  // Write results
  for (const result of results) {
    const filePath = `${OUTPUT_DIR}/${result.uuid}-result.json`;
    writeFileSync(filePath, JSON.stringify(result, null, 2));
  }

  console.log(`Generated ${results.length} Allure result(s) in ${OUTPUT_DIR}/`);
  console.log(`\nGitleaks Summary: ${findings.length} finding(s)`);
}

main();
