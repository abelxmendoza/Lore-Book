import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Every person on an org People roster must resolve that org in
 * getOrganizationsByCharacter (Character modal Connections → Groups).
 */

type MemberRow = {
  id: string;
  organization_id: string;
  character_id: string | null;
  character_name: string;
  role?: string;
  status?: string;
};

const state = vi.hoisted(() => {
  const members: MemberRow[] = [];
  const characters: Array<{ id: string; name: string; alias?: string[] }> = [];
  return { members, characters };
});

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const q: Record<string, any> = {
        select: () => q,
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return q;
        },
        is: (col: string, val: unknown) => {
          filters[`${col}__is`] = val;
          return q;
        },
        ilike: (col: string, val: string) => {
          filters[`${col}__ilike`] = val;
          return q;
        },
        in: () => q,
        neq: () => q,
        order: () => q,
        limit: () => q,
        update: (patch: Record<string, unknown>) => {
          filters.__update = patch;
          return q;
        },
        delete: () => q,
        maybeSingle: async () => {
          if (table === 'characters') {
            const id = filters.id as string | undefined;
            const nameIlike = filters['name__ilike'] as string | undefined;
            if (id) {
              const row = state.characters.find((c) => c.id === id) ?? null;
              return { data: row, error: null };
            }
            if (nameIlike) {
              const matches = state.characters.filter(
                (c) => c.name.toLowerCase() === nameIlike.toLowerCase(),
              );
              return { data: matches[0] ?? null, error: null };
            }
            return { data: null, error: null };
          }
          if (table === 'organization_members') {
            let rows = [...state.members];
            if (filters.user_id) rows = rows.filter(() => true);
            if (filters.organization_id) {
              rows = rows.filter((m) => m.organization_id === filters.organization_id);
            }
            if (filters.character_id) {
              rows = rows.filter((m) => m.character_id === filters.character_id);
            }
            if (filters['character_id__is'] === null) {
              rows = rows.filter((m) => m.character_id == null);
            }
            if (filters['character_name__ilike']) {
              const needle = String(filters['character_name__ilike']).toLowerCase();
              rows = rows.filter((m) => m.character_name.toLowerCase() === needle);
            }
            if (filters.id) rows = rows.filter((m) => m.id === filters.id);
            if (filters.__update && rows[0]) {
              Object.assign(rows[0], filters.__update);
              return { data: rows[0], error: null };
            }
            return { data: rows[0] ?? null, error: null };
          }
          return { data: null, error: null };
        },
        single: async () => q.maybeSingle(),
        then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
          if (table === 'characters') {
            return resolve({ data: state.characters, error: null });
          }
          if (table === 'organization_members') {
            let rows = [...state.members];
            if (filters.character_id) {
              rows = rows.filter((m) => m.character_id === filters.character_id);
            }
            if (filters['character_name__ilike']) {
              const needle = String(filters['character_name__ilike']).toLowerCase();
              rows = rows.filter((m) => m.character_name.toLowerCase() === needle);
            }
            if (filters.organization_id) {
              rows = rows.filter((m) => m.organization_id === filters.organization_id);
            }
            return resolve({
              data: rows.map((m) => ({ organization_id: m.organization_id, ...m })),
              error: null,
            });
          }
          return resolve({ data: [], error: null });
        },
      };
      return q;
    },
  },
}));

vi.mock('../../src/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { organizationService } from '../../src/services/organizationService';

describe('organization roster ↔ character Groups bidirectional', () => {
  beforeEach(() => {
    state.members.length = 0;
    state.characters.length = 0;
    state.characters.push(
      { id: 'char-marcus', name: 'Marcus Chen' },
      { id: 'char-jamie', name: 'Jamie' },
      { id: 'char-taylor', name: 'Taylor Nguyen', alias: ['Tay'] },
    );
    // Amazon roster: one linked, one first-name-only, one alias-only label
    state.members.push(
      {
        id: 'm1',
        organization_id: 'org-amazon',
        character_id: 'char-marcus',
        character_name: 'Marcus Chen',
        role: 'engineer',
        status: 'active',
      },
      {
        id: 'm2',
        organization_id: 'org-amazon',
        character_id: null,
        character_name: 'Jamie',
        role: 'designer',
        status: 'active',
      },
      {
        id: 'm3',
        organization_id: 'org-amazon',
        character_id: null,
        character_name: 'Tay',
        role: 'pm',
        status: 'active',
      },
    );
    vi.spyOn(organizationService as any, 'getOrganizationsChunked').mockResolvedValue([
      {
        id: 'org-amazon',
        name: 'Amazon',
        members: state.members,
      },
    ]);
  });

  it('returns Amazon for every roster person (linked id, exact name, alias)', async () => {
    for (const person of [
      { id: 'char-marcus', name: 'Marcus Chen' },
      { id: 'char-jamie', name: 'Jamie' },
      { id: 'char-taylor', name: 'Taylor Nguyen' },
    ]) {
      const orgs = await organizationService.getOrganizationsByCharacter(
        'user-1',
        person.id,
        person.name,
      );
      expect(orgs.map((o) => o.id)).toContain('org-amazon');
      expect(orgs.find((o) => o.id === 'org-amazon')?.name).toBe('Amazon');
    }
  });

  it('auto-links name-only roster rows when uniquely matched in Character Book', async () => {
    const linked = await (organizationService as any).linkNameOnlyMembers(
      'user-1',
      'org-amazon',
      state.members,
    );
    const jamie = linked.find((m: MemberRow) => m.id === 'm2');
    const taylor = linked.find((m: MemberRow) => m.id === 'm3');
    expect(jamie?.character_id).toBe('char-jamie');
    expect(taylor?.character_id).toBe('char-taylor');
    expect(taylor?.character_name).toBe('Taylor Nguyen');
  });
});
