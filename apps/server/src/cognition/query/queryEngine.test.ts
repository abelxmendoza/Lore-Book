/**
 * Query Engine — classification, planning, merging, and orchestration.
 * Executors are faked via the injectable registry; underlying retrieval
 * services are exercised by their own existing suites.
 */
import { describe, it, expect } from 'vitest';

import { classifyQuery } from './IntentClassifier';
import { planQuery } from './QueryPlanner';
import { mergeResults } from './ResultMerger';
import { QueryEngine } from './QueryEngine';
import { QueryType, type QueryResult, type ExecutorKind } from './QueryTypes';
import type { QueryExecutor } from './QueryExecutor';
import { EntityResolver } from './EntityResolver';
import { queryInspector } from './QueryInspector';

/** Resolver backed by a fake index — no DB. */
const fakeResolver = (known: Record<string, { id: string; type: string }> = {}) =>
  new EntityResolver(async () => new Map(Object.entries(known)));

const result = (source: ExecutorKind, over: Partial<QueryResult> = {}): QueryResult => ({
  source,
  confidence: 0.9,
  provenance: [{ origin: 'foundation', method: 'test', confidence: 0.9 }],
  latencyMs: 1,
  records: [],
  citations: [],
  ...over,
});

describe('IntentClassifier', () => {
  it('maps legacy sync-recall intents onto the formal taxonomy', () => {
    expect(classifyQuery('who is Renna?').intent).toBe(QueryType.IDENTITY);
    expect(classifyQuery("who's in my story?").intent).toBe(QueryType.AGGREGATE);
    expect(classifyQuery('tell me about my family').intent).toBe(QueryType.RELATIONSHIP);
    expect(classifyQuery('what do I do for work?').intent).toBe(QueryType.ORGANIZATION);
  });

  it('keeps foundation-primary flag from the legacy router rules', () => {
    const c = classifyQuery('tell me about my family');
    expect(c.foundationPrimary).toBe(true);
    expect(c.legacyIntent).toBe('family');
  });

  it('classifies future-facing types the legacy router has no concept of', () => {
    expect(classifyQuery('compare my last two jobs').intent).toBe(QueryType.COMPARISON);
    expect(classifyQuery('why did I leave RLH?').intent).toBe(QueryType.CAUSAL);
    expect(classifyQuery('tell me the story of my robotics career').intent).toBe(QueryType.NARRATIVE);
    expect(classifyQuery('who introduced me to Ashley?').intent).toBe(QueryType.GRAPH);
  });

  it('falls through to SEMANTIC with low confidence when nothing matches', () => {
    const c = classifyQuery('hmm interesting thought about clouds');
    expect(c.intent).toBe(QueryType.SEMANTIC);
    expect(c.confidence).toBeLessThan(0.5);
  });

  it('extracts entity names for who-is queries', () => {
    expect(classifyQuery('who is Renna Vega?').matchedEntities).toContain('Renna Vega');
  });
});

describe('QueryPlanner', () => {
  it('never schedules semantic fallback for foundation-primary intents', () => {
    const plan = planQuery(classifyQuery('tell me about my family'));
    expect(plan.executors.some((e) => e.kind === 'semantic')).toBe(false);
    expect(plan.executors.some((e) => e.kind === 'structured')).toBe(true);
  });

  it('schedules thread recall first when conversation history exists', () => {
    const plan = planQuery(classifyQuery('compare my last two jobs'), {
      hasConversationHistory: true,
    });
    expect(plan.executors[0]?.kind).toBe('thread');
  });

  it('plans placeholder executors so future capabilities have a stable shape', () => {
    const plan = planQuery(classifyQuery('who introduced me to Ashley?'));
    expect(plan.executors.some((e) => e.kind === 'graph' && e.placeholder)).toBe(true);
  });

  it('carries filters extracted by classification', () => {
    const plan = planQuery(classifyQuery('who is Renna?'));
    expect(plan.filters.entities).toContain('Renna');
  });
});

describe('ResultMerger', () => {
  it('dedupes records by id, keeping the higher-trust copy', () => {
    const merged = mergeResults([
      result('semantic', {
        records: [{ id: 'e1', type: 'journal_entry', content: 'from journal', score: 0.9 }],
      }),
      result('structured', {
        records: [{ id: 'e1', type: 'foundation_context', content: 'from foundation', score: 0.9 }],
      }),
    ]);
    expect(merged.records).toHaveLength(1);
    expect(merged.records[0].content).toBe('from foundation');
  });

  it('ranks by source-weighted confidence and aggregates provenance/citations', () => {
    const merged = mergeResults([
      result('working_memory', {
        confidence: 1,
        records: [{ id: 'a', type: 'entity', content: 'wm' }],
        citations: [{ kind: 'entity', id: 'a' }],
      }),
      result('structured', {
        confidence: 0.9,
        records: [{ id: 'b', type: 'foundation_context', content: 'foundation' }],
        citations: [{ kind: 'entity', id: 'b' }],
      }),
    ]);
    expect(merged.records[0].id).toBe('b'); // structured outweighs working memory
    expect(merged.citations).toHaveLength(2);
    expect(merged.provenance).toHaveLength(2);
    expect(merged.contributingSources).toEqual(expect.arrayContaining(['structured', 'working_memory']));
  });

  it('ignores errored executors and reports zero confidence when nothing contributed', () => {
    const merged = mergeResults([result('semantic', { error: 'boom', records: [] })]);
    expect(merged.records).toHaveLength(0);
    expect(merged.confidence).toBe(0);
  });
});

