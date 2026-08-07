import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * addMember() must not pay for getOrganization()'s full aggregate fetch
 * (members/stories/events/locations + a 90-day analytics scan) just to check
 * that the group exists — that's the root cause of "adding people to groups"
 * timing out on an active/older group. It should do a cheap existence check
 * instead, and getOrganization() itself should never be invoked from this path.
 */

type OrgRow = { id: string; user_id: string; name: string };
type MemberRow = {
  id: string;
  organization_id: string;
  user_id: string;
  character_id: string | null;
  character_name: string;
  role?: string;
  status?: string;
};
type CharacterRow = { id: string; user_id: string; name: string };

const state = vi.hoisted(() => ({
  organizations: [] as OrgRow[],
  members: [] as MemberRow[],
  characters: [] as CharacterRow[],
  nextMemberId: 1,
}));

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const filters: Array<(r: Record<string, unknown>) => boolean> = [];
      let insertPayload: Record<string, unknown> | null = null;

      const rowsFor = (): Record<string, unknown>[] => {
        if (table === 'organizations') return state.organizations as unknown as Record<string, unknown>[];
        if (table === 'organization_members') return state.members as unknown as Record<string, unknown>[];
        if (table === 'characters') return state.characters as unknown as Record<string, unknown>[];
        return [];
      };
      const filtered = () => rowsFor().filter((r) => filters.every((f) => f(r)));

      const q: Record<string, any> = {
        select: () => q,
        eq: (col: string, val: unknown) => {
          filters.push((r) => r[col] === val);
          return q;
        },
        is: (col: string, val: unknown) => {
          filters.push((r) => (val === null ? r[col] == null : r[col] === val));
          return q;
        },
        ilike: (col: string, val: string) => {
          filters.push((r) => String(r[col] ?? '').toLowerCase() === String(val).toLowerCase());
          return q;
        },
        insert: (payload: Record<string, unknown>) => {
          insertPayload = payload;
          return q;
        },
        maybeSingle: async () => ({ data: filtered()[0] ?? null, error: null }),
        single: async () => {
          if (insertPayload) {
            const row = { id: `m${state.nextMemberId++}`, ...insertPayload } as MemberRow;
            state.members.push(row);
            return { data: row, error: null };
          }
          return { data: filtered()[0] ?? null, error: null };
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

describe('organizationService.addMember — existence check cost', () => {
  beforeEach(() => {
    state.organizations = [{ id: 'org-1', user_id: 'user-1', name: 'Popular E-Girls' }];
    state.members = [];
    state.characters = [{ id: 'char-1', user_id: 'user-1', name: 'Mothdoll' }];
    state.nextMemberId = 1;
    vi.spyOn(organizationService as any, 'solidifyMembershipKnowledge').mockResolvedValue(undefined);
  });

  it('links an existing Character Book person without ever calling the full getOrganization aggregate', async () => {
    const getOrgSpy = vi.spyOn(organizationService, 'getOrganization');

    const member = await organizationService.addMember('user-1', 'org-1', {
      character_id: 'char-1',
      character_name: 'Mothdoll',
      role: 'Member',
      status: 'active',
    });

    expect(member.character_id).toBe('char-1');
    expect(member.character_name).toBe('Mothdoll');
    expect(getOrgSpy).not.toHaveBeenCalled();

    getOrgSpy.mockRestore();
  });

  it('still 404s when the group does not exist, without invoking getOrganization', async () => {
    const getOrgSpy = vi.spyOn(organizationService, 'getOrganization');

    await expect(
      organizationService.addMember('user-1', 'org-missing', {
        character_id: 'char-1',
        character_name: 'Mothdoll',
        status: 'active',
      }),
    ).rejects.toThrow(/Group not found/);
    expect(getOrgSpy).not.toHaveBeenCalled();

    getOrgSpy.mockRestore();
  });
});
