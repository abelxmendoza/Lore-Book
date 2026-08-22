/**
 * Query executors — modular retrieval units behind a single interface.
 *
 * Rule: executors ORCHESTRATE existing services (router, recall engine,
 * working memory assembler, claims loader); they never re-implement
 * retrieval, add queries, or bypass existing caches/batching.
 */

import { logger } from '../../logger';
import { hasFoundationContent } from '../../services/chat/foundationContent';

import type {
  Citation,
  ExecutorKind,
  GraphNode,
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

    const records: QueryRecord[] = hasFoundationContent(routed.contextBlock)
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

// ─── Books (normalized entity-book registry) ─────────────────────────────────

export class BookQueryExecutor implements QueryExecutor {
  kind = 'books' as const;

  async execute(ctx: QueryContext): Promise<QueryResult> {
    const started = Date.now();
    const { queryBooksForUser } = await import('../../services/query/bookQueryRegistry');
    const response = await queryBooksForUser(ctx.userId, {
      query: ctx.message,
      limit: 40,
      perDomainLimit: 10,
      includeEvidence: true,
    });
    const evidence = response.results.flatMap((result) => result.evidence);
    const confidence = response.results.length
      ? Math.min(0.88, Math.max(0.55, response.results[0].score / 100))
      : 0;

    return {
      ...baseResult(this.kind, started),
      confidence,
      latencyMs: Date.now() - started,
      records: response.results.map((result) => ({
        id: result.id,
        type: result.domain,
        title: result.title,
        content: [
          result.subtitle,
          ...result.matchedReasons,
        ].filter(Boolean).join(' · '),
        score: result.score,
        data: result,
      })),
      citations: evidence.map((item) => ({
        kind: item.sourceTable === 'resolved_events' ? 'event' as const : 'entity' as const,
        id: item.sourceId,
        label: item.label,
        timestamp: item.observedAt ?? undefined,
      })),
      provenance: [{
        origin: 'foundation',
        method: 'book_query_registry',
        table: 'lorebook_books',
        entityIds: response.results.map((result) => result.id),
        confidence,
      }],
      raw: response,
      error: response.diagnostics.degradedDomains.length
        ? `degraded books: ${response.diagnostics.degradedDomains.join(', ')}`
        : undefined,
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

// ─── Graph (canonical cross-Book traversal) ──────────────────────────────────

export class GraphExecutor implements QueryExecutor {
  kind = 'graph' as const;

  private graphNodeType(type: string | undefined): GraphNode['type'] {
    const normalized = type?.toLowerCase();
    if (normalized === 'person') return 'character';
    if (normalized === 'place') return 'location';
    if ([
      'character', 'organization', 'family', 'location', 'romance', 'project',
      'skill', 'quest', 'event', 'document', 'narrative',
    ].includes(normalized ?? '')) {
      return normalized as GraphNode['type'];
    }
    return 'entity';
  }

  private edgeTypes(message: string): string[] {
    const types: string[] = [];
    if (/\bintroduc(?:e|ed|tion)\b/i.test(message)) types.push('introduced');
    if (/\b(?:member|group|organization|team|band)\b/i.test(message)) types.push('membership');
    if (/\b(?:place|location|located|where)\b/i.test(message)) types.push('location');
    if (/\bprojects?\b/i.test(message)) types.push('project');
    if (/\bskills?\b/i.test(message)) types.push('skill');
    return types;
  }

  async traverse(userId: string, plan: TraversalPlan): Promise<TraversalResult> {
    const { canonicalBookGraphService } = await import(
      '../../services/query/canonicalBookGraphService'
    );
    return canonicalBookGraphService.traverse(userId, plan);
  }

  async execute(ctx: QueryContext): Promise<QueryResult> {
    const started = Date.now();
    const anchors = (ctx.resolvedEntities ?? []).filter((entity) => entity.id);
    if (!anchors.length) {
      return {
        ...baseResult(this.kind, started),
        provenance: [{ origin: 'graph', method: 'canonical_book_graph', confidence: 0 }],
        error: 'graph query had no resolved canonical entity anchor',
      };
    }

    const start = anchors[0]!;
    const target = anchors[1];
    const plan: TraversalPlan = {
      startNode: { id: start.id! },
      edgeTypes: this.edgeTypes(ctx.message),
      maxDepth: target ? 4 : 2,
      target: target
        ? {
            name: target.canonicalName ?? target.mention,
            type: this.graphNodeType(target.type),
          }
        : undefined,
    };
    const traversal = await this.traverse(ctx.userId, plan);
    const records = traversal.paths.map((path, index) => ({
      id: `graph-path:${index}:${path.nodes.map((node) => node.id).join(':')}`,
      type: 'graph_path',
      title: path.nodes.map((node) => node.name).join(' → '),
      content: path.edges.map((edge, edgeIndex) => {
        const from = path.nodes[edgeIndex]?.name ?? edge.fromId;
        const to = path.nodes[edgeIndex + 1]?.name ?? edge.toId;
        return `${from} —[${edge.type}]→ ${to}`;
      }).join(' · '),
      score: Math.round(
        Math.min(...path.edges.map((edge) => edge.confidence ?? 0.7)) * 100
        - Math.max(0, path.edges.length - 1) * 5,
      ),
      data: path,
    }));
    const evidence = traversal.paths.flatMap((path) =>
      path.edges.flatMap((edge) => edge.evidence ?? []));
    const confidence = records.length
      ? Math.max(0.5, Math.min(0.95, (records[0]?.score ?? 70) / 100))
      : 0;

    return {
      ...baseResult(this.kind, started),
      confidence,
      latencyMs: Date.now() - started,
      records,
      citations: [...new Map(evidence.map((item) => [
        `${item.sourceTable}:${item.sourceId}`,
        {
          kind: item.sourceTable === 'resolved_events' ? 'event' as const : 'entity' as const,
          id: item.sourceId,
          label: item.label,
          timestamp: item.observedAt ?? undefined,
        },
      ])).values()],
      provenance: traversal.paths.map((path) => ({
        origin: 'graph' as const,
        method: 'canonical_book_graph_bfs',
        table: 'canonical_book_graph',
        entityIds: path.nodes.map((node) => node.id),
        traversalPath: path.nodes.map((node) => node.name),
        confidence: Math.min(...path.edges.map((edge) => edge.confidence ?? 0.7)),
      })),
      raw: traversal,
      error: traversal.degradedSources?.length
        ? `degraded graph sources: ${traversal.degradedSources.join(', ')}`
        : undefined,
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
    new BookQueryExecutor(),
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
