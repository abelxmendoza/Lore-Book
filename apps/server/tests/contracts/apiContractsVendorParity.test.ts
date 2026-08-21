/**
 * Prevents drift between packages/api-contracts and the server vendored copy.
 * Source of truth: packages/api-contracts/src/**
 * Vendor: apps/server/vendor/api-contracts/src/**
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const monorepoRoot = path.resolve(__dirname, '../../../..');
const packageSrc = path.join(monorepoRoot, 'packages/api-contracts/src');
const vendorSrc = path.join(monorepoRoot, 'apps/server/vendor/api-contracts/src');

const FILES = [
  'index.ts',
  'envelopes.ts',
  'chat/durability.ts',
  'chat/streamEvents.ts',
  'chat/closedScopeIntent.ts',
  'chat/closedScopeIntent.test.ts',
  'chat/namedChatSubject.ts',
  'chat/namedChatSubject.test.ts',
  'characters/characterQuery.ts',
  'organizations/organizationQuery.ts',
  'family/familyQuery.ts',
  'locations/locationQuery.ts',
  'romance/romanceQuery.ts',
  'projects/projectQuery.ts',
  'skills/skillQuery.ts',
  'quests/questQuery.ts',
  'books/bookQuery.ts',
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

describe('api-contracts vendor parity', () => {
  const packageExists = fs.existsSync(packageSrc);

  it('documents package as source of truth when present', () => {
    if (!packageExists) {
      expect(fs.existsSync(vendorSrc)).toBe(true);
      return;
    }
    expect(fs.existsSync(packageSrc)).toBe(true);
    expect(fs.existsSync(vendorSrc)).toBe(true);
  });

  it.skipIf(!packageExists)('vendor files match package (normalized)', () => {
    const missing: string[] = [];
    const mismatched: string[] = [];
    for (const rel of FILES) {
      const a = path.join(packageSrc, rel);
      const b = path.join(vendorSrc, rel);
      if (!fs.existsSync(a)) {
        missing.push(`package:${rel}`);
        continue;
      }
      if (!fs.existsSync(b)) {
        missing.push(`vendor:${rel}`);
        continue;
      }
      const pa = stripHeaderComments(fs.readFileSync(a, 'utf8'));
      const pb = stripHeaderComments(fs.readFileSync(b, 'utf8'));
      if (pa !== pb) mismatched.push(rel);
    }
    expect({ missing, mismatched }).toEqual({ missing: [], mismatched: [] });
  });
});
