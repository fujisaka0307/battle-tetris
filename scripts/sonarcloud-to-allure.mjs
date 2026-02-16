#!/usr/bin/env node

/**
 * Fetches SonarCloud analysis results via API and converts them
 * into Allure result JSON files so they appear in the Allure report.
 *
 * Required environment variables:
 *   SONAR_TOKEN       — SonarCloud authentication token
 *   SONAR_PROJECT_KEY — SonarCloud project key
 *
 * Output: allure-results/sonarcloud/*.json
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const SONAR_BASE_URL = 'https://sonarcloud.io';
const OUTPUT_DIR = 'allure-results/sonarcloud';

const SONAR_TOKEN = process.env.SONAR_TOKEN;
const PROJECT_KEY = process.env.SONAR_PROJECT_KEY;

if (!SONAR_TOKEN || !PROJECT_KEY) {
  console.error('Error: SONAR_TOKEN and SONAR_PROJECT_KEY environment variables are required.');
  process.exit(1);
}

const authHeader = `Basic ${Buffer.from(`${SONAR_TOKEN}:`).toString('base64')}`;

async function sonarFetch(path) {
  const url = `${SONAR_BASE_URL}${path}`;
  const res = await fetch(url, { headers: { Authorization: authHeader } });
  if (!res.ok) {
    throw new Error(`SonarCloud API error: ${res.status} ${res.statusText} (${url})`);
  }
  return res.json();
}

function createAllureResult({ name, suite, historyId, status, message }) {
  const now = Date.now();
  return {
    uuid: randomUUID(),
    historyId,
    name,
    fullName: `sonarcloud.${historyId}`,
    status,
    statusDetails: message ? { message } : undefined,
    stage: 'finished',
    start: now,
    stop: now + 1,
    labels: [
      { name: 'parentSuite', value: 'SonarCloud' },
      { name: 'suite', value: suite },
    ],
    links: [
      {
        name: 'SonarCloud Dashboard',
        url: `${SONAR_BASE_URL}/dashboard?id=${encodeURIComponent(PROJECT_KEY)}`,
        type: 'link',
      },
    ],
  };
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Fetch Quality Gate status
  const qgData = await sonarFetch(
    `/api/qualitygates/project_status?projectKey=${encodeURIComponent(PROJECT_KEY)}`
  );
  const qgStatus = qgData.projectStatus.status; // OK, WARN, ERROR, NONE
  const qgConditions = qgData.projectStatus.conditions ?? [];

  // Quality Gate 条件の詳細をログ出力
  if (qgConditions.length > 0) {
    console.log('\nQuality Gate Conditions:');
    for (const c of qgConditions) {
      const icon = c.status === 'OK' ? '✓' : '✗';
      console.log(`  ${icon} ${c.metricKey}: actual=${c.actualValue} ${c.comparator} threshold=${c.errorThreshold} → ${c.status}`);
    }
  }

  // Fetch project measures
  const metricKeys = [
    'bugs',
    'vulnerabilities',
    'code_smells',
    'security_hotspots',
    'duplicated_lines_density',
    'ncloc',
  ].join(',');
  const measuresData = await sonarFetch(
    `/api/measures/component?component=${encodeURIComponent(PROJECT_KEY)}&metricKeys=${metricKeys}`
  );

  const measures = {};
  for (const m of measuresData.component.measures) {
    measures[m.metric] = m.value;
  }

  const results = [];

  // 1. Quality Gate
  const failedConditions = qgConditions.filter((c) => c.status !== 'OK');
  const qgMessage =
    qgStatus !== 'OK'
      ? [
          `Quality Gate status: ${qgStatus}.`,
          ...failedConditions.map(
            (c) => `  ${c.metricKey}: actual=${c.actualValue} (threshold ${c.comparator === 'GT' ? '<=' : '>='} ${c.errorThreshold})`
          ),
        ].join('\n')
      : undefined;
  results.push(
    createAllureResult({
      name: `Quality Gate: ${qgStatus === 'OK' ? 'Passed' : qgStatus}`,
      suite: 'Quality Gate',
      historyId: 'quality-gate',
      status: qgStatus === 'OK' ? 'passed' : 'failed',
      message: qgMessage,
    })
  );

  // 2. Bugs
  const bugs = parseInt(measures.bugs ?? '0', 10);
  results.push(
    createAllureResult({
      name: `Bugs: ${bugs}`,
      suite: 'Reliability',
      historyId: 'bugs',
      status: bugs === 0 ? 'passed' : 'failed',
      message: bugs > 0 ? `${bugs} bug(s) detected. Fix them to improve reliability.` : undefined,
    })
  );

  // 3. Vulnerabilities
  const vulns = parseInt(measures.vulnerabilities ?? '0', 10);
  results.push(
    createAllureResult({
      name: `Vulnerabilities: ${vulns}`,
      suite: 'Security',
      historyId: 'vulnerabilities',
      status: vulns === 0 ? 'passed' : 'failed',
      message:
        vulns > 0
          ? `${vulns} vulnerability(ies) detected. Fix them to improve security.`
          : undefined,
    })
  );

  // 4. Security Hotspots
  const hotspots = parseInt(measures.security_hotspots ?? '0', 10);
  results.push(
    createAllureResult({
      name: `Security Hotspots: ${hotspots}`,
      suite: 'Security',
      historyId: 'security-hotspots',
      status: hotspots === 0 ? 'passed' : 'failed',
      message:
        hotspots > 0
          ? `${hotspots} security hotspot(s) need review. Check SonarCloud for details.`
          : undefined,
    })
  );

  // 5. Code Smells (informational — always passed)
  const smells = parseInt(measures.code_smells ?? '0', 10);
  results.push(
    createAllureResult({
      name: `Code Smells: ${smells}`,
      suite: 'Maintainability',
      historyId: 'code-smells',
      status: 'passed',
      message: smells > 0 ? `${smells} code smell(s) detected.` : undefined,
    })
  );

  // 6. Duplicated Lines (informational)
  const duplication = measures.duplicated_lines_density ?? '0';
  results.push(
    createAllureResult({
      name: `Duplicated Lines: ${duplication}%`,
      suite: 'Maintainability',
      historyId: 'duplicated-lines',
      status: 'passed',
      message: `${duplication}% of lines are duplicated.`,
    })
  );

  // 7. Lines of Code (informational)
  const ncloc = measures.ncloc ?? '0';
  results.push(
    createAllureResult({
      name: `Lines of Code: ${parseInt(ncloc, 10).toLocaleString()}`,
      suite: 'Overview',
      historyId: 'lines-of-code',
      status: 'passed',
      message: `Total non-comment lines of code: ${parseInt(ncloc, 10).toLocaleString()}`,
    })
  );

  // Write results
  for (const result of results) {
    const filePath = `${OUTPUT_DIR}/${result.uuid}-result.json`;
    writeFileSync(filePath, JSON.stringify(result, null, 2));
  }

  console.log(`Generated ${results.length} Allure result(s) in ${OUTPUT_DIR}/`);

  // Summary
  console.log('\nSonarCloud Analysis Summary:');
  console.log(`  Quality Gate: ${qgStatus}`);
  console.log(`  Bugs: ${bugs}`);
  console.log(`  Vulnerabilities: ${vulns}`);
  console.log(`  Security Hotspots: ${hotspots}`);
  console.log(`  Code Smells: ${smells}`);
  console.log(`  Duplication: ${duplication}%`);
  console.log(`  Lines of Code: ${ncloc}`);
}

main().catch((err) => {
  console.error('Failed to generate Allure results from SonarCloud:', err.message);
  process.exit(1);
});
