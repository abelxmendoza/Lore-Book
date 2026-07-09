/**
 * QueryEngine — the canonical retrieval pipeline:
 *
 *   Natural language → IntentClassifier → QueryPlanner → executors
 *   (structured / thread / semantic / working-memory / crystallized /
 *   graph / timeline / analytics) → ResultMerger → provenance + confidence.
 *
 * The engine orchestrates existing retrieval services; it owns no SQL of its
 * own. Executor failures are isolated: one failing source degrades the answer,
 * never the request.
 */

import { logger } from '../../logger';

import { classifyQuery } from './IntentClassifier';
import { planQuery } from './QueryPlanner';
import { createDefaultExecutorRegistry, type QueryExecutor } from './QueryExecutor';
import { mergeResults } from './ResultMerger';
import type {
  ExecutorKind,
  MergedQueryResponse,
  QueryClassification,
  QueryContext,
  QueryPlan,
  QueryResult,
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
};

export class QueryEngine {
  constructor(
    private readonly registry: Map<ExecutorKind, QueryExecutor> = createDefaultExecutorRegistry(),
  ) {}

  classify(message: string): QueryClassification {
    return classifyQuery(message);
  }

  plan(input: QueryEngineInput): QueryPlan {
    const classification = this.classify(input.message);
    return planQuery(classification, {
      hasConversationHistory: (input.conversationHistory ?? []).length > 0,
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

  buildContext(input: QueryEngineInput, plan: QueryPlan): QueryContext {
    return {
      userId: input.userId,
      message: input.message,
      conversationHistory: input.conversationHistory ?? [],
      threadId: input.threadId,
      plan,
    };
  }

  /** Full pipeline: classify → plan → execute all planned executors → merge. */
  async run(input: QueryEngineInput): Promise<QueryEngineOutput> {
    const plan = this.plan(input);
    const ctx = this.buildContext(input, plan);

    const results = await Promise.all(
      plan.executors.map((planned) => this.executeKind(planned.kind, ctx)),
    );

    return {
      classification: plan.classification,
      plan,
      results,
      merged: mergeResults(results),
    };
  }
}

export const queryEngine = new QueryEngine();
