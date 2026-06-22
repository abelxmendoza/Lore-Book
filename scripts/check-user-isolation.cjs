#!/usr/bin/env node

/**
 * User-isolation guard (tenant-boundary regression check).
 *
 * The server uses the service-role Supabase client almost everywhere, which
 * BYPASSES Row-Level Security. That makes the API layer the *only* boundary
 * between one user's data and another's. So a route that scopes a query by a
 * CLIENT-SUPPLIED user id (req.query/body/params.userId) instead of the
 * JWT-verified req.user.id is a cross-user data-access (IDOR) hole with no DB
 * backstop.
 *
 * Today only admin tooling does this (and is admin-gated). This guard locks that
 * invariant in so a future non-admin route can't silently reintroduce it.
 *
 * A flagged line is allowed only if EITHER:
 *   - the route file is admin-gated (contains `requireAdmin`), OR
 *   - the line (or the line above) carries an explicit `// user-isolation-ok`
 *     waiver explaining why it is safe.
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const routesDir = path.join(repoRoot, 'apps/server/src/routes');

const CLIENT_USERID_RE = /req\.(?:query|body|params)\.(?:userId|user_id)\b/;
const WAIVER_RE = /user-isolation-ok/;
const ADMIN_GATE_RE = /requireAdmin/;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() && full.endsWith('.ts') && !full.endsWith('.test.ts') ? [full] : [];
  });
}

const violations = [];

for (const file of walk(routesDir)) {
  const src = fs.readFileSync(file, 'utf8');
  const isAdminGated = ADMIN_GATE_RE.test(src);
  if (isAdminGated) continue; // admin tooling may look up other users by id

  const lines = src.split('\n');
  lines.forEach((line, i) => {
    if (!CLIENT_USERID_RE.test(line)) return;
    const waived = WAIVER_RE.test(line) || (i > 0 && WAIVER_RE.test(lines[i - 1]));
    if (waived) return;
    violations.push({
      file: path.relative(repoRoot, file),
      line: i + 1,
      text: line.trim(),
    });
  });
}

if (violations.length > 0) {
  console.error('\nUser-isolation guard FAILED.\n');
  console.error(
    'A non-admin route scopes a query by a client-supplied user id. Use the\n' +
      'JWT-verified req.user.id, or admin-gate the route (requireAdmin), or add a\n' +
      '// user-isolation-ok comment explaining why it is safe.\n',
  );
  for (const v of violations) {
    console.error(`  • ${v.file}:${v.line} — ${v.text}`);
  }
  console.error('');
  process.exit(1);
}

console.log('User-isolation guard passed.');
