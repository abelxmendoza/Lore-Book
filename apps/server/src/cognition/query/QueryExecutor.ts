/**
 * Query executors — modular retrieval units behind a single interface.
 *
 * Rule: executors ORCHESTRATE existing services (router, recall engine,
 * working memory assembler, claims loader); they never re-implement
 * retrieval, add queries, or bypass existing caches/batching.
 */

import { logger } from '../../logger';

import type {
  Citation,
  ExecutorKind,
  QueryContext,
  QueryRecord,
  QueryResult,
  TraversalPlan,
  TraversalResult,
  AggregateSpec,
} from './QueryTypes';

export interface QueryExecutor {
  kind: ExecutorKind;
  execute(ctx: QueryContext): Promise<QueryResult>;
}

function baseResult(kind: ExecutorKind, startedAt: number): QueryResult {
  return {
    source: kind,
    confidence: 0,
    provenance: [],
    latencyMs: Date.now() - startedAt,
    records: [],
    citations: [],
  };
}

// ─── Structured (deterministic foundation router) ────────────────────────────

export class StructuredRecallExecutor implements QueryExecutor {
  kind = 'structured' as const;

  async execute(ctx: QueryContext): Promise<QueryResult> {
    const started = Date.now();
    const { routeRecallQuery } = await import('../../services/chat/recallQueryRouter');
    const routed = await routeRecallQuery(ctx.userId, ctx.message, ctx.conversationHistory);

    const records: QueryRecord[] = routed.contextBlock?.trim()
      ? [
          {
            type: 'foundation_context',
            title: routed.entityName ?? routed.intent,
            content: routed.contextBlock,
            score: routed.confidence,
            data: routed,
          },
        ]
      : [];

    return {
      ...baseResult(this.kind, started),
      confidence: routed.confidence,
      latencyMs: Date.now() - started,
      records,
      provenance: [
        {
          origin: 'foundation',
          method: 'deterministic_router',
          table: routed.intent,
          entityIds: [],
          confidence: routed.confidence,
        },
      ],
      raw: routed,
    };
  }
}

// ─── Thread (current conversation) ────────────────────────────────────────────

export class ThreadRecallExecutor implements QueryExecutor {
  kind = 'thread' as const;

  async execute(ctx: QueryContext): Promise<QueryResult> {
    const started = Date.now();
    const { buildThreadRecall } = await import('../../services/chat/threadRecallService');
    const thread = await buildThreadRecall(ctx.userId, ctx.message, {
      conversationHistory: ctx.conversationHistory,
      threadId: ctx.threadId,
    });

    return {
      ...baseResult(this.kind, started),
      confidence: thread.confidence,
      latencyMs: Date.now() - started,
      records: thread.hasContent
        ? [{ type: 'thread_recall', content: thread.content, score: thread.confidence, data: thread }]
        : [],
      provenance: [
        { origin: 'thread', method: 'thread_recall', confidence: thread.confidence },
      ],
      raw: thread,
    };
  }
}

// ─── Semantic (journal recall engine) ────────────────────────────────────────

export class SemanticRecallExecutor implements QueryExecutor {
  kind = 'semantic' as const;

  async execute(ctx: QueryContext): Promise<QueryResult> {
    const started = Date.now();
    const { memoryRecallEngine } = await import('../../services/memoryRecall/memoryRecallEngine');
    const recall = await memoryRecallEngine.executeRecall({
      raw_text: ctx.message,
      user_id: ctx.userId,
      persona: 'ARCHIVIST',
    });

    const records: QueryRecord[] = recall.entries.map((entry) => ({
      id: entry.id,
      type: 'journal_entry',
      content: entry.content,
      score: recall.confidence,
      data: entry,
    }));
    const citations: Citation[] = recall.entries.map((entry) => ({
      kind: 'journal_entry',
      id: entry.id,
      timestamp: entry.date,
    }));

    return {
      ...baseResult(this.kind, started),
      confidence: recall.confidence,
      latencyMs: Date.now() - started,
      records,
      citations,
      provenance: [
        {
          origin: 'journal',
          method: 'semantic_search',
          table: 'journal_entries',
          journalIds: recall.entries.map((e) => e.id),
          confidence: recall.confidence,
        },
      ],
      raw: recall,
    };
  }
}

// ─── Working memory (existing assembler) ─────────────────────────────────────

export class WorkingMemoryExecutor implements QueryExecutor {
  kind = 'working_memory' as const;

  async execute(ctx: QueryContext): Promise<QueryResult> {
    const started = Date.now();
    const { assembleWorkingMemory, buildWorkingMemoryPacket } = await import(
      '../../services/chat/workingMemoryAssembler'
    );
    const assembly = await assembleWorkingMemory({
      question: ctx.message,
      userId: ctx.userId,
      threadId: ctx.threadId ?? null,
    });
    const packet = buildWorkingMemoryPacket(assembly);
    const items = [
      ...packet.people, ...packet.places, ...packet.projects, ...packet.goals,
      ...packet.skills, ...packet.communities, ...packet.events, ...packet.episodes,
    ];

    return {
      ...baseResult(this.kind, started),
      confidence: 0.7,
      latencyMs: Date.now() - started,
      records: items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        content: item.content || item.title,
        data: item,
      })),
      provenance: [
        { origin: 'working_memory', method: 'working_memory_assembler', confidence: 0.7 },
      ],
      raw: packet,
    };
  }
}

