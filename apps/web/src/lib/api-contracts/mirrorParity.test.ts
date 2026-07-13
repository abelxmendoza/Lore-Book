/**
 * Prevents drift between packages/api-contracts and the Vercel vendored mirror.
 * Source of truth: packages/api-contracts/src/**
 * Mirror: apps/web/src/lib/api-contracts/**
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const monorepoRoot = path.resolve(__dirname, '../../../../../');
const packageSrc = path.join(monorepoRoot, 'packages/api-contracts/src');
const mirrorSrc = path.join(monorepoRoot, 'apps/web/src/lib/api-contracts');

const FILES = [
  'index.ts',
  'envelopes.ts',
  'chat/durability.ts',
  'chat/streamEvents.ts',
  // ingestion is package-primary; mirror must include after sync
  'ingestion/common.ts',
  'ingestion/semanticGuards.ts',
  'ingestion/jobPayloads.ts',
  'ingestion/envelope.ts',
  'ingestion/index.ts',
] as const;

function stripHeaderComments(src: string): string {
  return src
    .replace(/^\/\*[\s\S]*?\*\/\s*/m, '')
    .replace(/^\/\/.*$/gm, '')
    .trim();
}

describe('api-contracts mirror parity', () => {
  const packageExists = fs.existsSync(packageSrc);

  it('documents package as source of truth when present', () => {
    // On Vercel only the mirror exists — skip strict compare.
    if (!packageExists) {
      expect(fs.existsSync(mirrorSrc)).toBe(true);
      return;
    }
    expect(fs.existsSync(packageSrc)).toBe(true);
    expect(fs.existsSync(mirrorSrc)).toBe(true);
  });

  it.skipIf(!packageExists)('mirror files match package (normalized)', () => {
    const missing: string[] = [];
    const mismatched: string[] = [];
    for (const rel of FILES) {
      const a = path.join(packageSrc, rel);
      const b = path.join(mirrorSrc, rel);
      if (!fs.existsSync(a)) {
        missing.push(`package:${rel}`);
        continue;
      }
      if (!fs.existsSync(b)) {
        missing.push(`mirror:${rel}`);
        continue;
      }
      const pa = stripHeaderComments(fs.readFileSync(a, 'utf8'));
      const pb = stripHeaderComments(fs.readFileSync(b, 'utf8'));
      if (pa !== pb) mismatched.push(rel);
    }
    expect({ missing, mismatched }).toEqual({ missing: [], mismatched: [] });
  });
});
