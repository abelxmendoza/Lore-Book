/**
 * QueryEngine — the canonical retrieval pipeline (Phase 2: adaptive planner):
 *
 *   Natural language → EntityResolver (canonical IDs first)
 *     → IntentClassifier → QueryPlanner (rule-table driven)
 *     → adaptive execution (priority tiers, evidence conditions, early stop)
 *     → ResultMerger → provenance + explainable confidence
 *     → QueryInspector trace + ExecutionMetrics.
 *
 * The engine orchestrates existing retrieval services; it owns no SQL of its
 * own. Executor failures are isolated: one failing source degrades the answer,
 * never the request.
 */

import { logger } from '../../logger';

import { entityResolver, type EntityResolver } from './EntityResolver';
import { classifyQuery } from './IntentClassifier';
import { planQuery } from './QueryPlanner';
import { createDefaultExecutorRegistry, type QueryExecutor } from './QueryExecutor';
import { executionMetrics } from './ExecutionMetrics';
import { queryInspector } from './QueryInspector';
import { mergeResults } from './ResultMerger';
import {
  QueryType,
  type ExecutorKind,
  type MergedQueryResponse,
  type PlanStage,
  type QueryClassification,
  type QueryContext,
  type QueryPlan,
  type QueryResult,
  type ResolvedQueryEntity,
} from './QueryTypes';

export type QueryEngineInput = {
  userId: string;
  message: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  threadId?: string;
};

export type QueryEngineOutput = {
  classification: QueryClassification;
  plan: QueryPlan;
  results: QueryResult[];
  merged: MergedQueryResponse;
  resolvedEntities: ResolvedQueryEntity[];
};

function skippedResult(stage: PlanStage, reason: string): QueryResult {
  return {
    source: stage.kind,
    confidence: 0,
    provenance: [],
    latencyMs: 0,
    records: [],
    citations: [],
    skipped: true,
    skipReason: reason,
  };
}

export class QueryEngine {
  constructor(
    private readonly registry: Map<ExecutorKind, QueryExecutor> = createDefaultExecutorRegistry(),
    private readonly resolver: EntityResolver = entityResolver,
  ) {}

  classify(message: string): QueryClassification {
    return classifyQuery(message);
  }

  /** Entity-first: resolve mentions to canonical IDs before planning. */
  async resolveEntities(userId: string, message: string): Promise<ResolvedQueryEntity[]> {
    const classification = this.classify(message);
    return this.resolver.resolve(userId, classification.matchedEntities);
  }

  plan(input: QueryEngineInput, resolvedEntities?: ResolvedQueryEntity[]): QueryPlan {
    const classification = this.classify(input.message);
    return planQuery(classification, {
      hasConversationHistory: (input.conversationHistory ?? []).length > 0,
      resolvedEntities,
    });
  }

  /**
   * Execute a single executor against an already-built context. Exists for
   * the legacy recall flow, which keeps its exact decision tree while all
   * data access runs through the engine.
   */
  async executeKind(kind: ExecutorKind, ctx: QueryContext): Promise<QueryResult> {
    const executor = this.registry.get(kind);
    if (!executor) {
      return {
        source: kind,
        confidence: 0,
        provenance: [],
        latencyMs: 0,
        records: [],
        citations: [],
        error: `no executor registered for kind "${kind}"`,
      };
    }
    const started = Date.now();
    try {
      return await executor.execute(ctx);
    } catch (error) {
      logger.warn({ error, kind }, 'query executor failed (isolated)');
      return {
        source: kind,
        confidence: 0,
        provenance: [],
        latencyMs: Date.now() - started,
        records: [],
        citations: [],
        error: error instanceof Error ? error.message : 'executor failed',
      };
    }
  }

  buildContext(
    input: QueryEngineInput,
    plan: QueryPlan,
    resolvedEntities?: ResolvedQueryEntity[],
  ): QueryContext {
    return {
      userId: input.userId,
      message: input.message,
      conversationHistory: input.conversationHistory ?? [],
      threadId: input.threadId,
      plan,
      resolvedEntities: resolvedEntities ?? plan.resolvedEntities,
    };
  }

