import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Shared mock state in vi.hoisted so the hoisted vi.mock factories can see it.
const h = vi.hoisted(() => {
  const inserts: any[] = [];
  const recoverRelationshipGraph = vi.fn(async () => ({
    created: 3, updated: 0, pairs: 3, fromMemories: 1, fromFacts: 1, fromChat: 1, fromOrganizations: 0, repaired: 0,
  }));
  const recoverMissingEvents = vi.fn(async () => ({ created: 3, skipped: 0, matched: ['x', 'y', 'z'] }));
  return { inserts, recoverRelationshipGraph, recoverMissingEvents };
});

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    from() {
      return {
        insert(row: any) {
          h.inserts.push(row);
          return Promise.resolve({ error: null });
        },
      };
    },
  },
}));
vi.mock('../relationshipFoundationService', () => ({
  relationshipFoundationService: { recoverRelationshipGraph: h.recoverRelationshipGraph },
}));
vi.mock('../eventRecoveryService', () => ({
  eventRecoveryService: { recoverMissingEvents: h.recoverMissingEvents },
}));
vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { graphRecoveryTrigger } from './graphRecoveryTrigger';

const { recoverRelationshipGraph, recoverMissingEvents, inserts } = h;
let uid = 0;
const nextUser = () => `user-${++uid}`;

beforeEach(() => {
  inserts.length = 0;
  recoverRelationshipGraph.mockClear();
  recoverMissingEvents.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('graphRecoveryTrigger.runNow — shared live/batch logic', () => {
  it('invokes BOTH recovery services (connects them to the runtime)', async () => {
    const u = nextUser();
    await graphRecoveryTrigger.runNow(u);
    expect(recoverRelationshipGraph).toHaveBeenCalledWith(u);
    expect(recoverMissingEvents).toHaveBeenCalledWith(u);
  });

  it('derives created counts + changed flag from stats (no count(*) probes)', async () => {
    const result = await graphRecoveryTrigger.runNow(nextUser());
    expect(result.relationships.created).toBe(3);
    expect(result.events.created).toBe(3);
    expect(result.changed).toBe(true);
    expect(result.status).toBe('completed');
  });

  it('records a diagnostics row ONLY when the graph changed', async () => {
    await graphRecoveryTrigger.runNow(nextUser());
    expect(inserts.filter((r) => r.job_id?.startsWith('graph-recovery:'))).toHaveLength(1);
  });

  it('writes NO diagnostics row on a no-op run (egress/disk efficiency)', async () => {
    recoverRelationshipGraph.mockResolvedValueOnce({ created: 0, updated: 0, pairs: 0, fromMemories: 0, fromFacts: 0, fromChat: 0, fromOrganizations: 0, repaired: 0 });
    recoverMissingEvents.mockResolvedValueOnce({ created: 0, skipped: 5, matched: [] });
    const result = await graphRecoveryTrigger.runNow(nextUser());
    expect(result.changed).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it('treats pure re-UPDATEs of existing rows as no-growth (no diagnostics write)', async () => {
    // Real-world already-recovered case: the relationship service re-touches 57
    // existing rows every run but creates nothing new. Must NOT write a diag row.
    recoverRelationshipGraph.mockResolvedValueOnce({ created: 0, updated: 57, pairs: 0, fromMemories: 0, fromFacts: 0, fromChat: 0, fromOrganizations: 0, repaired: 0 });
    recoverMissingEvents.mockResolvedValueOnce({ created: 0, skipped: 8, matched: [] });
    const result = await graphRecoveryTrigger.runNow(nextUser());
    expect(result.relationships.updated).toBe(57);
    expect(result.changed).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it('degrades to partial if relationship recovery throws (event recovery still runs)', async () => {
    recoverRelationshipGraph.mockRejectedValueOnce(new Error('boom'));
    const result = await graphRecoveryTrigger.runNow(nextUser());
    expect(recoverMissingEvents).toHaveBeenCalled();
    expect(result.status).toBe('partial');
    expect(result.error).toContain('relationship_recovery');
  });

  it('getLastRun surfaces the most recent result', async () => {
    const u = nextUser();
    await graphRecoveryTrigger.runNow(u);
    expect(graphRecoveryTrigger.getLastRun(u)?.userId).toBe(u);
    expect(graphRecoveryTrigger.getLastRun('never-ran')).toBeNull();
  });
});

describe('graphRecoveryTrigger.schedule — throttle (Supabase egress safety)', () => {
  it('collapses a burst of chat turns into a single recovery run', async () => {
    vi.useFakeTimers();
    const u = nextUser();
    graphRecoveryTrigger.schedule(u);
    graphRecoveryTrigger.schedule(u);
    graphRecoveryTrigger.schedule(u);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(recoverRelationshipGraph).toHaveBeenCalledTimes(1);
  });

  it('enforces a cooldown — a new message right after a run does NOT rescan', async () => {
    vi.useFakeTimers();
    const u = nextUser();
    graphRecoveryTrigger.schedule(u);
    await vi.advanceTimersByTimeAsync(20_000); // first run
    expect(recoverRelationshipGraph).toHaveBeenCalledTimes(1);

    graphRecoveryTrigger.schedule(u); // new message during cooldown
    await vi.advanceTimersByTimeAsync(60_000); // debounce fires, but cooldown blocks
    expect(recoverRelationshipGraph).toHaveBeenCalledTimes(1); // still 1 — no rescan

    await vi.advanceTimersByTimeAsync(30 * 60_000); // cooldown elapses
    expect(recoverRelationshipGraph).toHaveBeenCalledTimes(2);
  });

  it('does not schedule for an empty userId', async () => {
    vi.useFakeTimers();
    graphRecoveryTrigger.schedule('');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(recoverRelationshipGraph).not.toHaveBeenCalled();
  });
});
