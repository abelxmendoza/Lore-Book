#!/usr/bin/env node
/**
 * TypeScript error ratchet — the repo has hundreds of pre-existing tsc errors
 * (server ~733, web ~302), so a bare `tsc --noEmit` in CI fails on every push
 * and gets ignored. This compares current errors against a committed baseline
 * and fails only when NEW errors appear, so the count can only go down.
 *
 * Run: node scripts/check-tsc-baseline.mjs [server|web|all]
 *      node scripts/check-tsc-baseline.mjs all --update-baseline
 *
 * Errors are fingerprinted as `file::TScode` with a count — line numbers
 * churn too much to be stable keys. A file/code pair whose count grows, or a
 * pair not in the baseline, fails the check. Improvements print a reminder
 * to tighten the baseline.
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');
const BASELINE_PATH = resolve(__dir, 'tsc-baseline.json');

const APPS = { server: 'apps/server', web: 'apps/web' };
const target = process.argv[2] && process.argv[2] !== '--update-baseline' ? process.argv[2] : 'all';
const UPDATE_BASELINE = process.argv.includes('--update-baseline');
const apps = target === 'all' ? Object.keys(APPS) : [target];

if (apps.some(a => !APPS[a])) {
  console.error(`Unknown target "${target}" — use server, web, or all`);
  process.exit(1);
}

/** Run tsc in an app dir; return { 'file::TScode': count } */
function collectErrors(app) {
  let output = '';
  try {
    execSync('npx tsc --noEmit', { cwd: resolve(ROOT, APPS[app]), encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    output = (err.stdout ?? '') + (err.stderr ?? '');
  }
  const counts = {};
  for (const line of output.split('\n')) {
    const m = line.match(/^(.+?)\(\d+,\d+\): error (TS\d+):/);
    if (!m) continue;
    const key = `${m[1]}::${m[2]}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

const current = {};
for (const app of apps) {
  process.stdout.write(`type-checking ${app}… `);
  current[app] = collectErrors(app);
  const total = Object.values(current[app]).reduce((a, b) => a + b, 0);
  console.log(`${total} errors`);
}

if (UPDATE_BASELINE) {
  const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : {};
  for (const app of apps) baseline[app] = current[app];
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`Baseline updated for: ${apps.join(', ')}`);
  process.exit(0);
}

if (!existsSync(BASELINE_PATH)) {
  console.error('✗ No baseline found — run with --update-baseline first.');
  process.exit(1);
}
const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));

let failed = false;
let improved = 0;

for (const app of apps) {
  const base = baseline[app] ?? {};
  const cur = current[app];

  const regressions = [];
  for (const [key, count] of Object.entries(cur)) {
    const allowed = base[key] ?? 0;
    if (count > allowed) regressions.push({ key, count, allowed });
  }
  for (const [key, allowed] of Object.entries(base)) {
    const count = cur[key] ?? 0;
    if (count < allowed) improved += allowed - count;
  }

  if (regressions.length) {
    failed = true;
    console.error(`\n✗ ${app}: NEW TypeScript errors beyond baseline:`);
    for (const r of regressions) {
      const [file, code] = r.key.split('::');
      console.error(`    ${file} ${code}: ${r.count} (baseline ${r.allowed})`);
    }
  }
}

if (failed) {
  console.error('\nFix the new errors, or if intentional run: node scripts/check-tsc-baseline.mjs all --update-baseline');
  process.exit(1);
}

console.log(`✓ No new TypeScript errors.${improved ? ` ${improved} error(s) fixed since baseline — consider --update-baseline to lock in the improvement.` : ''}`);
