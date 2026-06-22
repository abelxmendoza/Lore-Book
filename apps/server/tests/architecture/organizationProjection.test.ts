import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ORG_COLS,
  ORG_EVENT_COLS,
  ORG_LIST_SELECT_BY_TABLE,
  ORG_LIST_TABLES,
  ORG_LOCATION_COLS,
  ORG_MEMBER_COLS,
  ORG_STORY_COLS,
} from '../../src/db/organizationColumns';

/**
 * Egress guard: listOrganizations must not regress to select('*') on org-family
 * tables. Each list miss fans out to 5 projected reads; shipping audit columns
 * on child rows or future fat columns via star-select would restore egress.
 */

const SERVER_SRC = join(__dirname, '../../src');

function readSrc(relativePath: string): string {
  return readFileSync(join(SERVER_SRC, relativePath), 'utf8');
}

function countSelectStar(src: string, table: string): number {
  const re = new RegExp(`\\.from\\('${table}'\\)[\\s\\S]{0,80}?\\.select\\('\\*'\\)`, 'g');
  return (src.match(re) ?? []).length;
}

describe('Egress projection guard (organizationColumns)', () => {
  it('defines explicit column lists for every org list table', () => {
    for (const table of ORG_LIST_TABLES) {
      expect(ORG_LIST_SELECT_BY_TABLE[table]).toBeTruthy();
      expect(ORG_LIST_SELECT_BY_TABLE[table]).not.toBe('*');
    }
  });

  it('child column lists omit audit fields not used by API consumers', () => {
    for (const cols of [ORG_MEMBER_COLS, ORG_STORY_COLS, ORG_EVENT_COLS, ORG_LOCATION_COLS]) {
      expect(cols.split(',').map((c) => c.trim())).not.toContain('created_at');
      expect(cols.split(',').map((c) => c.trim())).not.toContain('updated_at');
    }
  });
});

describe('Egress projection guard (organizationService list path)', () => {
  const src = readSrc('services/organizationService.ts');

  it('loadOrganizationsFromDb uses projected selects, not star', () => {
    expect(src).toContain('select(ORG_COLS)');
    expect(src).toContain('select(ORG_MEMBER_COLS)');
    expect(src).toContain('select(ORG_STORY_COLS)');
    expect(src).toContain('select(ORG_EVENT_COLS)');
    expect(src).toContain('select(ORG_LOCATION_COLS)');
  });

  it('does not select(*) on org list tables inside loadOrganizationsFromDb', () => {
    const loadBlock = src.match(
      /private async loadOrganizationsFromDb[\s\S]*?(?=async getOrganization|async createOrganization)/
    )?.[0];
    expect(loadBlock, 'loadOrganizationsFromDb block').toBeTruthy();
    for (const table of ORG_LIST_TABLES) {
      expect(countSelectStar(loadBlock!, table)).toBe(0);
    }
  });

  it('coalesces concurrent cache misses via orgListInflight', () => {
    expect(src).toContain('orgListInflight');
    expect(src).toMatch(/orgListInflight\.get\(userId\)/);
  });
});
