#!/usr/bin/env node

/**
 * Demo Mode privacy guard.
 *
 * Mock/demo content must be fictional. This check intentionally scans the
 * high-risk demo data surfaces and blocks known real-account strings from
 * being committed into reusable Demo Mode fixtures.
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');

const filesToScan = [
  'apps/web/src/mocks',
  'apps/web/src/components/characters/CharacterBook.tsx',
  'apps/web/src/components/organizations/OrganizationsBook.tsx',
  'apps/web/src/components/skills/SkillsBook.tsx',
  'apps/web/src/components/love',
  'apps/web/src/components/groups',
  'apps/web/src/components/family',
];

const blockedTerms = [
  'abelxmendoza@gmail.com',
  'firefistabel@gmail.com',
  '789bd607-e063-466f-a9ef-f68d24e8bb57',
  'Sol',
  'Mendoza',
  'Ortiz',
  'Tía Lourdes',
  'Tia Lourdes',
  'Lourdes',
  'Juan',
  'Abuela',
  'Rafeh',
  'Qazi',
  'Kforce',
  'Amazon',
  'Clever Programmer',
  'Kelly',
  'Bathroom Guardian',
  'San Bernardino',
  'Zephyrine',
  'Quillborn',
  'Quillborne',
  'Quintessa',
  'Vexworth',
  'Smith Rock',
  'Hell Fairy',
  'Mr. Chino',
  'Chino',
  'Club Metro',
  'SpaceX',
  'Derrik',
  'BrightHire',
  'Northstar',
  'Ashford-Luna',
  'Ashford',
  'Muay Thai',
  'Chipotle',
  'El Pollo Loco',
  // Inner-circle people/places from the founder's real lore — never in demo data.
  'Genni',
  'Shyla',
  'Oscuridad',
  'Skasby',
  'Skallejeros',
  'Bad Dogg',
  'RaveLa',
  'Gothicumbia',
  'A_BrownRecluse',
  'Ska Prom',
];

const allowedLinePatterns = [
  /© 2025 Abel Mendoza/,
  /BAD_MEMBER_NAMES/,
  /POLLUTED_CANDIDATE_TERMS/,
  /displayNameHasFamilyTitle/,
  /relationshipSignalsFor/,
  /kinship word detection/i,
  /\/\\b\(\?:my\|his\|her/,
  /\/\\^\(\?:my\\s\+\)\?\(\?:t\[ií\]o/,
  /Preserve honorific-led names like/,
];

const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.json']);

function walk(targetPath) {
  const absolute = path.join(repoRoot, targetPath);
  if (!fs.existsSync(absolute)) return [];

  const stat = fs.statSync(absolute);
  if (stat.isFile()) return extensions.has(path.extname(absolute)) ? [absolute] : [];

  return fs.readdirSync(absolute).flatMap((entry) => walk(path.join(targetPath, entry)));
}

function lineHasBlockedTerm(line) {
  if (allowedLinePatterns.some((pattern) => pattern.test(line))) return null;

  // Only scan quoted string literals — skip RegExp and other code that mentions kinship words.
  const stringLiterals = [...line.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/g)].map((match) => match[2]);
  if (stringLiterals.length === 0) return null;

  for (const literal of stringLiterals) {
    const term = blockedTerms.find((blocked) => new RegExp(`\\b${escapeRegExp(blocked)}\\b`, 'i').test(literal));
    if (term) return term;
  }

  return null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const violations = [];

for (const file of filesToScan.flatMap(walk)) {
  const relative = path.relative(repoRoot, file);
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

  lines.forEach((line, index) => {
    const term = lineHasBlockedTerm(line);
    if (term) {
      violations.push(`${relative}:${index + 1} contains blocked demo-data term "${term}"`);
    }
  });
}

if (violations.length > 0) {
  console.error('Demo data privacy check failed. Mock/Demo Mode data must be fictional.');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('Demo data privacy check passed.');
