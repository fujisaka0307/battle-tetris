#!/usr/bin/env node

/**
 * Runs `npm audit --json` and converts the results into Allure result JSON files.
 *
 * Output: allure-results/npm-audit/*.json
 */

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const OUTPUT_DIR = 'allure-results/npm-audit';

function createAllureResult({ name, suite, historyId, status, message }) {
  const now = Date.now();
  return {
    uuid: randomUUID(),
    historyId,
    name,
    fullName: `npm-audit.${historyId}`,
    status,
    statusDetails: message ? { message } : undefined,
    stage: 'finished',
    start: now,
    stop: now + 1,
    labels: [
      { name: 'parentSuite', value: 'npm audit' },
      { name: 'suite', value: suite },
    ],
  };
}

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  let auditJson;
  try {
    // npm audit --json exits with non-zero when vulnerabilities exist
    const output = execSync('npm audit --json 2>/dev/null', { encoding: 'utf-8' });
    auditJson = JSON.parse(output);
  } catch (err) {
    if (err.stdout) {
      auditJson = JSON.parse(err.stdout);
    } else {
      console.error('Failed to run npm audit:', err.message);
      process.exit(1);
    }
  }

  const metadata = auditJson.metadata?.vulnerabilities || {};
  const total = metadata.total || 0;
  const critical = metadata.critical || 0;
  const high = metadata.high || 0;
  const moderate = metadata.moderate || 0;
  const low = metadata.low || 0;
  const info = metadata.info || 0;

  const results = [];

  // 1. Overall summary
  const hasBlocking = critical > 0 || high > 0;
  results.push(
    createAllureResult({
      name: `Dependency Audit: ${total === 0 ? 'No vulnerabilities' : `${total} finding(s)`}`,
      suite: 'Summary',
      historyId: 'npm-audit-summary',
      status: hasBlocking ? 'failed' : 'passed',
      message: hasBlocking
        ? `${critical} critical, ${high} high severity vulnerabilities found. Run \`npm audit fix\` to resolve.`
        : total > 0
          ? `${total} low/moderate vulnerabilities found (non-blocking).`
          : 'All dependencies are clean.',
    })
  );

  // 2. By severity
  const severities = [
    { label: 'Critical', count: critical, fail: true },
    { label: 'High', count: high, fail: true },
    { label: 'Moderate', count: moderate, fail: false },
    { label: 'Low', count: low, fail: false },
    { label: 'Info', count: info, fail: false },
  ];

  for (const sev of severities) {
    results.push(
      createAllureResult({
        name: `${sev.label}: ${sev.count}`,
        suite: 'By Severity',
        historyId: `npm-audit-${sev.label.toLowerCase()}`,
        status: sev.fail && sev.count > 0 ? 'failed' : 'passed',
        message: sev.count > 0 ? `${sev.count} ${sev.label.toLowerCase()} severity issue(s).` : undefined,
      })
    );
  }

  // 3. Individual vulnerabilities (from advisories)
  const vulnerabilities = auditJson.vulnerabilities || {};
  for (const [pkgName, vuln] of Object.entries(vulnerabilities)) {
    const severity = vuln.severity || 'unknown';
    const via = Array.isArray(vuln.via)
      ? vuln.via.map((v) => (typeof v === 'string' ? v : v.title || v.name || 'unknown')).join(', ')
      : String(vuln.via);
    const isFail = severity === 'critical' || severity === 'high';

    results.push(
      createAllureResult({
        name: `[${severity.toUpperCase()}] ${pkgName}: ${via}`,
        suite: 'Vulnerabilities',
        historyId: `npm-audit-pkg-${pkgName}`,
        status: isFail ? 'failed' : 'passed',
        message: `Package: ${pkgName}\nSeverity: ${severity}\nVia: ${via}\nRange: ${vuln.range || 'N/A'}`,
      })
    );
  }

  // Write results
  for (const result of results) {
    const filePath = `${OUTPUT_DIR}/${result.uuid}-result.json`;
    writeFileSync(filePath, JSON.stringify(result, null, 2));
  }

  console.log(`Generated ${results.length} Allure result(s) in ${OUTPUT_DIR}/`);
  console.log('\nnpm audit Summary:');
  console.log(`  Total: ${total}`);
  console.log(`  Critical: ${critical} | High: ${high} | Moderate: ${moderate} | Low: ${low} | Info: ${info}`);

  if (hasBlocking) {
    process.exitCode = 1;
  }
}

main();
