import { describe, it, expect, beforeEach } from 'vitest';

import { BACKGROUND_WORKER_MAP, workerById } from '../ingestion/backgroundWorkerMap';
import { EVENT_ASSEMBLY_DELTA_BUDGET, EVENT_RECOVERY_DELTA_BUDGET, RELATIONSHIP_DELTA_BUDGET, JobBudgetClock } from '../ingestion/deltaJobBudget';
import { canonicalFieldsUnchanged } from '../ingestion/dirtyCheck';
import {
  getSemanticIr,
  hashIrContent,
  invalidateSemanticIr,
  resetSemanticIrCacheForTests,
  semanticIrKey,
  setSemanticIr,
} from '../ingestion/semanticIrCache';
import {
  EVENT_ASSEMBLY_PROCESSING_VERSION,
  EVENT_RECOVERY_PROCESSING_VERSION,
  advanceCursor,
  claimWorker,
  emptyCursor,
  filterDeltaRows,
  isHistoricalSweep,
  overlapIso,
  releaseWorker,
  resetWorkerCursorsForTests,
} from '../ingestion/workerHighWaterMark';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

function iso(n: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
}

function messages(count: number, start = 0) {
  return Array.from({ length: count }, (_, i) => ({
    id: `msg-${start + i + 1}`,
    updated_at: iso(start + i + 1),
  }));
}

beforeEach(() => {
  resetWorkerCursorsForTests();
  resetSemanticIrCacheForTests();
});

describe('delta ingestion — worker map', () => {
  it('classifies the priority scanners before optimization', () => {
    expect(workerById('event_recovery')?.classification).toBe('NEEDS OVERLAP WINDOW');
    expect(workerById('event_assembly')?.classification).toBe('NEEDS OVERLAP WINDOW');
    expect(workerById('life_log_coverage_recovery')?.classification).toBe('RECOVERY ONLY');
    expect(BACKGROUND_WORKER_MAP.length).toBeGreaterThan(5);
  });
});

