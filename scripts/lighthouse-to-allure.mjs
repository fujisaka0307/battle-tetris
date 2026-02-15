#!/usr/bin/env node

/**
 * Converts Lighthouse CI JSON results into Allure result JSON files.
 *
 * Usage: node scripts/lighthouse-to-allure.mjs <lighthouse-result.json>
 *
 * Output: allure-results/lighthouse/*.json
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const INPUT_PATH = process.argv[2];
const OUTPUT_DIR = 'allure-results/lighthouse';

if (!INPUT_PATH) {
  console.error('Usage: node scripts/lighthouse-to-allure.mjs <lighthouse-result-dir-or-file>');
  process.exit(1);
}

const CATEGORY_THRESHOLDS = {
  performance: 0.5,
  accessibility: 0.7,
  'best-practices': 0.7,
  seo: 0.7,
};

function createAllureResult({ name, suite, historyId, status, message }) {
  const now = Date.now();
  return {
    uuid: randomUUID(),
    historyId,
    name,
    fullName: `lighthouse.${historyId}`,
    status,
    statusDetails: message ? { message } : undefined,
    stage: 'finished',
    start: now,
    stop: now + 1,
    labels: [
      { name: 'parentSuite', value: 'Lighthouse' },
      { name: 'suite', value: suite },
    ],
  };
}

function loadLighthouseResult(inputPath) {
  try {
    const content = readFileSync(inputPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    // May be a directory with .json files
    const files = readdirSync(inputPath).filter((f) => f.endsWith('.json'));
    if (files.length === 0) {
      console.error('No Lighthouse JSON files found in', inputPath);
      process.exit(1);
    }
    // Use the first result file (typically lhr-*.json)
    const lhrFile = files.find((f) => f.startsWith('lhr-')) || files[0];
    return JSON.parse(readFileSync(join(inputPath, lhrFile), 'utf-8'));
  }
}

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const lhr = loadLighthouseResult(INPUT_PATH);
  const categories = lhr.categories || {};
  const results = [];

  let allPassed = true;

  // Per-category scores
  for (const [catId, cat] of Object.entries(categories)) {
    const score = cat.score ?? 0;
    const percentage = Math.round(score * 100);
    const threshold = CATEGORY_THRESHOLDS[catId] ?? 0.5;
    const passed = score >= threshold;

    if (!passed) allPassed = false;

    results.push(
      createAllureResult({
        name: `${cat.title}: ${percentage}%`,
        suite: 'Scores',
        historyId: `lighthouse-${catId}`,
        status: passed ? 'passed' : 'failed',
        message: `Score: ${percentage}% (threshold: ${Math.round(threshold * 100)}%)`,
      })
    );
  }

  // Overall summary
  results.unshift(
    createAllureResult({
      name: `Lighthouse Audit: ${allPassed ? 'All categories passed' : 'Some categories below threshold'}`,
      suite: 'Summary',
      historyId: 'lighthouse-summary',
      status: allPassed ? 'passed' : 'failed',
      message: Object.entries(categories)
        .map(([, cat]) => `${cat.title}: ${Math.round((cat.score ?? 0) * 100)}%`)
        .join('\n'),
    })
  );

  // Key audits that failed
  const audits = lhr.audits || {};
  let failedAuditCount = 0;

  for (const [auditId, audit] of Object.entries(audits)) {
    if (audit.score !== null && audit.score < 0.5 && audit.scoreDisplayMode !== 'informative') {
      failedAuditCount++;
      if (failedAuditCount <= 20) {
        // Limit to top 20 failed audits to avoid noise
        results.push(
          createAllureResult({
            name: `[FAIL] ${audit.title}`,
            suite: 'Failed Audits',
            historyId: `lighthouse-audit-${auditId}`,
            status: 'failed',
            message: audit.description?.replace(/\[.*?\]\(.*?\)/g, '') || '',
          })
        );
      }
    }
  }

  if (failedAuditCount > 20) {
    results.push(
      createAllureResult({
        name: `... and ${failedAuditCount - 20} more failed audits`,
        suite: 'Failed Audits',
        historyId: 'lighthouse-audit-overflow',
        status: 'failed',
        message: `${failedAuditCount} total audits failed. Run Lighthouse locally for full details.`,
      })
    );
  }

  // Write results
  for (const result of results) {
    const filePath = `${OUTPUT_DIR}/${result.uuid}-result.json`;
    writeFileSync(filePath, JSON.stringify(result, null, 2));
  }

  console.log(`Generated ${results.length} Allure result(s) in ${OUTPUT_DIR}/`);
  console.log('\nLighthouse Summary:');
  for (const [, cat] of Object.entries(categories)) {
    console.log(`  ${cat.title}: ${Math.round((cat.score ?? 0) * 100)}%`);
  }
}

main();
