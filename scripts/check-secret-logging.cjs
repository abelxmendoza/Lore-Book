#!/usr/bin/env node

/**
 * No-raw-secret-logging guard.
 *
 * We exclude CodeQL's js/clear-text-logging query (it false-positives on ~520
 * benign userId/entityId UUID logs — see .github/codeql/codeql-config.yml). This
 * guard preserves the genuine protection that query was meant to provide: it
 * fails CI if a logger/console call emits a raw *credential* value.
 *
 * High-signal secret names only (compound names — bare `token`/`secret` are too
 * noisy: messageId tokens, csrf token names, etc. are everywhere and harmless).
 * Safe forms (redaction, truncation, boolean coercion, length) are allowed, and
 * an explicit `// secret-logging-ok` comment on the line is an escape hatch.
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const roots = ['apps/server/src', 'apps/server/scripts', 'scripts'];
const extensions = new Set(['.ts', '.tsx', '.js', '.cjs', '.mjs']);
const skipDirNames = new Set(['node_modules', 'dist', '.git', 'coverage', 'lib']);
const skipFiles = [/check-secret-logging\.cjs$/];

const logCall = /(?:logger\.(?:info|warn|error|debug|trace|fatal)|console\.(?:log|error|warn|info|debug))\s*\(/;

// Compound, high-signal credential identifiers (camelCase + snake_case).
const secretKey =
  /\b(password|passwordHash|password_hash|accessToken|access_token|refreshToken|refresh_token|apiKey|api_key|clientSecret|client_secret|serviceRole(?:Key)?|service_role(?:_key)?|privateKey|private_key|jwtSecret|jwt_secret)\b/;

// Forms that prove the value is NOT a raw secret.
const safeForms = [
  /\[REDACTED\]/i,
  /redact/i,
  /\.slice\(/,
  /\.substring\(/,
  /\.length/,
  /Boolean\(/,
  /!!/,
  /\bhas[A-Z]/,
  /\?\?\s*['"`]/,
  /\?\s*['"`]/, // ternary masking
  /typeof/,
  /secret-logging-ok/,
];

function walk(dir) {
  const absolute = path.join(repoRoot, dir);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return extensions.has(path.extname(absolute)) ? [absolute] : [];
  return fs.readdirSync(absolute).flatMap((entry) =>
    skipDirNames.has(entry) ? [] : walk(path.join(dir, entry))
  );
}

const violations = [];
for (const file of roots.flatMap(walk)) {
  const relative = path.relative(repoRoot, file);
  if (skipFiles.some((p) => p.test(relative))) continue;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!logCall.test(line)) return;
    if (!secretKey.test(line)) return;
    if (safeForms.some((p) => p.test(line))) return;
    violations.push(`${relative}:${index + 1} — ${line.trim()}`);
  });
}

if (violations.length > 0) {
  console.error('Secret-logging check FAILED.\n');
  console.error('Do not log raw credential values. Redact/truncate them, or add');
  console.error('a `// secret-logging-ok` comment if the value is provably safe.\n');
  for (const v of violations) console.error(`  • ${v}`);
  process.exit(1);
}

console.log('Secret-logging check passed.');
