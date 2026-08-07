import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * addMember used to call full getOrganization (members + stories + analytics +
 * name-only linking) just to verify ownership. That hydration regularly blew
 * past the web client's 30s timeout when adding someone from the Character modal.
 */

const { fromMock, tableData, selectCalls } = vi.hoisted(() => {
  const tableData: Record<string, Array<Record<string, unknown>>> = {
    organizations: [{ id: 'org-1', user_id: 'u1', name: 'Vanguard Robotics' }],
    characters: [{ id: 'char-1', user_id: 'u1', name: 'Marcus' }],
    organization_members: [],
  };
  const selectCalls: string[] = [];

  const fromMock = vi.fn((table: string) => {
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    let selectedCols = '*';
    let pendingUpdate: Record<string, unknown> | null = null;
    let pendingInsert: Record<string, unknown> | null = null;
    let isSingle = false;
    let isMaybeSingle = false;

    const applyFilters = () => (tableData[table] ?? []).filter((r) => filters.every((f) => f(r)));

    const finish = () => {
      if (pendingInsert) {
        const row = { id: `m-${Date.now()}`, ...pendingInsert };
        tableData[table] = [...(tableData[table] ?? []), row];
        pendingInsert = null;
        return { data: row, error: null };
      }
      if (pendingUpdate) {
        const matched = applyFilters();
        const target = matched[0];
        if (target) Object.assign(target, pendingUpdate);
        pendingUpdate = null;
        return { data: target ?? null, error: null };
      }
      const matched = applyFilters();
      if (isSingle || isMaybeSingle) {
        return { data: matched[0] ?? null, error: matched[0] ? null : (isSingle ? { message: 'not found' } : null) };
      }
      return { data: matched, error: null };
    };

    const q: Record<string, unknown> = {
      select: (cols?: string) => {
        selectedCols = cols ?? '*';
        selectCalls.push(`${table}:${selectedCols}`);
        return q;
      },
      insert: (row: Record<string, unknown>) => {
        pendingInsert = row;
        return q;
      },
      update: (row: Record<string, unknown>) => {
        pendingUpdate = row;
        return q;
      },
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        return q;
      },
      is: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        return q;
      },
      ilike: (col: string, val: unknown) => {
        filters.push((r) => String(r[col] ?? '').toLowerCase() === String(val).toLowerCase());
        return q;
      },
      maybeSingle: () => {
        isMaybeSingle = true;
        return Promise.resolve(finish());
      },
      single: () => {
        isSingle = true;
        return Promise.resolve(finish());
      },
      then: (resolve: (v: { data: unknown; error: null }) => unknown) => resolve(finish()),
    };
    return q;
  });

  return { fromMock, tableData, selectCalls };
});

vi.mock('../../src/services/supabaseClient', () => ({ supabaseAdmin: { from: fromMock } }));
vi.mock('../../src/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../src/services/groupAnalyticsService', () => ({
  groupAnalyticsService: { calculateAnalytics: vi.fn() },
}));

import { organizationService } from '../../src/services/organizationService';

describe('organizationService.addMember', () => {
  beforeEach(() => {
    tableData.organization_members = [];
    selectCalls.length = 0;
    fromMock.mockClear();
    vi.spyOn(organizationService as any, 'solidifyMembershipKnowledge').mockResolvedValue(undefined);
  });

  it('verifies org ownership with a lightweight id/name select (not full hydration)', async () => {
    const getOrganizationSpy = vi.spyOn(organizationService, 'getOrganization');

    const member = await organizationService.addMember('u1', 'org-1', {
      character_id: 'char-1',
      character_name: 'Marcus',
      role: 'member',
      status: 'active',
    });

    expect(getOrganizationSpy).not.toHaveBeenCalled();
    expect(selectCalls.some((c) => c.startsWith('organizations:id, name'))).toBe(true);
    expect(member.character_id).toBe('char-1');
    expect(member.character_name).toBe('Marcus');
    expect(tableData.organization_members).toHaveLength(1);

    getOrganizationSpy.mockRestore();
  });

  it('returns 404-shaped error when the group is missing', async () => {
    await expect(
      organizationService.addMember('u1', 'missing-org', {
        character_id: 'char-1',
        character_name: 'Marcus',
        status: 'active',
      }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/Group not found/i),
      statusCode: 404,
    });
  });
});
