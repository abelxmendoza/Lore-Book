import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../supabaseClient', () => ({ supabaseAdmin: {} }));

import { appendMemoryEvent, getRecentMemoryEvents, __resetMemoryEventCaptureForTests, type MemoryEventClient, type MemoryEventRow } from './memoryEventService';
import { consolidateCorrections, type ApplyClient, type CandidateClaim } from './correctionConsolidation';
import { __resetSchemaCapabilityCache } from './schemaCapability';
import { detectCorrectionIntent } from './correctionDetection';

// ─────────────────────────────────────────────────────────────────────────────
// Minimal in-memory fake Supabase supporting the exact query chains the memory
// services use: insert / select.eq.order.limit / update.eq, with column-awareness
// so we can simulate "migration not yet applied".
// ─────────────────────────────────────────────────────────────────────────────
interface FakeTable {
  columns: Set<string> | null; // null = accept any column (e.g. memory_events)
  rows: Record<string, unknown>[];
}

function createFakeSupabase(tables: Record<string, { columns?: string[]; rows?: Record<string, unknown>[] }>) {
  const state: Record<string, FakeTable> = {};
  for (const [name, def] of Object.entries(tables)) {
    state[name] = { columns: def.columns ? new Set(def.columns) : null, rows: def.rows ?? [] };
  }
  let seq = 0;

  function missingColumn(table: FakeTable, cols: string[]): string | null {
    if (!table.columns) return null;
    for (const c of cols) {
      if (c === '*' || c.trim() === '') continue;
      if (!table.columns.has(c.trim())) return c.trim();
    }
    return null;
  }

  function from(name: string) {
    const table = state[name] ?? (state[name] = { columns: null, rows: [] });

    return {
      async insert(rows: Record<string, unknown>[]) {
        const miss = missingColumn(table, [...new Set(rows.flatMap((r) => Object.keys(r)))]);
        if (miss) return { data: null, error: { code: '42703', message: `column "${miss}" does not exist` } };
        for (const r of rows) {
          table.rows.push({ id: `row-${++seq}`, created_at: new Date(2026, 0, 1, 0, 0, ++seq).toISOString(), ...r });
        }
        return { data: rows, error: null };
      },
      select(cols: string) {
        const requested = cols.split(',').map((c) => c.trim());
        const miss = missingColumn(table, requested);
        const filters: Array<[string, unknown]> = [];
        let orderCol: string | null = null;
        let asc = true;
        const builder = {
          eq(col: string, val: unknown) {
            filters.push([col, val]);
            return builder;
          },
          order(col: string, opts: { ascending: boolean }) {
            orderCol = col;
            asc = opts.ascending;
            return builder;
          },
          async limit(n: number) {
            if (miss) return { data: null, error: { code: '42703', message: `column "${miss}" does not exist` } };
            let out = table.rows.filter((r) => filters.every(([c, v]) => r[c] === v));
            if (orderCol) {
              out = [...out].sort((a, b) => {
                const av = String(a[orderCol!] ?? '');
                const bv = String(b[orderCol!] ?? '');
                return asc ? av.localeCompare(bv) : bv.localeCompare(av);
              });
            }
            return { data: out.slice(0, n), error: null };
          },
        };
        return builder;
      },
      update(values: Record<string, unknown>) {
        const miss = missingColumn(table, Object.keys(values));
        return {
          async eq(col: string, val: unknown) {
            if (miss) return { error: { code: '42703', message: `column "${miss}" does not exist` } };
            for (const r of table.rows) if (r[col] === val) Object.assign(r, values);
            return { error: null };
          },
        };
      },
    };
  }

  return { client: { from } as unknown as MemoryEventClient & ApplyClient, state };
}

const OMEGA_COLUMNS = [
  'id', 'user_id', 'text', 'entity_id', 'is_active', 'end_time', 'updated_at',
  'lifecycle_state', 'last_confirmed_at', 'source_event_id',
];

function loadActiveClaims(client: MemoryEventClient & ApplyClient, userId: string) {
  return async (): Promise<CandidateClaim[]> => {
    const { data } = await client.from('omega_claims').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100);
    return (data as CandidateClaim[]) ?? [];
  };
}

beforeEach(() => {
  __resetSchemaCapabilityCache();
  __resetMemoryEventCaptureForTests();
});