describe('QueryEngine', () => {
  const fake = (kind: ExecutorKind, out: Partial<QueryResult>): QueryExecutor => ({
    kind,
    execute: async () => result(kind, out),
  });

  it('stops early when the first tier already yields sufficient confidence', async () => {
    const registry = new Map<ExecutorKind, QueryExecutor>([
      ['structured', fake('structured', { confidence: 0.95, records: [{ id: 's', type: 'foundation_context', content: 'x' }] })],
      ['crystallized', fake('crystallized', { records: [{ id: 'c', type: 'claim', content: 'y' }] })],
    ]);
    const engine = new QueryEngine(registry, fakeResolver());
    const out = await engine.run({ userId: 'u1', message: 'who is Renna?' });

    expect(out.plan.intent).toBe(QueryType.IDENTITY);
    expect(out.merged.records.map((r) => r.id)).toEqual(['s']);
    const skipped = out.results.find((r) => r.source === 'crystallized');
    expect(skipped?.skipped).toBe(true);
    expect(skipped?.skipReason).toMatch(/sufficient|early stop/i);
  });

  it('runs conditional stages when confidence stays low', async () => {
    const registry = new Map<ExecutorKind, QueryExecutor>([
      ['structured', fake('structured', { confidence: 0.4, records: [{ id: 's', type: 'foundation_context', content: 'x' }] })],
      ['crystallized', fake('crystallized', { confidence: 0.8, records: [{ id: 'c', type: 'claim', content: 'y' }] })],
    ]);
    const engine = new QueryEngine(registry, fakeResolver());
    const out = await engine.run({ userId: 'u1', message: 'who is Renna?' });

    expect(out.merged.records.map((r) => r.id)).toEqual(expect.arrayContaining(['s', 'c']));
    expect(out.results.every((r) => !r.skipped)).toBe(true);
  });

  it('anchors plans on canonical entity ids (entity-first planning)', async () => {
    const registry = new Map<ExecutorKind, QueryExecutor>([
      ['structured', fake('structured', { confidence: 0.95, records: [{ id: 's', type: 'foundation_context', content: 'x' }] })],
    ]);
    const engine = new QueryEngine(registry, fakeResolver({ renna: { id: 'character_42', type: 'person' } }));
    const out = await engine.run({ userId: 'u1', message: 'who is Renna?' });

    expect(out.resolvedEntities[0]).toMatchObject({ mention: 'Renna', id: 'character_42', method: 'exact' });
    expect(out.plan.resolvedEntities?.[0]?.id).toBe('character_42');
    expect(out.merged.provenance.some((p) => p.entityResolution?.id === 'character_42')).toBe(true);
  });

  it('exposes explainable confidence via the breakdown', async () => {
    const registry = new Map<ExecutorKind, QueryExecutor>([
      ['structured', fake('structured', { confidence: 0.96, records: [{ id: 's', type: 'foundation_context', content: 'x' }] })],
    ]);
    const engine = new QueryEngine(registry, fakeResolver());
    const out = await engine.run({ userId: 'u1', message: 'who is Renna?' });

    expect(out.merged.confidenceBreakdown).toEqual([
      { source: 'structured', confidence: 0.96, weight: 1.0, weighted: 0.96 },
    ]);
    expect(out.merged.confidence).toBeCloseTo(0.96);
  });

  it('records a full trace in the Query Inspector', async () => {
    const registry = new Map<ExecutorKind, QueryExecutor>([
      ['structured', fake('structured', { confidence: 0.95, records: [{ id: 's', type: 'foundation_context', content: 'x' }] })],
      ['crystallized', fake('crystallized', {})],
    ]);
    const engine = new QueryEngine(registry, fakeResolver());
    await engine.run({ userId: 'u1', message: 'who is Renna?' });

    const trace = queryInspector.getLastTrace();
    expect(trace?.query).toBe('who is Renna?');
    expect(trace?.intent).toBe('IDENTITY');
    expect(trace?.executors.find((e) => e.kind === 'structured')?.executed).toBe(true);
    expect(trace?.executors.find((e) => e.kind === 'crystallized')?.executed).toBe(false);
    expect(trace?.earlyStopped).toBe(true);
    expect(trace?.finalConfidence).toBeGreaterThan(0.9);
  });

  it('isolates executor failures — one bad source never fails the query', async () => {
    const registry = new Map<ExecutorKind, QueryExecutor>([
      ['structured', { kind: 'structured', execute: async () => { throw new Error('db down'); } }],
      ['crystallized', fake('crystallized', { records: [{ id: 'c', type: 'claim', content: 'y' }] })],
    ]);
    const engine = new QueryEngine(registry);
    const out = await engine.run({ userId: 'u1', message: 'who is Renna?' });

    const failed = out.results.find((r) => r.source === 'structured');
    expect(failed?.error).toMatch(/db down/);
    expect(out.merged.records.map((r) => r.id)).toContain('c');
  });

  it('returns an error result for unregistered executor kinds', async () => {
    const engine = new QueryEngine(new Map());
    const out = await engine.run({ userId: 'u1', message: 'who is Renna?' });
    expect(out.results.every((r) => r.error)).toBe(true);
  });
});
