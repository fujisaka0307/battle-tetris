#!/usr/bin/env node

/**
 * Converts CodeQL SARIF results into Allure result JSON files
 * so they appear in the unified Allure report.
 *
 * Usage: node scripts/codeql-to-allure.mjs <sarif-directory>
 *
 * Output: allure-results/codeql/*.json
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const SARIF_DIR = process.argv[2];
const OUTPUT_DIR = 'allure-results/codeql';

if (!SARIF_DIR) {
  console.error('Usage: node scripts/codeql-to-allure.mjs <sarif-directory>');
  process.exit(1);
}

/** Map SARIF severity levels to Allure-friendly labels */
const SEVERITY_MAP = {
  error: 'critical',
  warning: 'major',
  note: 'minor',
  none: 'trivial',
};

function createAllureResult({ name, suite, historyId, status, message, description, links }) {
  const now = Date.now();
  return {
    uuid: randomUUID(),
    historyId,
    name,
    fullName: `codeql.${historyId}`,
    status,
    statusDetails: message ? { message, trace: description } : undefined,
    stage: 'finished',
    start: now,
    stop: now + 1,
    labels: [
      { name: 'parentSuite', value: 'CodeQL' },
      { name: 'suite', value: suite },
    ],
    links: links || [],
  };
}

function parseSarifFiles(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sarif'));
  const allResults = [];

  for (const file of files) {
    const content = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
    for (const run of content.runs || []) {
      for (const result of run.results || []) {
        allResults.push(result);
      }
    }
  }

  return allResults;
}

function categorizeFindings(findings) {
  const categories = {
    security: [],
    quality: [],
  };

  for (const finding of findings) {
    const tags = finding.properties?.tags || [];
    if (tags.some((t) => t.includes('security') || t.includes('cwe'))) {
      categories.security.push(finding);
    } else {
      categories.quality.push(finding);
    }
  }

  return categories;
}

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  let findings;
  try {
    findings = parseSarifFiles(SARIF_DIR);
  } catch (err) {
    console.error(`Failed to parse SARIF files in ${SARIF_DIR}:`, err.message);
    process.exit(1);
  }

  const { security, quality } = categorizeFindings(findings);
  const results = [];

  // 1. Overall summary — pass if no security findings
  results.push(
    createAllureResult({
      name: `CodeQL Scan: ${security.length === 0 ? 'No vulnerabilities' : `${security.length} finding(s)`}`,
      suite: 'Summary',
      historyId: 'codeql-summary',
      status: security.length === 0 ? 'passed' : 'failed',
      message:
        security.length > 0
          ? `${security.length} security finding(s) detected. Review in GitHub Security tab.`
          : 'No security vulnerabilities detected by CodeQL.',
    })
  );

  // 2. Security findings count
  results.push(
    createAllureResult({
      name: `Security Findings: ${security.length}`,
      suite: 'Security',
      historyId: 'codeql-security-count',
      status: security.length === 0 ? 'passed' : 'failed',
      message:
        security.length > 0
          ? `${security.length} security finding(s): review and fix before merging.`
          : undefined,
    })
  );

  // 3. Quality findings count (informational — always passed)
  results.push(
    createAllureResult({
      name: `Quality Findings: ${quality.length}`,
      suite: 'Quality',
      historyId: 'codeql-quality-count',
      status: 'passed',
      message:
        quality.length > 0
          ? `${quality.length} code quality finding(s) detected.`
          : 'No code quality issues detected.',
    })
  );

  // 4. Individual security findings as separate test results
  for (const finding of security) {
    const ruleId = finding.ruleId || 'unknown';
    const message = finding.message?.text || 'No description';
    const severity = SEVERITY_MAP[finding.level] || 'minor';
    const location = finding.locations?.[0]?.physicalLocation;
    const filePath = location?.artifactLocation?.uri || 'unknown';
    const startLine = location?.region?.startLine || 0;

    results.push(
      createAllureResult({
        name: `[${severity.toUpperCase()}] ${ruleId}: ${filePath}:${startLine}`,
        suite: 'Security',
        historyId: `codeql-${ruleId}-${filePath}-${startLine}`,
        status: 'failed',
        message: `${message}\n\nRule: ${ruleId}\nFile: ${filePath}:${startLine}\nSeverity: ${severity}`,
        description: finding.message?.text,
      })
    );
  }

  // 5. Total findings (informational)
  results.push(
    createAllureResult({
      name: `Total Findings: ${findings.length}`,
      suite: 'Summary',
      historyId: 'codeql-total',
      status: 'passed',
      message: `CodeQL analyzed the codebase and found ${findings.length} total finding(s) (${security.length} security, ${quality.length} quality).`,
    })
  );

  // Write results
  for (const result of results) {
    const filePath = `${OUTPUT_DIR}/${result.uuid}-result.json`;
    writeFileSync(filePath, JSON.stringify(result, null, 2));
  }

  console.log(`Generated ${results.length} Allure result(s) in ${OUTPUT_DIR}/`);

  // Summary
  console.log('\nCodeQL Analysis Summary:');
  console.log(`  Total Findings: ${findings.length}`);
  console.log(`  Security: ${security.length}`);
  console.log(`  Quality: ${quality.length}`);

  // Fail if security findings exist
  if (security.length > 0) {
    console.log('\nSecurity findings detected — check GitHub Security tab for details.');
  }
}

main();
