import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * getOrganizationsByCharacter must match character_id links AND legacy
 * name-only roster rows so Character modal ↔ Groups modal stay in sync.
 * Uses separate queries (not PostgREST or) so names with spaces never break lookup.
 */
const { fromMock, queries, characterSelects } = vi.hoisted(() => {
  const queries: Array<{ table: string; eqs: Array<[string, unknown]>; ilikes: Array<[string, string]> }> = [];
  const characterSelects: string[] = [];
  const fromMock = vi.fn((table: string) => {
    const state = { table, eqs: [] as Array<[string, unknown]>, ilikes: [] as Array<[string, string]> };
    const q: Record<string, unknown> = {
      select: (columns: string) => {
        if (table === 'characters') characterSelects.push(columns);
        return q;
      },
      eq: (col: string, val: unknown) => {
        state.eqs.push([col, val]);
        return q;
      },
      ilike: (col: string, val: string) => {
        state.ilikes.push([col, val]);
        return q;
      },
      limit: () => q,
      maybeSingle: () =>
        Promise.resolve({
          data:
            table === 'characters'
              ? { name: 'Jamie S.', alias: ['Jamie'] }
              : null,
          error: null,
        }),
      then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
        queries.push(state);
        if (table === 'organization_members') {
          return resolve({
            data: [{ organization_id: 'org-amazon' }],
            error: null,
          });
        }
        if (table === 'characters') {
          return resolve({ data: [{ id: 'char-jamie', name: 'Jamie S.', alias: ['Jamie'] }], error: null });
        }
        return resolve({ data: [], error: null });
      },
    };
    return q;
  });
  return { fromMock, queries, characterSelects };
});

vi.mock('../../src/services/supabaseClient', () => ({ supabaseAdmin: { from: fromMock } }));
vi.mock('../../src/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { organizationService } from '../../src/services/organizationService';

describe('organizationService.getOrganizationsByCharacter', () => {
  beforeEach(() => {
    fromMock.mockClear();
    queries.length = 0;
    characterSelects.length = 0;
    vi.spyOn(organizationService as any, 'getOrganizationsChunked').mockResolvedValue([
      { id: 'org-amazon', name: 'Amazon', members: [] },
    ]);
  });

  it('queries by character_id and name candidates separately (no fragile or filter)', async () => {
    const orgs = await organizationService.getOrganizationsByCharacter(
      'user-1',
      'char-jamie',
      'Jamie S.',
    );

    const memberQueries = queries.filter((q) => q.table === 'organization_members');
    expect(memberQueries.some((q) => q.eqs.some(([c, v]) => c === 'character_id' && v === 'char-jamie'))).toBe(
      true,
    );
    const nameNeedles = memberQueries.flatMap((q) => q.ilikes.filter(([c]) => c === 'character_name').map(([, v]) => v));
    expect(nameNeedles).toEqual(expect.arrayContaining(['Jamie S.', 'Jamie']));
    expect(orgs).toHaveLength(1);
    expect(orgs[0]?.name).toBe('Amazon');
  });

  it('resolves name + aliases from characters table when only id is provided', async () => {
    await organizationService.getOrganizationsByCharacter('user-1', 'char-jamie');

    expect(characterSelects).toContain('name, alias');
    expect(characterSelects.some((columns) => /\baliases\b/.test(columns))).toBe(false);
    const memberQueries = queries.filter((q) => q.table === 'organization_members');
    expect(memberQueries.some((q) => q.eqs.some(([c, v]) => c === 'character_id' && v === 'char-jamie'))).toBe(
      true,
    );
    const nameNeedles = memberQueries.flatMap((q) => q.ilikes.filter(([c]) => c === 'character_name').map(([, v]) => v));
    expect(nameNeedles).toEqual(expect.arrayContaining(['Jamie S.', 'Jamie']));
  });

  it('still finds memberships when the display name has spaces', async () => {
    const orgs = await organizationService.getOrganizationsByCharacter(
      'user-1',
      'char-jamie',
      'Jamie S.',
    );

    const nameNeedles = queries
      .filter((q) => q.table === 'organization_members')
      .flatMap((q) => q.ilikes.filter(([c]) => c === 'character_name').map(([, v]) => v));
    expect(nameNeedles).toContain('Jamie S.');
    expect(orgs).toHaveLength(1);
  });
});
