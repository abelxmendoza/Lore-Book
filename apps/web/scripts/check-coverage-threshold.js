#!/usr/bin/env node

/**
 * Check if coverage meets thresholds
 * Fails if coverage is below minimum requirements
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const coveragePath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');

if (!fs.existsSync(coveragePath)) {
  console.error('❌ Coverage summary not found. Run tests with coverage first.');
  process.exit(1);
}

const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
const totals = coverage.total;

const thresholds = {
  lines: 75,
  statements: 75,
  functions: 75,
  branches: 70
};

let failed = false;

console.log('📊 Coverage Check:\n');

for (const [metric, threshold] of Object.entries(thresholds)) {
  const actual = totals[metric].pct;
  const status = actual >= threshold ? '✅' : '❌';
  const color = actual >= threshold ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';
  
  console.log(`${status} ${metric.padEnd(12)}: ${color}${actual.toFixed(2)}%${reset} (threshold: ${threshold}%)`);
  
  if (actual < threshold) {
    failed = true;
  }
}

console.log('');

if (failed) {
  console.error('❌ Coverage thresholds not met!');
  console.error('Please improve test coverage before merging.');
  process.exit(1);
} else {
  console.log('✅ All coverage thresholds met!');
  process.exit(0);
}