  /**
   * Full pipeline: resolve entities → classify → plan → adaptive execution →
   * merge. Execution is evidence-driven: stages run in priority tiers; a
   * tier is skipped when its condition says the evidence so far suffices,
   * and everything after stops once merged confidence reaches the plan's
   * sufficiency threshold.
   */
  async run(input: QueryEngineInput): Promise<QueryEngineOutput> {
    const startedAt = Date.now();

    // ── Entity-first planning ────────────────────────────────────────────
    const classification = this.classify(input.message);
    let resolvedEntities: ResolvedQueryEntity[] = [];
    if (classification.matchedEntities.length > 0) {
      resolvedEntities = await this.resolver.resolve(input.userId, classification.matchedEntities);
    }

    const plan = planQuery(classification, {
      hasConversationHistory: (input.conversationHistory ?? []).length > 0,
      resolvedEntities,
    });
    const ctx = this.buildContext(input, plan, resolvedEntities);

    // ── Adaptive execution over priority tiers ───────────────────────────
    const tiers = new Map<ExecutorKind, number>();
    const results: QueryResult[] = [];
    let merged = mergeResults(results);
    let earlyStopped = false;

    const tierValues = [...new Set(plan.stages.map((s) => s.priority))].sort((a, b) => a - b);
    for (const tier of tierValues) {
      const tierStages = plan.stages.filter((s) => s.priority === tier);
      for (const stage of tierStages) tiers.set(stage.kind, tier);

      if (earlyStopped) {
        for (const stage of tierStages) {
          results.push(skippedResult(stage, `confidence ${merged.confidence.toFixed(2)} ≥ ${plan.sufficientConfidence} — early stop`));
        }
        continue;
      }

      // Evidence conditions: run only the stages the current evidence calls for.
      const toRun: PlanStage[] = [];
      for (const stage of tierStages) {
        if (stage.runIf === 'if_low_confidence' && merged.confidence >= plan.sufficientConfidence) {
          results.push(skippedResult(stage, 'confidence already sufficient'));
          continue;
        }
        if (stage.runIf === 'if_no_records' && merged.records.length > 0) {
          results.push(skippedResult(stage, 'records already retrieved'));
          continue;
        }
        toRun.push(stage);
      }

      if (toRun.length > 0) {
        const tierResults = await Promise.all(toRun.map((stage) => this.executeKind(stage.kind, ctx)));
        // Stamp adaptive-execution provenance without touching executor output shape.
        for (const result of tierResults) {
          for (const p of result.provenance) {
            p.strategy = p.strategy ?? `adaptive_tier_${tier}`;
            p.executor = p.executor ?? result.source;
            p.confidenceSource = p.confidenceSource ?? 'executor';
          }
        }
        results.push(...tierResults);
        merged = mergeResults(results);
      }

      // Cost-based early stop: enough confidence with actual evidence → done.
      if (merged.confidence >= plan.sufficientConfidence && merged.records.length > 0) {
        earlyStopped = tier !== tierValues[tierValues.length - 1];
        if (earlyStopped) continue;
      }
    }

    // Entity-resolution provenance rides the merged response.
    for (const entity of resolvedEntities) {
      merged.provenance.push({
        origin: 'foundation',
        method: 'entity_resolution',
        confidence: entity.confidence,
        confidenceSource: 'entity_resolver',
        entityResolution: { mention: entity.mention, id: entity.id, method: entity.method },
      });
    }

    const totalLatencyMs = Date.now() - startedAt;
    const executed = results.filter((r) => !r.skipped);

    queryInspector.record({
      userId: input.userId,
      query: input.message,
      classification,
      plan,
      resolvedEntities,
      results,
      merged,
      totalLatencyMs,
      earlyStopped,
      tiers,
    });
    executionMetrics.recordQuery({
      intent: classification.intent,
      latencyMs: totalLatencyMs,
      executed: executed.map((r) => ({ kind: r.source, cacheHit: r.cacheHit })),
      finalConfidence: merged.confidence,
      earlyStopped,
      usedFallback: executed.some((r) => r.source === 'semantic') && classification.intent !== QueryType.SEMANTIC,
      knowledgeGap:
        merged.records.length === 0 ||
        resolvedEntities.some((e) => e.method === 'unresolved'),
    });

    return { classification, plan, results, merged, resolvedEntities };
  }
}

export const queryEngine = new QueryEngine();
