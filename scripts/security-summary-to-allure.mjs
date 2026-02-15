#!/usr/bin/env node

/**
 * Generates a unified security summary for the Allure report.
 * Reads all security-related Allure results and creates an aggregated overview.
 *
 * This script should run AFTER all individual security tools have generated
 * their Allure results (CodeQL, npm audit, Gitleaks, ZAP, SonarCloud).
 *
 * Usage: node scripts/security-summary-to-allure.mjs <allure-results-dir>
 *
 * Output: Appends summary results to the same allure-results directory.
 *
 * Optional: Set DEFECTDOJO_URL and DEFECTDOJO_API_KEY environment variables
 * to automatically export findings to DefectDojo.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const RESULTS_DIR = process.argv[2] || 'allure-results';
const DEFECTDOJO_URL = process.env.DEFECTDOJO_URL;
const DEFECTDOJO_API_KEY = process.env.DEFECTDOJO_API_KEY;
const DEFECTDOJO_ENGAGEMENT_ID = process.env.DEFECTDOJO_ENGAGEMENT_ID;

const SECURITY_SUITES = ['CodeQL', 'npm audit', 'Gitleaks', 'OWASP ZAP', 'SonarCloud'];

function createAllureResult({ name, suite, historyId, status, message, description }) {
  const now = Date.now();
  return {
    uuid: randomUUID(),
    historyId,
    name,
    fullName: `security-dashboard.${historyId}`,
    status,
    statusDetails: message ? { message, trace: description } : undefined,
    stage: 'finished',
    start: now,
    stop: now + 1,
    labels: [
      { name: 'parentSuite', value: 'Security Dashboard' },
      { name: 'suite', value: suite },
    ],
  };
}

function loadAllureResults(dir) {
  const results = [];
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith('-result.json'));
    for (const file of files) {
      try {
        results.push(JSON.parse(readFileSync(join(dir, file), 'utf-8')));
      } catch {
        // Skip invalid files
      }
    }
  } catch {
    // Directory may not exist
  }
  return results;
}

function categorizeResults(results) {
  const categories = {};

  for (const suite of SECURITY_SUITES) {
    categories[suite] = { passed: 0, failed: 0, total: 0, findings: [] };
  }

  for (const result of results) {
    const parentSuite = result.labels?.find((l) => l.name === 'parentSuite')?.value;
    if (!parentSuite || !categories[parentSuite]) continue;

    categories[parentSuite].total++;
    if (result.status === 'failed') {
      categories[parentSuite].failed++;
      categories[parentSuite].findings.push({
        name: result.name,
        message: result.statusDetails?.message || '',
      });
    } else {
      categories[parentSuite].passed++;
    }
  }

  return categories;
}

async function exportToDefectDojo(categories) {
  if (!DEFECTDOJO_URL || !DEFECTDOJO_API_KEY) {
    console.log('\nDefectDojo export: Skipped (DEFECTDOJO_URL / DEFECTDOJO_API_KEY not set)');
    return;
  }

  console.log(`\nExporting to DefectDojo: ${DEFECTDOJO_URL}`);

  const findings = [];
  for (const [tool, data] of Object.entries(categories)) {
    for (const finding of data.findings) {
      findings.push({
        title: `[${tool}] ${finding.name}`,
        description: finding.message,
        severity: finding.name.includes('CRITICAL') || finding.name.includes('HIGH')
          ? 'High'
          : finding.name.includes('MEDIUM')
            ? 'Medium'
            : 'Low',
        active: true,
        verified: false,
        numerical_severity: 'S1',
      });
    }
  }

  if (findings.length === 0) {
    console.log('  No findings to export.');
    return;
  }

  for (const finding of findings) {
    try {
      const res = await fetch(`${DEFECTDOJO_URL}/api/v2/findings/`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${DEFECTDOJO_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...finding,
          test: DEFECTDOJO_ENGAGEMENT_ID ? Number(DEFECTDOJO_ENGAGEMENT_ID) : undefined,
        }),
      });

      if (!res.ok) {
        console.error(`  Failed to export "${finding.title}": ${res.status}`);
      }
    } catch (err) {
      console.error(`  Failed to export "${finding.title}": ${err.message}`);
    }
  }

  console.log(`  Exported ${findings.length} finding(s) to DefectDojo.`);
}

async function main() {
  const allResults = loadAllureResults(RESULTS_DIR);
  const categories = categorizeResults(allResults);

  const summaryResults = [];

  // Overall security posture
  let totalFailed = 0;
  let totalPassed = 0;
  let toolsWithFindings = 0;
  const lines = [];

  for (const [tool, data] of Object.entries(categories)) {
    totalFailed += data.failed;
    totalPassed += data.passed;
    if (data.failed > 0) toolsWithFindings++;

    const icon = data.failed > 0 ? 'FAIL' : data.total > 0 ? 'PASS' : 'N/A';
    lines.push(`[${icon}] ${tool}: ${data.failed} failed / ${data.total} checks`);
  }

  // 1. Overall posture
  summaryResults.push(
    createAllureResult({
      name: `Security Posture: ${totalFailed === 0 ? 'Clean' : `${totalFailed} finding(s) across ${toolsWithFindings} tool(s)`}`,
      suite: 'Overview',
      historyId: 'security-dashboard-posture',
      status: totalFailed === 0 ? 'passed' : 'failed',
      message: lines.join('\n'),
      description: [
        'Aggregated security findings from all scanning tools.',
        '',
        `Total checks: ${totalFailed + totalPassed}`,
        `Failed: ${totalFailed}`,
        `Passed: ${totalPassed}`,
        `Tools with findings: ${toolsWithFindings} / ${SECURITY_SUITES.length}`,
      ].join('\n'),
    })
  );

  // 2. Per-tool summary
  for (const [tool, data] of Object.entries(categories)) {
    if (data.total === 0) {
      summaryResults.push(
        createAllureResult({
          name: `${tool}: Not run`,
          suite: 'Tool Status',
          historyId: `security-dashboard-${tool.toLowerCase().replace(/\s+/g, '-')}`,
          status: 'broken',
          message: `${tool} did not produce results in this run. Check if the workflow is enabled.`,
        })
      );
    } else {
      summaryResults.push(
        createAllureResult({
          name: `${tool}: ${data.failed === 0 ? 'Clean' : `${data.failed} finding(s)`}`,
          suite: 'Tool Status',
          historyId: `security-dashboard-${tool.toLowerCase().replace(/\s+/g, '-')}`,
          status: data.failed === 0 ? 'passed' : 'failed',
          message: `${data.passed} passed, ${data.failed} failed out of ${data.total} checks.`,
        })
      );
    }
  }

  // Write results
  for (const result of summaryResults) {
    const filePath = join(RESULTS_DIR, `${result.uuid}-result.json`);
    writeFileSync(filePath, JSON.stringify(result, null, 2));
  }

  console.log(`Generated ${summaryResults.length} security dashboard result(s)`);
  console.log('\nSecurity Dashboard Summary:');
  for (const line of lines) {
    console.log(`  ${line}`);
  }

  // Optional: export to DefectDojo
  await exportToDefectDojo(categories);
}

main();