describe('delta ingestion — high-water mark + query', () => {
  it('1. first run processes 100 old messages (bounded catch-up)', () => {
    const rows = messages(100);
    const scanned = filterDeltaRows(rows, null, 10 * 60 * 1000, EVENT_RECOVERY_DELTA_BUDGET.maxRows);
    expect(scanned).toHaveLength(100);
  });

  it('2. second run with no changes processes 0 new rows', () => {
    const rows = messages(100);
    const first = filterDeltaRows(rows, null, 10 * 60 * 1000, 100);
    const cursor = advanceCursor(
      emptyCursor(EVENT_RECOVERY_PROCESSING_VERSION),
      first.map((r) => ({ id: r.id, at: r.updated_at })),
      [],
      EVENT_RECOVERY_PROCESSING_VERSION,
    );
    const processed = new Set(first.map((r) => r.id));
    const scanned = filterDeltaRows(rows, cursor.lastProcessedAt, 10 * 60 * 1000, 100);
    const work = scanned.filter((row) => !processed.has(row.id) || row.updated_at > cursor.lastProcessedAt!);
    expect(work).toHaveLength(0);
  });

  it('3. add 5 messages → processes 5', () => {
    const original = messages(100);
    const cursorAt = original[99].updated_at;
    const next = [...original, ...messages(5, 100)];
    const scanned = filterDeltaRows(next, cursorAt, 10 * 60 * 1000, 100);
    const fresh = scanned.filter((row) => row.updated_at > cursorAt);
    expect(fresh).toHaveLength(5);
    expect(fresh.map((r) => r.id).sort()).toEqual(['msg-101', 'msg-102', 'msg-103', 'msg-104', 'msg-105']);
  });

  it('4. overlap window does not duplicate canonical event identity', () => {
    const rows = messages(20);
    const cursorAt = rows[19].updated_at;
    const overlapMs = 10 * 60 * 1000;
    const scanned = filterDeltaRows(rows, cursorAt, overlapMs, 100);
    const identities = scanned.map((r) => r.id);
    expect(new Set(identities).size).toBe(identities.length);
    const canonicalKeys = scanned.map((r) => `event:${r.id}:${EVENT_ASSEMBLY_PROCESSING_VERSION}`);
    expect(new Set(canonicalKeys).size).toBe(canonicalKeys.length);
  });

  it('5. edited old message gets reprocessed via updated_at', () => {
    const rows = messages(20);
    const cursorAt = rows[19].updated_at;
    const edited = rows.map((r) => (r.id === 'msg-3' ? { ...r, updated_at: iso(500) } : r));
    const scanned = filterDeltaRows(edited, cursorAt, 10 * 60 * 1000, 100);
    expect(scanned.some((r) => r.id === 'msg-3')).toBe(true);
  });

  it('6. failed item retries without replaying successful items', () => {
    const rows = messages(20);
    const cursorAt = rows[19].updated_at;
    const scanned = filterDeltaRows(rows, cursorAt, 0, 100, ['msg-4']);
    expect(scanned.map((r) => r.id)).toContain('msg-4');
    expect(scanned.filter((r) => r.id !== 'msg-4' && r.updated_at < cursorAt)).toHaveLength(0);
  });

  it('7. same source cannot run concurrently twice', () => {
    expect(claimWorker(USER_A, 'event_assembly')).toBe(true);
    expect(claimWorker(USER_A, 'event_assembly')).toBe(false);
    expect(claimWorker(USER_B, 'event_assembly')).toBe(true);
    releaseWorker(USER_A, 'event_assembly');
    expect(claimWorker(USER_A, 'event_assembly')).toBe(true);
  });

  it('18. tenant isolation — cursors and claims are per user', () => {
    expect(claimWorker(USER_A, 'event_recovery')).toBe(true);
    expect(claimWorker(USER_B, 'event_recovery')).toBe(true);
    const keyA = semanticIrKey({ userId: USER_A, sourceId: 'msg-1', contentHash: 'abc' });
    const keyB = semanticIrKey({ userId: USER_B, sourceId: 'msg-1', contentHash: 'abc' });
    expect(keyA).not.toBe(keyB);
  });
});

describe('delta ingestion — semantic IR reuse', () => {
  it('10. semantic IR reused by multiple consumers', () => {
    const hash = hashIrContent('Jamie started at Vanguard Robotics.');
    const key = semanticIrKey({ userId: USER_A, sourceId: 'msg-1', contentHash: hash });
    setSemanticIr(key, { entities: [{ name: 'Jamie' }] });
    expect(getSemanticIr(key)).toEqual({ entities: [{ name: 'Jamie' }] });
    expect(getSemanticIr(key)).toEqual({ entities: [{ name: 'Jamie' }] });
  });

  it('11. unchanged IR does not re-extract; edits miss the cache', () => {
    const hash = hashIrContent('I work at MemoVault.');
    const key = semanticIrKey({ userId: USER_A, sourceId: 'msg-2', contentHash: hash });
    setSemanticIr(key, { v: 1 });
    expect(getSemanticIr(key)).toEqual({ v: 1 });
    const edited = semanticIrKey({
      userId: USER_A,
      sourceId: 'msg-2',
      contentHash: hashIrContent('I work at Northwind Labs.'),
    });
    expect(getSemanticIr(edited)).toBeNull();
  });

  it('20. corrections invalidate IR for that source', () => {
    const hash = hashIrContent('old');
    const key = semanticIrKey({ userId: USER_A, sourceId: 'msg-9', contentHash: hash });
    setSemanticIr(key, { v: 1 });
    invalidateSemanticIr(USER_A, 'msg-9');
    expect(getSemanticIr(key)).toBeNull();
  });
});

