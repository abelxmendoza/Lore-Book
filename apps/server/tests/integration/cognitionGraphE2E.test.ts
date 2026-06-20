/**
 * E2E — decision + event + causal link → narrative spine + graph substrate.
 *
 * Uses a stateful Supabase mock to simulate the full write path and assert
 * every persistence layer receives the expected rows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store: Record<string, unknown[]> = {
  decisions: [],
  decision_rationales: [],
  narrative_claims: [],
  narrative_claim_edges: [],
  graph_nodes: [],
  assertion_evidence: [],
  resolved_events: [],
  event_causal_links: [],
  entry_ir: [],
  characters: [],
};

const mockFrom = vi.fn();

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

vi.mock('../../src/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { chainableQuery } from '../fixtures/cognitionSupabaseMock';
import { bridgeDecisionFromEntryIr } from '../../src/services/cognition/decisionBridgeService';
import { bridgeCausalLink } from '../../src/services/cognition/causalBridgeService';
import { bridgeResolvedEventToGraphNode } from '../../src/services/cognition/graphBridgeService';

function pushRow(table: string, row: Record<string, unknown>) {
  if (!store[table]) store[table] = [];
  store[table].push(row);
  return row;
}

describe('cognition graph E2E (decision → event → causal)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(store)) store[key] = [];

    store.resolved_events = [
      {
        id: 'evt-cause',
        user_id: 'user-e2e',
        title: 'Left Amazon',
        summary: 'Career transition',
        start_time: '2024-03-01T00:00:00Z',
        end_time: null,
        confidence: 0.85,
        metadata: { significance: 0.9, life_event_category: 'career' },
        type: 'career',
      },
      {
        id: 'evt-effect',
        user_id: 'user-e2e',
        title: 'Started LoreBook full time',
        summary: 'Founder mode',
        start_time: '2024-04-01T00:00:00Z',
        end_time: null,
        confidence: 0.88,
        metadata: { significance: 0.92 },
        type: 'career',
      },
    ];

    store.entry_ir = [
      {
        id: 'ir-dec-e2e',
        user_id: 'user-e2e',
        knowledge_type: 'DECISION',
        content: 'I decided to leave Amazon and build LoreBook.',
        confidence: 0.9,
        timestamp: '2024-02-15T00:00:00Z',
        source_utterance_id: null,
        certainty_source: 'explicit',
      },
    ];

    mockFrom.mockImplementation((table: string) => {
      const b = chainableQuery({ data: null, error: null });

      b.insert = vi.fn((row: Record<string, unknown> | Record<string, unknown>[]) => {
        const rows = Array.isArray(row) ? row : [row];
        for (const r of rows) {
          const withId = { id: `${table}-${store[table]?.length ?? 0}`, ...r };
          pushRow(table, withId);
        }
        return chainableQuery({ data: rows[0] ? { id: `${table}-0`, ...rows[0] } : null, error: null });
      }) as never;

      b.upsert = vi.fn((row: Record<string, unknown>) => {
        pushRow(table, row);
        return chainableQuery({ data: row, error: null });
      }) as never;

      b.update = vi.fn(() => chainableQuery({ data: null, error: null })) as never;

      b.maybeSingle = vi.fn(() => {
        if (table === 'decisions') {
          const hit = (store.decisions as Record<string, unknown>[]).find(
            (d) => (d.metadata as { source_entry_ir_id?: string })?.source_entry_ir_id === 'ir-dec-e2e',
          );
          return chainableQuery({ data: hit ?? null, error: null });
        }
        if (table === 'narrative_claims') {
          return chainableQuery({ data: null, error: null });
        }
        if (table === 'graph_nodes') {
          return chainableQuery({ data: null, error: null });
        }
        if (table === 'graph_edges') {
          return chainableQuery({ data: null, error: null });
        }
        if (table === 'resolved_events') {
          return chainableQuery({
            data: (store.resolved_events as Record<string, unknown>[])[0] ?? null,
            error: null,
          });
        }
        if (table === 'entry_ir') {
          return chainableQuery({
            data: (store.entry_ir as Record<string, unknown>[])[0] ?? null,
            error: null,
          });
        }
        return chainableQuery({ data: null, error: null });
      }) as never;

      b.single = vi.fn(() => {
        if (table === 'decisions') {
          const inserted = (store.decisions as Record<string, unknown>[]).at(-1);
          return chainableQuery({ data: inserted ?? { id: 'dec-e2e' }, error: null });
        }
        if (table === 'narrative_claims') {
          const inserted = (store.narrative_claims as Record<string, unknown>[]).at(-1);
          return chainableQuery({
            data: inserted ?? { id: 'claim-new', claim_kind: 'event' },
            error: null,
          });
        }
        return chainableQuery({ data: { id: `${table}-single` }, error: null });
      }) as never;

      b.then = (resolve: (v: unknown) => void) => {
        if (table === 'resolved_events') {
          return Promise.resolve({ data: store.resolved_events, error: null }).then(resolve);
        }
        if (table === 'event_mentions') {
          return Promise.resolve({ data: [], error: null }).then(resolve);
        }
        return Promise.resolve({ data: null, error: null }).then(resolve);
      };

      return b;
    });
  });

  it('materializes a decision claim + graph node from DECISION entry_ir', async () => {
    const decisionId = await bridgeDecisionFromEntryIr('user-e2e', {
      id: 'ir-dec-e2e',
      knowledge_type: 'DECISION',
      content: 'I decided to leave Amazon and build LoreBook.',
      confidence: 0.9,
      timestamp: '2024-02-15T00:00:00Z',
      source_utterance_id: null,
      themes: [],
      emotions: [],
    } as never);

    expect(decisionId).toBeTruthy();
    expect(store.decisions.length).toBeGreaterThanOrEqual(1);
    expect(store.narrative_claims.some((c) => (c as { claim_kind?: string }).claim_kind === 'decision')).toBe(
      true,
    );
  });

  it('bridges resolved events to graph nodes', async () => {
    mockFrom.mockImplementation((table: string) => {
      const b = chainableQuery({ data: null, error: null });
      b.maybeSingle = vi.fn(() => {
        if (table === 'resolved_events') {
          return chainableQuery({ data: store.resolved_events[0], error: null });
        }
        if (table === 'graph_nodes') return chainableQuery({ data: null, error: null });
        return chainableQuery({ data: null, error: null });
      }) as never;
      b.insert = vi.fn((row: Record<string, unknown>) => {
        pushRow(table, { id: `node-${store.graph_nodes.length}`, ...row });
        return chainableQuery({ data: { id: 'node-evt' }, error: null });
      }) as never;
      b.single = vi.fn(() => chainableQuery({ data: { id: 'node-evt' }, error: null })) as never;
      return b;
    });

    await bridgeResolvedEventToGraphNode('user-e2e', 'evt-cause');
    expect(store.graph_nodes.length).toBeGreaterThanOrEqual(1);
  });

  it('bridges causal links when both events resolve to claims', async () => {
    // Pre-seed claims as if bridgeResolvedEvent already ran
    store.narrative_claims = [
      {
        id: 'claim-cause',
        source_table: 'resolved_events',
        source_id: 'evt-cause',
        claim_kind: 'event',
      },
      {
        id: 'claim-effect',
        source_table: 'resolved_events',
        source_id: 'evt-effect',
        claim_kind: 'event',
      },
    ];

    mockFrom.mockImplementation((table: string) => {
      const b = chainableQuery({ data: null, error: null });
      b.maybeSingle = vi.fn(() => {
        if (table === 'resolved_events') {
          const id = (b as { _eventId?: string })._eventId;
          const hit = (store.resolved_events as { id: string }[]).find((e) => e.id === id);
          return chainableQuery({ data: hit ?? store.resolved_events[0], error: null });
        }
        if (table === 'narrative_claims') {
          return chainableQuery({ data: store.narrative_claims[0], error: null });
        }
        return chainableQuery({ data: null, error: null });
      }) as never;
      b.single = vi.fn(() =>
        chainableQuery({ data: { id: 'edge-causal' }, error: null }),
      ) as never;
      b.upsert = vi.fn((row: Record<string, unknown>) => {
        pushRow('narrative_claim_edges', row);
        return chainableQuery({ data: { id: 'edge-causal', ...row }, error: null });
      }) as never;
      b.then = (resolve: (v: unknown) => void) => {
        if (table === 'event_mentions') return Promise.resolve({ data: [], error: null }).then(resolve);
        if (table === 'resolved_events') {
          return Promise.resolve({ data: store.resolved_events[0], error: null }).then(resolve);
        }
        return Promise.resolve({ data: null, error: null }).then(resolve);
      };
      return b;
    });

    const ok = await bridgeCausalLink('user-e2e', {
      causeEventId: 'evt-cause',
      effectEventId: 'evt-effect',
      causalType: 'causes',
      confidence: 0.8,
    });

    expect(ok).toBe(true);
    expect(store.narrative_claim_edges.length).toBeGreaterThanOrEqual(1);
  });
});
