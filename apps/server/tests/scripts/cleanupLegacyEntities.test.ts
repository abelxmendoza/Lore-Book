import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Integration + e2e tests for the salvaged `people_places` cleanup script
 * (cleanupLegacyEntities.ts), which consolidates the former fixEntityQuality /
 * promoteOrphanLocations / reExtractEntities scripts. This logic gates the
 * `people_places` table retirement, so it is covered before deletion.
 */

type State = {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
  count: boolean;
  eq: Array<[string, unknown]>;
  ilike: Array<[string, unknown]>;
  or?: string;
  in?: [string, unknown[]];
  updatePayload?: Record<string, unknown>;
};

type Resp = { data?: unknown; error?: unknown; count?: number };

const h = vi.hoisted(() => {
  const routes: Record<string, (s: unknown) => Resp> = {};

  function makeBuilder(table: string) {
    const state: State = { table, op: 'select', count: false, eq: [], ilike: [] };
    const resolve = (): Resp => {
      const fn = routes[table];
      return fn ? fn(state) : { data: [], error: null };
    };
    const builder: Record<string, unknown> = {
      select: vi.fn((_cols?: unknown, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head || opts?.count) state.count = true;
        return builder;
      }),
      insert: vi.fn(() => ((state.op = 'insert'), builder)),
      update: vi.fn((payload: Record<string, unknown>) => ((state.op = 'update'), (state.updatePayload = payload), builder)),
      upsert: vi.fn(() => ((state.op = 'upsert'), builder)),
      delete: vi.fn(() => ((state.op = 'delete'), builder)),
      eq: vi.fn((c: string, v: unknown) => (state.eq.push([c, v]), builder)),
      in: vi.fn((c: string, v: unknown[]) => ((state.in = [c, v]), builder)),
      ilike: vi.fn((c: string, v: unknown) => (state.ilike.push([c, v]), builder)),
      or: vi.fn((s: string) => ((state.or = s), builder)),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      then: (onF: (v: Resp) => unknown, onR?: (e: unknown) => unknown) =>
        Promise.resolve(resolve()).then(onF, onR),
    };
    return builder;
  }

  const supabaseAdmin = { from: vi.fn((t: string) => makeBuilder(t)) };
  const recordEntitiesForEntry = vi.fn(async () => undefined);
  const resolveCanonicalLocationId = vi.fn(async () => 'loc-canonical');
  const logInfo = vi.fn();
  const logger = { info: logInfo, warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

  return {
    supabaseAdmin,
    recordEntitiesForEntry,
    resolveCanonicalLocationId,
    logger,
    logInfo,
    setRoute: (table: string, fn: (s: State) => Resp) => {
      routes[table] = fn as (s: unknown) => Resp;
    },
    reset: () => {
      for (const k of Object.keys(routes)) delete routes[k];
      supabaseAdmin.from.mockClear();
      recordEntitiesForEntry.mockClear();
      resolveCanonicalLocationId.mockClear();
      logInfo.mockClear();
    },
  };
});

vi.mock('../../src/config', () => ({}));
vi.mock('../../src/services/supabaseClient', () => ({ supabaseAdmin: h.supabaseAdmin }));
vi.mock('../../src/services/peoplePlacesService', () => ({
  peoplePlacesService: { recordEntitiesForEntry: h.recordEntitiesForEntry },
}));
vi.mock('../../src/services/locationMergeService', () => ({
  locationMergeService: { resolveCanonicalLocationId: h.resolveCanonicalLocationId },
}));
vi.mock('../../src/logger', () => ({ logger: h.logger }));

import {
  norm,
  findOrphans,
  promoteUser,
  listUserIds,
  reExtractAllEntries,
  fixQuality,
  runCleanup,
} from '../../src/scripts/cleanupLegacyEntities';

beforeEach(() => {
  h.reset();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('cleanupLegacyEntities — norm (unit)', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(norm('  Paris   France ')).toBe('paris france');
    expect(norm('CAFÉ')).toBe('café');
  });
});

describe('cleanupLegacyEntities — findOrphans (integration)', () => {
  it('returns only places without a canonical locations row', async () => {
    h.setRoute('people_places', () => ({
      data: [
        { id: 'p1', name: 'Paris', type: 'place' },
        { id: 'p2', name: 'Cafe X', type: 'place' },
      ],
    }));
    h.setRoute('locations', () => ({ data: [{ normalized_name: 'paris' }] }));

    const orphans = await findOrphans('user-1');
    expect(orphans.map((o) => o.id)).toEqual(['p2']); // Paris already canonical
  });

  it('returns an empty array when every place is canonical', async () => {
    h.setRoute('people_places', () => ({ data: [{ id: 'p1', name: 'Rome', type: 'place' }] }));
    h.setRoute('locations', () => ({ data: [{ normalized_name: 'rome' }] }));
    expect(await findOrphans('user-1')).toEqual([]);
  });
});

describe('cleanupLegacyEntities — promoteUser (integration)', () => {
  beforeEach(() => {
    h.setRoute('people_places', () => ({ data: [{ id: 'p2', name: 'Cafe X', type: 'place' }] }));
    h.setRoute('locations', () => ({ data: [] }));
  });

  it('dry-run reports orphans but never promotes', async () => {
    const r = await promoteUser('user-1', true);
    expect(r).toEqual({ orphans: 1, promoted: 0 });
    expect(h.resolveCanonicalLocationId).not.toHaveBeenCalled();
  });

  it('execute promotes each orphan via the canonical resolver', async () => {
    const r = await promoteUser('user-1', false);
    expect(r).toEqual({ orphans: 1, promoted: 1 });
    expect(h.resolveCanonicalLocationId).toHaveBeenCalledExactlyOnceWith('user-1', 'p2');
  });

  it('counts zero promoted when the resolver returns null', async () => {
    h.resolveCanonicalLocationId.mockResolvedValueOnce(null as unknown as string);
    const r = await promoteUser('user-1', false);
    expect(r).toEqual({ orphans: 1, promoted: 0 });
  });
});

