#!/usr/bin/env tsx
/**
 * Runtime Health Check
 *
 * Audits the backend codebase for structural health indicators.
 * Run: npx tsx scripts/runtime-health.ts
 * Output: docs/runtime/runtime-health-report.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const REPORT_PATH = path.join(ROOT, '..', '..', 'docs', 'runtime', 'runtime-health-report.md');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findFiles(dir: string, ext: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
      results.push(...findFiles(full, ext));
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

function readFile(p: string): string {
  return fs.readFileSync(p, 'utf-8');
}

function rel(p: string): string {
  return p.replace(ROOT + '/', '');
}

function grepCount(pattern: RegExp, files: string[]): number {
  return files.reduce((n, f) => {
    const content = readFile(f);
    const matches = content.match(pattern);
    return n + (matches?.length ?? 0);
  }, 0);
}

function grepMatches(pattern: RegExp, files: string[]): Array<{ file: string; line: number; text: string }> {
  const results: Array<{ file: string; line: number; text: string }> = [];
  for (const f of files) {
    const lines = readFile(f).split('\n');
    lines.forEach((text, i) => {
      if (pattern.test(text)) {
        results.push({ file: rel(f), line: i + 1, text: text.trim() });
      }
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const tsFiles = findFiles(SRC, '.ts').filter(f => !f.endsWith('.test.ts') && !f.endsWith('.spec.ts'));
const testFiles = findFiles(SRC, '.test.ts');
const routeFiles = findFiles(path.join(SRC, 'routes'), '.ts');

// 1. Unsafe any usage
const unsafeAny = grepMatches(/\bas\s+any\b|:\s*any\b|<any>/, tsFiles);

// 2. ts-ignore / ts-expect-error
const suppressions = grepMatches(/\/\/\s*@ts-(ignore|expect-error)/, tsFiles);

// 3. Missing router exports (route files that don't export a router)
const routesWithoutExport = routeFiles.filter(f => {
  const content = readFile(f);
  return !content.includes('export') || (!content.includes('Router') && !content.includes('router'));
});

// 4. Routes importing from ../../web (cross-package boundary violations)
const crossPackageImports = grepMatches(/from\s+['"]\.\.\/\.\.\/web/, tsFiles);

// 5. console.log usage (should use logger)
const consoleLogs = grepMatches(/console\.(log|warn|error|info)\(/, tsFiles).filter(m => {
  // Allow in scripts and test files
  return !m.file.includes('/scripts/') && !m.file.includes('.test.ts');
});

// 6. Top-level await outside IIFE (now should be wrapped)
const topLevelAwait = grepMatches(/^await\s+/, tsFiles);

// 7. Import from 'any' typed supabase without extraction helpers
const rawSupabaseAccess = grepMatches(/const\s*\{[^}]*data[^}]*\}\s*=\s*await\s+supabase/, tsFiles);

// 8. Routes without auth middleware check
const routesWithoutAuth = routeFiles.filter(f => {
  const content = readFile(f);
  const hasRouter = content.includes('router.') || content.includes('Router()');
  const hasAuth = content.includes('requireAuth') || content.includes('authMiddleware') || content.includes('optionalAuth');
  return hasRouter && !hasAuth;
});

// 9. Try to detect orphan service files (services not imported by any route or job)
const serviceFiles = findFiles(path.join(SRC, 'services'), '.ts')
  .filter(f => !f.endsWith('.test.ts') && !f.endsWith('index.ts'));

const allSourceContent = tsFiles.map(f => readFile(f)).join('\n');
const orphanServices = serviceFiles.filter(f => {
  const basename = path.basename(f, '.ts');
  // Check if this service is imported anywhere
  return !allSourceContent.includes(`/${basename}'`) && !allSourceContent.includes(`/${basename}"`);
}).slice(0, 20); // cap at 20 for report legibility

// 10. TS error count (run tsc, parse output)
let tscErrorCount = 0;
let tscOutput = '';
try {
  tscOutput = execSync('npx tsc --noEmit 2>&1 || true', { cwd: ROOT, encoding: 'utf-8' });
  const errorMatches = tscOutput.match(/error TS/g);
  tscErrorCount = errorMatches?.length ?? 0;
} catch {
  tscErrorCount = -1;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const now = new Date().toISOString().split('T')[0];

const report = `# Runtime Health Report
**Generated:** ${now}

---

## Summary

| Check | Result |
|-------|--------|
| TypeScript errors (tsc --noEmit) | ${tscErrorCount === -1 ? '⚠️ Could not run' : tscErrorCount > 0 ? `🔴 ${tscErrorCount}` : '✅ 0'} |
| Unsafe \`as any\` usages | ${unsafeAny.length > 0 ? `🟡 ${unsafeAny.length}` : '✅ 0'} |
| @ts-ignore suppressions | ${suppressions.length > 0 ? `🟡 ${suppressions.length}` : '✅ 0'} |
| Cross-package imports (server→web) | ${crossPackageImports.length > 0 ? `🔴 ${crossPackageImports.length}` : '✅ 0'} |
| console.log in production code | ${consoleLogs.length > 0 ? `🟡 ${consoleLogs.length}` : '✅ 0'} |
| Routes without auth check | ${routesWithoutAuth.length > 0 ? `🟡 ${routesWithoutAuth.length}` : '✅ 0'} |
| Orphan services (sample) | ${orphanServices.length > 0 ? `🟡 ${orphanServices.length}` : '✅ 0'} |
| Top-level await outside IIFE | ${topLevelAwait.length > 0 ? `🔴 ${topLevelAwait.length}` : '✅ 0'} |

---

## Cross-Package Imports (CRITICAL)

${crossPackageImports.length === 0 ? '_None detected._' : crossPackageImports.map(m =>
  `- \`${m.file}:${m.line}\` — \`${m.text}\``
).join('\n')}

---

## @ts-ignore / @ts-expect-error Suppressions

${suppressions.length === 0 ? '_None detected._' : suppressions.map(m =>
  `- \`${m.file}:${m.line}\` — \`${m.text}\``
).join('\n')}

---

## Unsafe \`as any\` Usages (first 30)

${unsafeAny.length === 0 ? '_None detected._' : unsafeAny.slice(0, 30).map(m =>
  `- \`${m.file}:${m.line}\``
).join('\n')}${unsafeAny.length > 30 ? `\n\n_...and ${unsafeAny.length - 30} more._` : ''}

---

## console.log in Production Code (first 20)

${consoleLogs.length === 0 ? '_None detected._' : consoleLogs.slice(0, 20).map(m =>
  `- \`${m.file}:${m.line}\` — \`${m.text}\``
).join('\n')}${consoleLogs.length > 20 ? `\n\n_...and ${consoleLogs.length - 20} more._` : ''}

---

## Routes Without Auth Middleware

${routesWithoutAuth.length === 0 ? '_All route files reference auth middleware._' : routesWithoutAuth.map(f =>
  `- \`${rel(f)}\``
).join('\n')}

> Note: Public routes legitimately have no auth. Review this list and mark intended public routes with \`requiresAuth: false\` in routeRegistry.ts.

---

## Potential Orphan Services (sample, max 20)

${orphanServices.length === 0 ? '_None detected in sample._' : orphanServices.map(f =>
  `- \`${rel(f)}\``
).join('\n')}

> Note: This is a heuristic — a service not found by filename search may still be imported via index barrel.

---

## TypeScript Error Count Over Time

| Date | Error Count |
|------|------------|
| ${now} | ${tscErrorCount} |

> Track this table to measure stabilization progress.
`;

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, report, 'utf-8');
console.log(`✅ Runtime health report written to: ${REPORT_PATH}`);
console.log(`   TypeScript errors: ${tscErrorCount}`);
console.log(`   Cross-package imports: ${crossPackageImports.length}`);
console.log(`   Unsafe as-any usages: ${unsafeAny.length}`);
console.log(`   @ts-ignore suppressions: ${suppressions.length}`);
