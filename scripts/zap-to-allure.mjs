#!/usr/bin/env node

/**
 * Converts OWASP ZAP JSON report into Allure result JSON files.
 *
 * Usage: node scripts/zap-to-allure.mjs <zap-report.json>
 *
 * Output: allure-results/zap/*.json
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const REPORT_PATH = process.argv[2];
const OUTPUT_DIR = 'allure-results/zap';

if (!REPORT_PATH) {
  console.error('Usage: node scripts/zap-to-allure.mjs <zap-report.json>');
  process.exit(1);
}

const RISK_TO_STATUS = {
  '0': 'passed',     // Informational
  '1': 'passed',     // Low
  '2': 'failed',     // Medium
  '3': 'failed',     // High
};

const RISK_LABELS = {
  '0': 'Informational',
  '1': 'Low',
  '2': 'Medium',
  '3': 'High',
};

function createAllureResult({ name, suite, historyId, status, message }) {
  const now = Date.now();
  return {
    uuid: randomUUID(),
    historyId,
    name,
    fullName: `zap.${historyId}`,
    status,
    statusDetails: message ? { message } : undefined,
    stage: 'finished',
    start: now,
    stop: now + 1,
    labels: [
      { name: 'parentSuite', value: 'OWASP ZAP' },
      { name: 'suite', value: suite },
    ],
  };
}

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  let report;
  try {
    report = JSON.parse(readFileSync(REPORT_PATH, 'utf-8'));
  } catch (err) {
    console.error('Failed to parse ZAP report:', err.message);
    process.exit(1);
  }

  const sites = report.site || [];
  const allAlerts = [];

  for (const site of sites) {
    for (const alert of site.alerts || []) {
      allAlerts.push(alert);
    }
  }

  const results = [];

  // Count by risk level
  const riskCounts = { '0': 0, '1': 0, '2': 0, '3': 0 };
  for (const alert of allAlerts) {
    const riskCode = String(alert.riskcode);
    if (riskCode in riskCounts) {
      riskCounts[riskCode]++;
    }
  }

  const mediumHigh = riskCounts['2'] + riskCounts['3'];

  // 1. Overall summary
  results.push(
    createAllureResult({
      name: `DAST Scan: ${mediumHigh === 0 ? 'No critical findings' : `${mediumHigh} medium/high finding(s)`}`,
      suite: 'Summary',
      historyId: 'zap-summary',
      status: mediumHigh === 0 ? 'passed' : 'failed',
      message: mediumHigh > 0
        ? `${riskCounts['3']} high, ${riskCounts['2']} medium risk finding(s). Review and fix before production.`
        : `Scan completed: ${allAlerts.length} total finding(s), no medium/high risk issues.`,
    })
  );

  // 2. By risk level
  for (const [code, label] of Object.entries(RISK_LABELS)) {
    results.push(
      createAllureResult({
        name: `${label} Risk: ${riskCounts[code]}`,
        suite: 'By Risk Level',
        historyId: `zap-risk-${code}`,
        status: RISK_TO_STATUS[code] === 'failed' && riskCounts[code] > 0 ? 'failed' : 'passed',
        message: riskCounts[code] > 0
          ? `${riskCounts[code]} ${label.toLowerCase()} risk finding(s).`
          : undefined,
      })
    );
  }

  // 3. Individual alerts
  for (const alert of allAlerts) {
    const riskCode = String(alert.riskcode);
    const riskLabel = RISK_LABELS[riskCode] || 'Unknown';
    const name = alert.name || alert.alert || 'Unknown Alert';
    const pluginId = alert.pluginid || 'unknown';
    const desc = alert.desc?.replace(/<[^>]*>/g, '') || '';
    const solution = alert.solution?.replace(/<[^>]*>/g, '') || '';
    const instanceCount = alert.instances?.length || 0;

    results.push(
      createAllureResult({
        name: `[${riskLabel.toUpperCase()}] ${name}`,
        suite: 'Alerts',
        historyId: `zap-alert-${pluginId}`,
        status: RISK_TO_STATUS[riskCode] || 'passed',
        message: [
          `Alert: ${name}`,
          `Risk: ${riskLabel} (${alert.confidence || 'unknown'} confidence)`,
          `Instances: ${instanceCount}`,
          `CWE: ${alert.cweid || 'N/A'}`,
          '',
          desc ? `Description: ${desc.substring(0, 500)}` : '',
          solution ? `Solution: ${solution.substring(0, 500)}` : '',
        ].filter(Boolean).join('\n'),
      })
    );
  }

  // Write results
  for (const result of results) {
    const filePath = `${OUTPUT_DIR}/${result.uuid}-result.json`;
    writeFileSync(filePath, JSON.stringify(result, null, 2));
  }

  console.log(`Generated ${results.length} Allure result(s) in ${OUTPUT_DIR}/`);
  console.log('\nOWASP ZAP Summary:');
  console.log(`  High: ${riskCounts['3']} | Medium: ${riskCounts['2']} | Low: ${riskCounts['1']} | Info: ${riskCounts['0']}`);
}

main();