describe('cleanupLegacyEntities — listUserIds (integration)', () => {
  const ORIGINAL = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it('returns the explicit user id without querying', async () => {
    expect(await listUserIds(false, 'explicit-id')).toEqual(['explicit-id']);
    expect(h.supabaseAdmin.from).not.toHaveBeenCalled();
  });

  it('falls back to ADMIN_USER_ID when not all-users and no explicit id', async () => {
    process.env.ADMIN_USER_ID = 'admin-1';
    delete process.env.OWNER_USER_ID;
    expect(await listUserIds(false)).toEqual(['admin-1']);
  });

  it('throws when no target can be determined', async () => {
    delete process.env.ADMIN_USER_ID;
    delete process.env.OWNER_USER_ID;
    await expect(listUserIds(false)).rejects.toThrow(/ADMIN_USER_ID/);
  });

  it('lists unique, sorted user ids for --all-users', async () => {
    h.setRoute('people_places', () => ({
      data: [{ user_id: 'b' }, { user_id: 'a' }, { user_id: 'b' }, { user_id: '' }],
    }));
    expect(await listUserIds(true)).toEqual(['a', 'b']);
  });
});

describe('cleanupLegacyEntities — reExtractAllEntries (integration)', () => {
  it('re-extracts every journal entry and tolerates a failing one', async () => {
    h.setRoute('journal_entries', () => ({
      data: [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }],
    }));
    h.recordEntitiesForEntry.mockRejectedValueOnce(new Error('extract failed')); // e1 fails

    const count = await reExtractAllEntries();
    expect(count).toBe(2); // e2 + e3 succeed; e1 logged + skipped
    expect(h.recordEntitiesForEntry).toHaveBeenCalledTimes(3);
  });

  it('returns 0 and logs when the entries query errors', async () => {
    h.setRoute('journal_entries', () => ({ data: null, error: new Error('db down') }));
    expect(await reExtractAllEntries()).toBe(0);
    expect(h.recordEntitiesForEntry).not.toHaveBeenCalled();
  });
});

describe('cleanupLegacyEntities — fixQuality (e2e)', () => {
  it('deletes false positives, merges fragments, and fixes types', async () => {
    let countCall = 0;
    h.setRoute('people_places', (s) => {
      // before/after counts
      if (s.count) {
        countCall += 1;
        return { count: countCall === 1 ? 10 : 7 };
      }
      // Step 2 fetch of a merge group (select '*' with .or)
      if (s.op === 'select' && s.or) {
        if (s.or.includes('Abel')) {
          return {
            data: [
              {
                id: 'c1',
                name: 'Abel Mendoza',
                total_mentions: 2,
                related_entries: ['j1'],
                corrected_names: [],
                first_mentioned_at: '2024-01-01',
                last_mentioned_at: '2024-02-01',
              },
              {
                id: 'a1',
                name: 'Abel',
                total_mentions: 1,
                related_entries: ['j2'],
                corrected_names: [],
                first_mentioned_at: '2023-12-01',
                last_mentioned_at: '2024-01-15',
              },
            ],
          };
        }
        return { data: [] };
      }
      // Step 1 false-positive deletes (delete + ilike + select id)
      if (s.op === 'delete' && s.ilike.length) {
        return { data: s.ilike[0][1] === 'I' ? [{ id: 'fp1' }] : [] };
      }
      // Step 2 delete of merged aliases (delete + in)
      if (s.op === 'delete' && s.in) return { data: [], error: null };
      // Step 2 update of canonical row / Step 3 type fix (update)
      if (s.op === 'update') {
        if (s.ilike.length) return { data: s.ilike[0][1] === 'Epirus' ? [{ id: 't1' }] : [] };
        return { error: null };
      }
      return { data: [] };
    });

    // fixQuality now refuses to run cross-user; an explicit userId is required.
    await fixQuality(['test-user-1']);

    const summary = h.logInfo.mock.calls.find(
      (c) => c[1] === '=== ENTITY QUALITY BACKFILL COMPLETE ===',
    );
    expect(summary).toBeDefined();
    const payload = summary![0] as { before: number; after: number; deleted: number; merged: number; typesFixed: number };
    expect(payload.before).toBe(10);
    expect(payload.after).toBe(7);
    expect(payload.deleted).toBe(1); // only "I" matched
    expect(payload.merged).toBe(1); // alias a1 merged into c1
    expect(payload.typesFixed).toBe(1); // only "Epirus"
  });
});

describe('cleanupLegacyEntities — runCleanup (dispatch)', () => {
  it('throws on an unknown subcommand', async () => {
    await expect(runCleanup(['nope'])).rejects.toThrow(/Usage: cleanupLegacyEntities/);
  });

  it('dispatches "reextract"', async () => {
    h.setRoute('journal_entries', () => ({ data: [{ id: 'e1' }] }));
    await runCleanup(['reextract']);
    expect(h.recordEntitiesForEntry).toHaveBeenCalledOnce();
  });

  it('dispatches "promote-locations" in dry-run without promoting', async () => {
    h.setRoute('people_places', () => ({ data: [{ id: 'p2', name: 'Cafe X', type: 'place' }] }));
    h.setRoute('locations', () => ({ data: [] }));
    await runCleanup(['promote-locations', '--dry-run', 'user-9']);
    expect(h.resolveCanonicalLocationId).not.toHaveBeenCalled();
  });
});