// ─── Crystallized knowledge (omega_claims) ───────────────────────────────────

export class CrystallizedKnowledgeExecutor implements QueryExecutor {
  kind = 'crystallized' as const;

  async execute(ctx: QueryContext): Promise<QueryResult> {
    const started = Date.now();
    const { loadPromptClaims } = await import('../../services/knowledgeCrystallization');
    const claims = await loadPromptClaims(ctx.userId);

    return {
      ...baseResult(this.kind, started),
      confidence: claims.length > 0 ? 0.8 : 0,
      latencyMs: Date.now() - started,
      records: claims.map((claim, index) => ({
        id: `claim:${claim.knowledge_type}:${index}`,
        type: 'claim',
        title: claim.knowledge_type,
        content: claim.human_readable_claim,
        score: claim.confidence,
        data: claim,
      })),
      citations: claims.map((claim, index) => ({
        kind: 'claim' as const,
        id: `claim:${claim.knowledge_type}:${index}`,
        label: claim.knowledge_type,
      })),
      provenance: [
        {
          origin: 'crystallized',
          method: 'crystallized_claims',
          table: 'omega_claims',
          confidence: 0.8,
        },
      ],
      raw: claims,
    };
  }
}

// ─── Graph (interfaces only — no graph database yet) ─────────────────────────

export class GraphExecutor implements QueryExecutor {
  kind = 'graph' as const;

  /**
   * TODO(graph): implement traversal over character_relationships +
   * omega entity edges. The plan shape is fixed (TraversalPlan/TraversalResult
   * in QueryTypes); this executor turns a QueryContext into a TraversalPlan,
   * walks edges breadth-first with the family-tree connectivity rules, and
   * returns paths as records ("Abel → Tony → Renna").
   */
  async traverse(_plan: TraversalPlan): Promise<TraversalResult> {
    return { paths: [], visited: 0 };
  }

  async execute(_ctx: QueryContext): Promise<QueryResult> {
    const started = Date.now();
    logger.debug('GraphExecutor is a placeholder — returning empty result');
    return {
      ...baseResult(this.kind, started),
      provenance: [{ origin: 'graph', method: 'placeholder', confidence: 0 }],
    };
  }
}

// ─── Timeline (placeholder — accepts TimeWindow, returns empty) ──────────────

export class TimelineExecutor implements QueryExecutor {
  kind = 'timeline' as const;

  /**
   * TODO(timeline): resolve ctx.plan.filters.timeframe (raw phrase or
   * relativeTo anchor) into a concrete window, then query resolved_events +
   * journal_entries within it. TimeWindow normalization belongs here so every
   * downstream consumer gets {start, end} instead of re-parsing phrases.
   */
  async execute(ctx: QueryContext): Promise<QueryResult> {
    const started = Date.now();
    const window = ctx.plan.filters.timeframe;
    logger.debug({ window }, 'TimelineExecutor is a placeholder — returning empty result');
    return {
      ...baseResult(this.kind, started),
      provenance: [{ origin: 'timeline', method: 'placeholder', confidence: 0 }],
    };
  }
}

// ─── Analytics (interfaces only — no statistics yet) ─────────────────────────

export class AnalyticsExecutor implements QueryExecutor {
  kind = 'analytics' as const;

  /**
   * TODO(analytics): implement AggregateSpec execution (most mentioned people,
   * most visited places, skill usage over time) as batched SQL aggregations —
   * never per-entity loops.
   */
  async aggregate(_spec: AggregateSpec): Promise<QueryRecord[]> {
    return [];
  }

  async execute(_ctx: QueryContext): Promise<QueryResult> {
    const started = Date.now();
    logger.debug('AnalyticsExecutor is a placeholder — returning empty result');
    return {
      ...baseResult(this.kind, started),
      provenance: [{ origin: 'analytics', method: 'placeholder', confidence: 0 }],
    };
  }
}

/** Default registry. Injectable so tests can substitute fakes. */
export function createDefaultExecutorRegistry(): Map<ExecutorKind, QueryExecutor> {
  const executors: QueryExecutor[] = [
    new StructuredRecallExecutor(),
    new ThreadRecallExecutor(),
    new SemanticRecallExecutor(),
    new WorkingMemoryExecutor(),
    new CrystallizedKnowledgeExecutor(),
    new GraphExecutor(),
    new TimelineExecutor(),
    new AnalyticsExecutor(),
  ];
  return new Map(executors.map((e) => [e.kind, e]));
}
