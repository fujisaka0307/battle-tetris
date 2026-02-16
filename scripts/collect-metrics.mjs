#!/usr/bin/env node

/**
 * Collects CI/CD metrics from Allure results and appends them to a history file.
 *
 * Usage: node scripts/collect-metrics.mjs <allure-results-dir> [existing-history.json]
 * Output: metrics-history.json (in current working directory)
 *
 * Parses allure-results to extract test counts, code quality metrics,
 * security findings, and Lighthouse scores. Maintains a rolling 1-year history.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RESULTS_DIR = process.argv[2] || 'allure-results';
const EXISTING_HISTORY = process.argv[3] || '';
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

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

function getLabel(result, labelName) {
  return result.labels?.find((l) => l.name === labelName)?.value || '';
}

function extractNumber(str) {
  const match = str.match(/:\s*(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

function extractPercentage(str) {
  const match = str.match(/(\d+(?:\.\d+)?)%/);
  return match ? parseFloat(match[1]) : null;
}

function collectMetrics(results) {
  const ci = {
    unitTests: { total: 0, passed: 0, failed: 0 },
    e2eTests: { total: 0, passed: 0, failed: 0 },
  };

  const quality = {
    coverage: null,
    bugs: null,
    codeSmells: null,
    duplication: null,
    qualityGate: null,
  };

  const security = {
    vulnerabilities: null,
    securityHotspots: null,
    zapAlerts: { high: 0, medium: 0, low: 0 },
    codeqlFindings: null,
    gitleaksFindings: null,
    npmAudit: { critical: 0, high: 0, moderate: 0, low: 0 },
  };

  const lighthouse = {
    performance: null,
    accessibility: null,
    bestPractices: null,
    seo: null,
  };

  for (const result of results) {
    const parentSuite = getLabel(result, 'parentSuite');
    const suite = getLabel(result, 'suite');
    const name = result.name || '';
    const status = result.status || '';

    // Unit tests
    if (parentSuite === 'ユニットテスト' || parentSuite === 'unit tests' || parentSuite === 'Unit Tests') {
      ci.unitTests.total++;
      if (status === 'passed') ci.unitTests.passed++;
      else if (status === 'failed' || status === 'broken') ci.unitTests.failed++;
    }

    // E2E tests
    if (parentSuite === 'E2Eテスト' || parentSuite.toLowerCase().includes('e2e')) {
      ci.e2eTests.total++;
      if (status === 'passed') ci.e2eTests.passed++;
      else if (status === 'failed' || status === 'broken') ci.e2eTests.failed++;
    }

    // SonarCloud metrics
    if (parentSuite === 'SonarCloud') {
      if (name.toLowerCase().includes('bug')) {
        const val = extractNumber(name);
        if (val !== null) quality.bugs = val;
      }
      if (name.toLowerCase().includes('vulnerabilit')) {
        const val = extractNumber(name);
        if (val !== null) security.vulnerabilities = val;
      }
      if (name.toLowerCase().includes('code smell')) {
        const val = extractNumber(name);
        if (val !== null) quality.codeSmells = val;
      }
      if (name.toLowerCase().includes('duplicat')) {
        const val = extractPercentage(name) ?? extractNumber(name);
        if (val !== null) quality.duplication = val;
      }
      if (name.toLowerCase().includes('coverage')) {
        const val = extractPercentage(name) ?? extractNumber(name);
        if (val !== null) quality.coverage = val;
      }
      if (name.toLowerCase().includes('quality gate')) {
        quality.qualityGate = status === 'passed' ? 'OK' : 'FAIL';
      }
      if (name.toLowerCase().includes('security hotspot')) {
        const val = extractNumber(name);
        if (val !== null) security.securityHotspots = val;
      }
    }

    // OWASP ZAP
    if (parentSuite === 'OWASP ZAP' && suite === 'By Risk Level') {
      const nameLower = name.toLowerCase();
      if (nameLower.includes('high')) {
        const val = extractNumber(name);
        if (val !== null) security.zapAlerts.high = val;
      }
      if (nameLower.includes('medium')) {
        const val = extractNumber(name);
        if (val !== null) security.zapAlerts.medium = val;
      }
      if (nameLower.includes('low')) {
        const val = extractNumber(name);
        if (val !== null) security.zapAlerts.low = val;
      }
    }

    // CodeQL
    if (parentSuite === 'CodeQL') {
      if (name.toLowerCase().includes('security') && name.toLowerCase().includes('finding')) {
        const val = extractNumber(name);
        if (val !== null) security.codeqlFindings = val;
      } else if (security.codeqlFindings === null && name.toLowerCase().includes('finding')) {
        const val = extractNumber(name);
        if (val !== null) security.codeqlFindings = val;
      }
    }

    // Gitleaks
    if (parentSuite === 'Gitleaks') {
      if (security.gitleaksFindings === null) security.gitleaksFindings = 0;
      if (status === 'failed') security.gitleaksFindings++;
    }

    // npm audit
    if (parentSuite === 'npm audit' && suite === 'By Severity') {
      const nameLower = name.toLowerCase();
      if (nameLower.includes('critical')) {
        const val = extractNumber(name);
        if (val !== null) security.npmAudit.critical = val;
      }
      if (nameLower.includes('high')) {
        const val = extractNumber(name);
        if (val !== null) security.npmAudit.high = val;
      }
      if (nameLower.includes('moderate')) {
        const val = extractNumber(name);
        if (val !== null) security.npmAudit.moderate = val;
      }
      if (nameLower.includes('low')) {
        const val = extractNumber(name);
        if (val !== null) security.npmAudit.low = val;
      }
    }

    // Lighthouse
    if (parentSuite === 'Lighthouse' && suite === 'Scores') {
      const nameLower = name.toLowerCase();
      if (nameLower.includes('performance')) {
        const val = extractPercentage(name);
        if (val !== null) lighthouse.performance = val;
      }
      if (nameLower.includes('accessibility')) {
        const val = extractPercentage(name);
        if (val !== null) lighthouse.accessibility = val;
      }
      if (nameLower.includes('best') && nameLower.includes('practice')) {
        const val = extractPercentage(name);
        if (val !== null) lighthouse.bestPractices = val;
      }
      if (nameLower.includes('seo')) {
        const val = extractPercentage(name);
        if (val !== null) lighthouse.seo = val;
      }
    }
  }

  return { ci, quality, security, lighthouse };
}

function main() {
  const results = loadAllureResults(RESULTS_DIR);
  console.log(`Loaded ${results.length} allure result(s) from ${RESULTS_DIR}`);

  const metrics = collectMetrics(results);

  // Load existing history
  let history = { entries: [] };
  if (EXISTING_HISTORY) {
    try {
      history = JSON.parse(readFileSync(EXISTING_HISTORY, 'utf-8'));
      console.log(`Loaded existing history with ${history.entries.length} entries`);
    } catch {
      console.log('No existing history found, starting fresh');
    }
  }

  // Create new entry
  const entry = {
    timestamp: new Date().toISOString(),
    commit: process.env.GITHUB_SHA?.substring(0, 7) || 'local',
    runId: process.env.GITHUB_RUN_ID || '0',
    ...metrics,
  };

  history.entries.push(entry);

  // Prune entries older than 1 year
  const cutoff = Date.now() - ONE_YEAR_MS;
  const beforePrune = history.entries.length;
  history.entries = history.entries.filter(
    (e) => new Date(e.timestamp).getTime() > cutoff,
  );
  const pruned = beforePrune - history.entries.length;
  if (pruned > 0) {
    console.log(`Pruned ${pruned} entries older than 1 year`);
  }

  // Write output
  writeFileSync('metrics-history.json', JSON.stringify(history, null, 2));
  console.log(`Written metrics-history.json with ${history.entries.length} entries`);
  console.log('Latest entry:', JSON.stringify(entry, null, 2));
}

main();