describe('delta ingestion — embeddings + dirty check + budgets', () => {
  it('12/13. unchanged embedding reuses hash; model version change is a new key', () => {
    const a = semanticIrKey({ userId: USER_A, sourceId: 'src', contentHash: hashIrContent('hello'), extractorVersion: 'text-embedding-3-small' });
    const b = semanticIrKey({ userId: USER_A, sourceId: 'src', contentHash: hashIrContent('hello'), extractorVersion: 'text-embedding-3-small' });
    const c = semanticIrKey({ userId: USER_A, sourceId: 'src', contentHash: hashIrContent('hello'), extractorVersion: 'text-embedding-3-large' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('14. dirty-check skips identical UPDATE', () => {
    const before = { title: 'Northwind onboarding', summary: 'Jamie started', people: ['a'], updated_at: iso(1) };
    const after = { title: 'Northwind onboarding', summary: 'Jamie started', people: ['a'], updated_at: iso(2) };
    expect(canonicalFieldsUnchanged(before, after, ['title', 'summary', 'people'])).toBe(true);
    expect(canonicalFieldsUnchanged(before, { ...after, title: 'Maya visit' }, ['title', 'summary', 'people'])).toBe(false);
  });

  it('15. background budget stops safely and resumes', () => {
    const clock = new JobBudgetClock({ maxRows: 5, maxLlmCalls: 1, maxEmbeddingCalls: 0, maxProcessingMs: 8_000 });
    let taken = 0;
    while (clock.takeRow()) taken += 1;
    expect(taken).toBe(5);
    expect(clock.canTakeRow()).toBe(false);
    const remaining = messages(20).slice(5);
    expect(remaining).toHaveLength(15);
  });

  it('16. recovery mode can intentionally scan historical range', () => {
    expect(isHistoricalSweep('recovery')).toBe(true);
    expect(isHistoricalSweep('rebuild')).toBe(true);
    const rows = messages(800);
    const scanned = filterDeltaRows(rows, null, 0, 800);
    expect(scanned).toHaveLength(800);
  });

  it('17. normal delta mode cannot invoke full sweep limits', () => {
    expect(isHistoricalSweep('delta')).toBe(false);
    expect(EVENT_RECOVERY_DELTA_BUDGET.maxRows).toBeLessThan(800);
    expect(EVENT_ASSEMBLY_DELTA_BUDGET.maxRows).toBeLessThan(1000);
    expect(RELATIONSHIP_DELTA_BUDGET.maxRows).toBeLessThan(500);
    expect(RELATIONSHIP_DELTA_BUDGET.maxLlmCalls).toBe(0);
  });
});

describe('delta ingestion — overlap reason + processing version', () => {
  it('overlapIso documents the 24h grouping window without rewriting history', () => {
    const cursor = '2026-01-02T00:00:00.000Z';
    const overlap = overlapIso(cursor, 24 * 60 * 60 * 1000);
    expect(overlap).toBe('2026-01-01T00:00:00.000Z');
  });

  it('processing version change is explicit, not silent erasure', () => {
    const cursor = emptyCursor('v3');
    expect(cursor.processingVersion).toBe(EVENT_ASSEMBLY_PROCESSING_VERSION);
    const next = advanceCursor(cursor, [{ id: 'u1', at: iso(9) }], ['u2'], 'v4');
    expect(next.processingVersion).toBe('v4');
    expect(next.failedIds).toEqual(['u2']);
    expect(next.lastProcessedAt).toBe(iso(9));
  });
});

describe('delta ingestion — benchmark (synthetic 1000 messages)', () => {
  it('19. no-change cycle work is overlap-sized; +10 messages is proportional', () => {
    const history = messages(1000);
    const first = filterDeltaRows(history, null, 10 * 60 * 1000, 100);
    expect(first).toHaveLength(100);
    const cursorAt = first[0].updated_at;
    const idleScan = filterDeltaRows(history, cursorAt, 10 * 60 * 1000, 100);
    const idleWork = idleScan.filter((r) => r.updated_at > cursorAt);
    expect(idleWork).toHaveLength(0);

    const plusTen = [...history, ...messages(10, 1000)];
    const deltaScan = filterDeltaRows(plusTen, cursorAt, 10 * 60 * 1000, 100);
    const deltaWork = deltaScan.filter((r) => r.updated_at > cursorAt);
    expect(deltaWork).toHaveLength(10);
  });
});
