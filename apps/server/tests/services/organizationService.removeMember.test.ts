import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal in-memory organization_members table supporting the two chains
// removeMember uses: select(...).eq*.maybeSingle() to look up the member
// before deleting, and delete().eq*() to remove the roster row.
const { fromMock, tableData } = vi.hoisted(() => {
  const tableData: Record<string, Array<Record<string, unknown>>> = {
    organization_members: [
      { id: 'm1', organization_id: 'o1', user_id: 'u1', character_id: 'char-1', character_name: 'Shy La' },
    ],
  };
  const fromMock = vi.fn((table: string) => {
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    const q: Record<string, unknown> = {
      select: () => q,
      delete: () => q,
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        return q;
      },
      maybeSingle: () => {
        const matched = (tableData[table] ?? []).filter((r) => filters.every((f) => f(r)));
        return Promise.resolve({ data: matched[0] ?? null, error: null });
      },
      then: (resolve: (v: { error: null }) => unknown) => {
        tableData[table] = (tableData[table] ?? []).filter((r) => !filters.every((f) => f(r)));
        return resolve({ error: null });
      },
    };
    return q;
  });
  return { fromMock, tableData };
});

vi.mock('../../src/services/supabaseClient', () => ({ supabaseAdmin: { from: fromMock } }));
vi.mock('../../src/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { organizationService } from '../../src/services/organizationService';

type WithRetraction = {
  retractMembershipKnowledge: (
    userId: string,
    organizationId: string,
    link: { characterId: string; characterName: string },
  ) => Promise<void>;
};

describe('organizationService.removeMember', () => {
  beforeEach(() => {
    fromMock.mockClear();
    tableData.organization_members = [
      { id: 'm1', organization_id: 'o1', user_id: 'u1', character_id: 'char-1', character_name: 'Shy La' },
    ];
  });

  it('deletes the roster row and retracts the membership fact for the removed character', async () => {
    const spy = vi
      .spyOn(organizationService as unknown as WithRetraction, 'retractMembershipKnowledge')
      .mockResolvedValue(undefined);

    await organizationService.removeMember('u1', 'o1', 'm1');

    expect(tableData.organization_members).toHaveLength(0);
    expect(spy).toHaveBeenCalledWith('u1', 'o1', { characterId: 'char-1', characterName: 'Shy La' });

    spy.mockRestore();
  });

  it('does not attempt retraction for a roster entry with no linked character', async () => {
    tableData.organization_members = [
      { id: 'm2', organization_id: 'o1', user_id: 'u1', character_id: null, character_name: 'Freeform Person' },
    ];
    const spy = vi
      .spyOn(organizationService as unknown as WithRetraction, 'retractMembershipKnowledge')
      .mockResolvedValue(undefined);

    await organizationService.removeMember('u1', 'o1', 'm2');

    expect(tableData.organization_members).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });
});
