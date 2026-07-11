import { describe, expect, it, vi, beforeEach } from 'vitest';

// In-memory character rows the mocked supabase client returns.
let ROWS: any[] = [];

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: ROWS, error: null }),
      }),
    }),
  },
}));

import { characterDeduplicationService } from './characterDeduplicationService';

function groupNames(groups: Awaited<ReturnType<typeof characterDeduplicationService.findDuplicateGroups>>) {
  return groups.map((g) => [g.canonicalName, ...g.members.map((m) => m.name)].sort());
}

describe('findDuplicateGroups — false-positive guards', () => {
  beforeEach(() => {
    ROWS = [];
  });

  it('does NOT merge a stage-named person into a relative who shares a first name', async () => {
    ROWS = [
      {
        id: 'obscurio',
        name: 'Obscurio Juan',
        alias: ['Oscuri', 'Juan'],
        metadata: { nameProfile: { nickname: 'Obscurio', givenName: 'Juan', kind: 'stage_name' } },
      },
      { id: 'tio-juan', name: 'Tío Rafa', alias: ['Juan'], metadata: {} },
    ];
    const groups = await characterDeduplicationService.findDuplicateGroups('u1');
    expect(groups).toHaveLength(0);
  });

  it('does NOT merge a relational placeholder into its anchor', async () => {
    ROWS = [
      { id: 'shana', name: 'Shana', alias: null, metadata: {} },
      { id: 'friend', name: 'friend of Shana', alias: ['Shana'], metadata: {} },
    ];
    const groups = await characterDeduplicationService.findDuplicateGroups('u1');
    expect(groups).toHaveLength(0);
  });

  it('respects confirmed_distinct_from even when first names match', async () => {
    ROWS = [
      { id: 'a', name: 'Juan', alias: [], metadata: { confirmed_distinct_from: ['b'] } },
      { id: 'b', name: 'Juan', alias: [], metadata: {} },
    ];
    const groups = await characterDeduplicationService.findDuplicateGroups('u1');
    expect(groups).toHaveLength(0);
  });

  it('still merges genuine duplicates (same full name)', async () => {
    ROWS = [
      { id: 'a', name: 'Maria Lopez', alias: [], metadata: {} },
      { id: 'b', name: 'Maria Lopez', alias: [], metadata: {} },
    ];
    const groups = await characterDeduplicationService.findDuplicateGroups('u1');
    expect(groups).toHaveLength(1);
    expect(groupNames(groups)[0]).toContain('Maria Lopez');
  });

  it('merges two cards for the same relational placeholder', async () => {
    ROWS = [
      { id: 'a', name: 'friend of Shana', alias: [], metadata: {} },
      { id: 'b', name: "Shana's friend", alias: [], metadata: {} },
    ];
    const groups = await characterDeduplicationService.findDuplicateGroups('u1');
    expect(groups).toHaveLength(1);
  });
});