describe('end-to-end: chat correction → event log → consolidation → fact update', () => {
  it('records a correction event and flags the matching claim as corrected', async () => {
    const { client, state } = createFakeSupabase({
      memory_events: { rows: [] },
      omega_claims: {
        columns: OMEGA_COLUMNS,
        rows: [
          { id: 'claim-maria', user_id: 'u1', text: 'Her name is Maria', is_active: true, lifecycle_state: 'active' },
          { id: 'claim-denver', user_id: 'u1', text: 'She lives in Denver', is_active: true, lifecycle_state: 'active' },
        ],
      },
    });

    // 1. User sends a correction in chat → detection + capture into the event log.
    const message = 'Actually, her name is Maya, not Maria';
    expect(detectCorrectionIntent(message).isCorrection).toBe(true);

    await appendMemoryEvent({ userId: 'u1', kind: 'user_message', sessionId: 's1', sourceMessageId: 'm1', content: message }, client);
    await appendMemoryEvent(
      { userId: 'u1', kind: 'correction', sessionId: 's1', sourceMessageId: 'm1', content: message, confidence: 0.85, extractionMethod: 'heuristic', userConfirmed: true },
      client
    );

    // 2. Consolidation reads correction events and transitions the matched claim.
    const corrections = await getRecentMemoryEvents('u1', { kind: 'correction' }, client);
    expect(corrections).toHaveLength(1);

    const summary = await consolidateCorrections({
      corrections: corrections as MemoryEventRow[],
      loadCandidateClaims: loadActiveClaims(client, 'u1'),
      client,
    });

    // 3. The right claim is corrected (non-destructive), the other untouched.
    expect(summary).toMatchObject({ correctionsProcessed: 1, claimsTransitioned: 1 });
    const maria = state.omega_claims!.rows.find((r) => r.id === 'claim-maria')!;
    const denver = state.omega_claims!.rows.find((r) => r.id === 'claim-denver')!;
    expect(maria.lifecycle_state).toBe('corrected');
    expect(maria.is_active).toBe(false);
    expect(maria.end_time).toBeDefined();
    expect(denver.lifecycle_state).toBe('active'); // untouched
  });

  it('is idempotent: a second consolidation pass does not re-transition a corrected claim', async () => {
    const { client, state } = createFakeSupabase({
      memory_events: { rows: [] },
      omega_claims: {
        columns: OMEGA_COLUMNS,
        rows: [{ id: 'claim-maria', user_id: 'u1', text: 'Her name is Maria', is_active: true, lifecycle_state: 'active' }],
      },
    });
    await appendMemoryEvent({ userId: 'u1', kind: 'correction', content: 'Actually her name is Maya not Maria', confidence: 0.85 }, client);
    const corrections = (await getRecentMemoryEvents('u1', { kind: 'correction' }, client)) as MemoryEventRow[];

    const first = await consolidateCorrections({ corrections, loadCandidateClaims: loadActiveClaims(client, 'u1'), client });
    expect(first.claimsTransitioned).toBe(1);

    const second = await consolidateCorrections({ corrections, loadCandidateClaims: loadActiveClaims(client, 'u1'), client });
    expect(second.claimsTransitioned).toBe(0); // already terminal (corrected) → skipped
    expect(state.omega_claims!.rows[0]!.lifecycle_state).toBe('corrected');
  });

  it('pre-migration safety: with no lifecycle_state column, consolidation no-ops and leaves the claim intact', async () => {
    const { client, state } = createFakeSupabase({
      memory_events: { rows: [] },
      omega_claims: {
        // Note: lifecycle_state / source_event_id absent → simulates un-applied migration.
        columns: ['id', 'user_id', 'text', 'is_active', 'end_time', 'updated_at'],
        rows: [{ id: 'claim-maria', user_id: 'u1', text: 'Her name is Maria', is_active: true }],
      },
    });
    await appendMemoryEvent({ userId: 'u1', kind: 'correction', content: 'Actually her name is Maya not Maria', confidence: 0.85 }, client);
    const corrections = (await getRecentMemoryEvents('u1', { kind: 'correction' }, client)) as MemoryEventRow[];

    const summary = await consolidateCorrections({ corrections, loadCandidateClaims: loadActiveClaims(client, 'u1'), client });

    expect(summary).toMatchObject({ correctionsProcessed: 1, claimsTransitioned: 0, skipped: 1 });
    const claim = state.omega_claims!.rows[0]!;
    expect(claim.is_active).toBe(true); // untouched — no corruption pre-migration
    expect(claim.lifecycle_state).toBeUndefined();
  });

  it('does not touch claims when the message is ordinary conversation (no correction event)', async () => {
    const { client } = createFakeSupabase({
      memory_events: { rows: [] },
      omega_claims: { columns: OMEGA_COLUMNS, rows: [{ id: 'c1', user_id: 'u1', text: 'Her name is Maria', is_active: true, lifecycle_state: 'active' }] },
    });
    const message = 'I had a great time with Maria in Denver';
    expect(detectCorrectionIntent(message).isCorrection).toBe(false);

    // Ordinary message → only a user_message event, no correction event.
    await appendMemoryEvent({ userId: 'u1', kind: 'user_message', content: message }, client);
    const corrections = (await getRecentMemoryEvents('u1', { kind: 'correction' }, client)) as MemoryEventRow[];
    expect(corrections).toHaveLength(0);
  });

  it('event-log read is fail-open if the table is missing (kill switch already covers writes)', async () => {
    const { client } = createFakeSupabase({
      // memory_events declared with restrictive columns so select('*') still works,
      // but omega_claims missing entirely → loadCandidateClaims returns [].
      memory_events: { rows: [] },
    });
    await appendMemoryEvent({ userId: 'u1', kind: 'correction', content: 'Actually her name is Maya not Maria', confidence: 0.85 }, client);
    const corrections = (await getRecentMemoryEvents('u1', { kind: 'correction' }, client)) as MemoryEventRow[];

    const summary = await consolidateCorrections({
      corrections,
      // omega_claims table doesn't exist in this fake → select returns [].
      loadCandidateClaims: loadActiveClaims(client, 'u1'),
      client,
    });
    expect(summary.correctionsProcessed).toBe(1);
    expect(summary.claimsTransitioned).toBe(0);
  });
});
