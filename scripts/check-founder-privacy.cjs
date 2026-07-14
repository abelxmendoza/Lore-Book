#!/usr/bin/env node

/**
 * Founder / personal-lore privacy guard.
 *
 * Tier 1 — entire repo (apps + scripts): founder emails and UUIDs
 * Tier 2 — scripts/, apps/web mocks, and test fixtures: high-specificity personal lore strings
 *
 * Tests and production LLM prompts may still contain kinship examples (Abuela);
 * those are tracked for a separate sanitization pass. Tier 1 stops account identity leaks.
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

const tier1Roots = ['apps/server/src', 'apps/server/scripts', 'apps/web/src', 'scripts'];
const tier2Roots = ['scripts', 'apps/web/src/mocks', 'apps/server/src/services/memoryQuality/fixtures', 'apps/server/src/services/continuityAlive'];
const tier2TestRoots = ['apps/server', 'apps/web'];
const publicSimulationRoots = ['apps/web/src/features/chat/services/chatLifecycleSimulation.ts'];

const skipFiles = [/check-founder-privacy\.cjs$/, /check-demo-data-privacy\.cjs$/];

const blockedExact = [
  'abelxmendoza@gmail.com',
  'firefistabel@gmail.com',
  '789bd607-e063-466f-a9ef-f68d24e8bb57',
];

const blockedInLiterals = [
  'Stimkybun',
  'Dollyfied',
  'Hell Fairy',
  'Baby Bats',
  'Oscuridad',
  'Tío Juan',
  'SonicBoomBox',
  'Shyla',
  'Vilevo',
  'Genni',
  'Ashley De La Cruz',
  'De La Cruz',
  'Club Metro',
  'Building LoreBook',
  'Bathroom Guardian',
  'Armstrong Robotics',
  'Armstrong',
  // Founder coworkers (distinctive names only — common first names would
  // false-positive across the codebase).
  'Kaustubh',
  'Wiriya',
  'Xingpeng',
  'Jimani',
];

// Founder-linked personal lore that may exist in private/admin or legacy mock
// contexts but must never appear in the public guest/demo chat showcase.
const blockedPublicSimulationLiterals = [
  'Maya',
  'Anime Expo',
  'Catch One',
];

const allowedLinePatterns = [
  /check-founder-privacy/,
  /founderGuard/,
  /OWNER_EMAIL|FOUNDER_EMAIL|DEVELOPER_EMAIL/,
  /blockedExact|blockedInLiterals/,
  /founder-data-isolation/,
];

const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs']);

const skipDirNames = new Set(['node_modules', 'dist', '.git', 'coverage', 'lib']);

function walk(dir, testFilesOnly = false) {
  const absolute = path.join(repoRoot, dir);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (stat.isFile()) {
    if (!extensions.has(path.extname(absolute))) return [];
    if (testFilesOnly && !/\.test\.(ts|tsx)$/.test(absolute)) return [];
    return [absolute];
  }
  return fs.readdirSync(absolute).flatMap((entry) => {
    if (skipDirNames.has(entry)) return [];
    return walk(path.join(dir, entry), testFilesOnly);
  });
}

function escapeRegExp(v) {
  return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scanLine(line, tier) {
  if (allowedLinePatterns.some((p) => p.test(line))) return null;

  for (const exact of blockedExact) {
    if (line.includes(exact)) return exact;
  }

  if (tier < 2) return null;

  const literals = [...line.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2]);
  const blockedTerms = tier >= 3
    ? [...blockedInLiterals, ...blockedPublicSimulationLiterals]
    : blockedInLiterals;
  for (const literal of literals) {
    for (const term of blockedTerms) {
      if (new RegExp(escapeRegExp(term), 'i').test(literal)) return term;
    }
  }
  return null;
}

function scanRoots(files, tier) {
  const violations = [];
  for (const file of files) {
    const relative = path.relative(repoRoot, file);
    if (skipFiles.some((p) => p.test(relative))) continue;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      const term = scanLine(line, tier);
      if (term) violations.push(`${relative}:${index + 1} — "${term}"`);
    });
  }
  return violations;
}

const tier1 = scanRoots(tier1Roots.flatMap((d) => walk(d)), 1);
const tier2 = scanRoots([
  ...tier2Roots.flatMap((d) => walk(d)),
  ...tier2TestRoots.flatMap((d) => walk(d, true)),
], 2);
const publicSimulation = scanRoots(publicSimulationRoots.flatMap((d) => walk(d)), 3);
const violations = [...tier1, ...tier2, ...publicSimulation];

if (violations.length > 0) {
  console.error('Founder privacy check FAILED.\n');
  console.error('Never commit founder emails/UUIDs. Keep personal lore seeds in .private/ (gitignored).\n');
  for (const v of violations) console.error(`  • ${v}`);
  process.exit(1);
}

console.log('Founder privacy check passed.');
