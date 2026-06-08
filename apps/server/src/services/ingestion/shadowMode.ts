// =====================================================
// SHADOW MODE ORCHESTRATOR
// Purpose: Run the merged extractor in parallel with the existing pipeline
//          and write a side-by-side comparison to shadow_extraction_log.
//
// Contract:
//   - NEVER modifies any production table.
//   - NEVER throws — all errors are swallowed and logged.
//   - Runs via setImmediate so it never adds latency to the chat path.
//
// Observability dimensions:
//   Quality   — precision / recall / F1 per signal class
//   Economics — token, call-count, and latency reduction
//   Discovery — novel signals merged found that baseline missed
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { mergedExtractor } from './mergedExtractor';
import type {
  UnifiedExtractionPayload,
  ShadowComparisonMetrics,
  SignalQuality,
  NovelDiscovery,
  ThresholdCheck,
  ThresholdVerdict,
  ReadinessReport,
} from './types/unifiedExtraction';

// ─── BASELINE ESTIMATES ───────────────────────────────────────────────────────
// Derived from the LLM call path audit (14.2 weighted calls, ~19,400 tokens,
// ~2,400 ms serial-equivalent latency per message).
const BASELINE_TOKENS    = 19_400;
const BASELINE_CALLS     = 14.2;
const BASELINE_LATENCY_MS = 2_400;   // serial equivalent of 14 round-trips at ~170 ms each

// ─── BASELINE INTEGRITY (Sprint P) ────────────────────────────────────────────
// `_shadowBaseline.entities`/`.relationships` were gated in
// ingestionPipelineClass.ts behind `resolvedEntities.length >= 2`, so any
// message that resolved exactly 0 or 1 entities logged an EMPTY baseline.
// `signalQuality()` (below) treats an empty baseline as a trivial {1,1,1} —
// correct for a genuinely-empty ground truth, but indistinguishable from a
// capture failure. Every row logged before the gate fix shipped therefore
// carries a degenerate, non-evidentiary quality score. Rows logged at/after
// this timestamp were captured by the corrected `>= 1` gate and are trustworthy.
const BASELINE_CAPTURE_FIX_DEPLOYED_AT = '2026-06-08T18:00:00.000Z';

// Signal classes the shadow harness structurally cannot baseline against —
// reporting them as PASS/FAIL would silently launder an empty-baseline default
// as measured quality. Surfaced as NOT_COMPARABLE instead of folded into the
// pass/fail tally:
//   - romantic_signal_*: the legacy pipeline has NO synchronous romantic-signal
//     detector. Romantic-signal extraction is a net-new capability the merged
//     extractor introduces — there is nothing on the other side of the ledger
//     to compare against, ever, with this architecture.
//   - interest_*: `interestDetector.detectInterests` exists in the legacy
//     pipeline (Step 12.11) but runs async/fire-and-forget — it cannot be
//     captured into `_shadowBaseline` without awaiting it, which would change
//     pipeline blocking behavior (out of scope for a measurement-only fix).
const NOT_COMPARABLE_HARD_BLOCK_METRICS = ['romantic_signal_precision'];

// ─── THRESHOLD DEFINITIONS ────────────────────────────────────────────────────
// Three decision gates: 50-message sanity check → 100-message quality lock →
// 200-message A/B approval. Each gate must be fully cleared before advancing.

interface ThresholdSet {
  entityPrecision:          number;
  entityRecall:             number;
  entityF1:                 number;
  relationshipRecall:       number;
  tokenRatioCeiling:        number;   // merged/baseline — lower is better
  successRateFloor:         number;
  romanticSignalPrecision:  number;   // highest-risk class; replaces trivially-passing callRatioCeiling
}

const THRESHOLDS: Record<50 | 100 | 200, ThresholdSet> = {
  50: {
    entityPrecision:         0.78,
    entityRecall:            0.72,
    entityF1:                0.74,
    relationshipRecall:      0.65,
    tokenRatioCeiling:       0.60,
    successRateFloor:        0.90,
    romanticSignalPrecision: 0.78,
  },
  100: {
    entityPrecision:         0.84,
    entityRecall:            0.80,
    entityF1:                0.82,
    relationshipRecall:      0.75,
    tokenRatioCeiling:       0.52,
    successRateFloor:        0.94,
    romanticSignalPrecision: 0.82,
  },
  200: {
    entityPrecision:         0.88,
    entityRecall:            0.85,
    entityF1:                0.86,
    relationshipRecall:      0.80,
    tokenRatioCeiling:       0.45,
    successRateFloor:        0.97,
    romanticSignalPrecision: 0.85,
  },
};

// ─── SHADOW INPUT CONTRACT ────────────────────────────────────────────────────

export interface ShadowRunInput {
  messageId: string;
  userId:    string;
  rawText:   string;
  sender:    'USER' | 'AI';
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  knownEntityNames?: string[];

  // Synchronous signals from the existing pipeline — used as quality baseline
  baseline: {
    entities:        Array<{ name: string; type: string }>;
    relationships:   Array<{ from: string; to: string; type: string }>;
    interests:       Array<{ name: string; category?: string }>;
    romanticSignals: Array<{ person_name: string; signal_type: string }>;
    experiences:     Array<{ content: string; type: string }>;
  };
}

// ─── MATH HELPERS ─────────────────────────────────────────────────────────────

function f1(precision: number, recall: number): number {
  if (precision + recall === 0) return 0;
  return 2 * (precision * recall) / (precision + recall);
}

function reductionPct(merged: number, baseline: number): number {
  if (baseline === 0) return 0;
  return Math.round(((baseline - merged) / baseline) * 1000) / 10; // one decimal
}

// Precision/recall against a baseline set using normalised string matching.
function signalQuality(
  mergedKeys: string[],
  baselineKeys: string[],
): SignalQuality {
  if (baselineKeys.length === 0 && mergedKeys.length === 0) {
    return { precision: 1, recall: 1, f1: 1 };
  }
  if (baselineKeys.length === 0) {
    // merged found things baseline didn't track — can't penalise precision
    return { precision: 1, recall: 1, f1: 1 };
  }
  if (mergedKeys.length === 0) {
    return { precision: 1, recall: 0, f1: 0 };
  }

  const mergedSet   = new Set(mergedKeys.map(k => k.toLowerCase().trim()));
  const baselineSet = new Set(baselineKeys.map(k => k.toLowerCase().trim()));

  let tp = 0;
  for (const k of mergedSet) { if (baselineSet.has(k)) tp++; }

  const precision = tp / mergedSet.size;
  const recall    = tp / baselineSet.size;
  return { precision, recall, f1: f1(precision, recall) };
}

// Novel items: in merged but not in baseline (things baseline missed)
function novelItems<T>(
  baselineKeys: string[],
  mergedObjects: T[],
  keyFn: (obj: T) => string,
): T[] {
  const baselineSet = new Set(baselineKeys.map(k => k.toLowerCase().trim()));
  return mergedObjects.filter(obj => !baselineSet.has(keyFn(obj).toLowerCase().trim()));
}

// ─── CORE METRIC COMPUTATION ──────────────────────────────────────────────────

function computeMetrics(
  payload:       UnifiedExtractionPayload | null,
  baseline:      ShadowRunInput['baseline'],
  tokenCount:    number,
  callCount:     number,
  latencyMs:     number,
): ShadowComparisonMetrics {
  const empty: SignalQuality = { precision: 0, recall: 0, f1: 0 };
  const emptyNovel: NovelDiscovery = { entities: [], relationships: [], experiences: [] };

  if (!payload) {
    return {
      entity:          empty,
      relationship:    empty,
      romantic_signal: empty,
      interest:        empty,
      merged_token_count:            0,
      baseline_token_count_estimate: BASELINE_TOKENS,
      token_reduction_pct:           0,
      merged_call_count:             0,
      baseline_call_count_estimate:  BASELINE_CALLS,
      call_reduction_pct:            0,
      merged_latency_ms:             latencyMs,
      baseline_latency_estimate_ms:  BASELINE_LATENCY_MS,
      latency_reduction_pct:         0,
      novel:                         emptyNovel,
      novel_entity_count:            0,
      novel_relationship_count:      0,
      novel_experience_count:        0,
    };
  }

  // Quality ──────────────────────────────────────────────────────────────────
  const entityQuality = signalQuality(
    payload.entities.map(e => e.name),
    baseline.entities.map(e => e.name),
  );

  const relQuality = signalQuality(
    payload.entity_relationships.map(r => `${r.from_entity_name}→${r.to_entity_name}:${r.relationship_type}`),
    baseline.relationships.map(r => `${r.from}→${r.to}:${r.type}`),
  );

  const romanticQuality = signalQuality(
    payload.romantic_signals.map(r => r.person_name),
    baseline.romanticSignals.map(r => r.person_name),
  );

  const interestQuality = signalQuality(
    payload.interests.map(i => i.name),
    baseline.interests.map(i => i.name),
  );

  // Economics ────────────────────────────────────────────────────────────────
  const tokenReductionPct   = reductionPct(tokenCount, BASELINE_TOKENS);
  const callReductionPct    = reductionPct(callCount, BASELINE_CALLS);
  const latencyReductionPct = reductionPct(latencyMs, BASELINE_LATENCY_MS);

  // Novel discovery (merged found, baseline missed) ──────────────────────────
  const novelEntities = novelItems(
    baseline.entities.map(e => e.name),
    payload.entities,
    e => e.name,
  ).map(e => ({ name: e.name, type: e.type }));

  const novelRelationships = novelItems(
    baseline.relationships.map(r => `${r.from}→${r.to}`),
    payload.entity_relationships,
    r => `${r.from_entity_name}→${r.to_entity_name}`,
  ).map(r => ({ from: r.from_entity_name, to: r.to_entity_name, type: r.relationship_type }));

  const baselineExpContent = new Set(
    baseline.experiences.map(e => e.content.toLowerCase().trim().slice(0, 80)),
  );
  const novelExperiences = payload.semantic_units
    .filter(u => u.type === 'EXPERIENCE' && u.confidence >= 0.55)
    .filter(u => !baselineExpContent.has(u.content.toLowerCase().trim().slice(0, 80)))
    .map(u => ({ content: u.content, confidence: u.confidence }));

  return {
    entity:          entityQuality,
    relationship:    relQuality,
    romantic_signal: romanticQuality,
    interest:        interestQuality,
    merged_token_count:            tokenCount,
    baseline_token_count_estimate: BASELINE_TOKENS,
    token_reduction_pct:           tokenReductionPct,
    merged_call_count:             callCount,
    baseline_call_count_estimate:  BASELINE_CALLS,
    call_reduction_pct:            callReductionPct,
    merged_latency_ms:             latencyMs,
    baseline_latency_estimate_ms:  BASELINE_LATENCY_MS,
    latency_reduction_pct:         latencyReductionPct,
    novel:                         { entities: novelEntities, relationships: novelRelationships, experiences: novelExperiences },
    novel_entity_count:            novelEntities.length,
    novel_relationship_count:      novelRelationships.length,
    novel_experience_count:        novelExperiences.length,
  };
}

// ─── SHADOW ORCHESTRATOR ──────────────────────────────────────────────────────

class ShadowModeOrchestrator {
  private enabled = true;

  async runShadow(input: ShadowRunInput): Promise<void> {
    if (!this.enabled) return;
    if (input.sender === 'AI') return;

    try {
      const result = await mergedExtractor.extract({
        userId:              input.userId,
        rawText:             input.rawText,
        sender:              input.sender,
        conversationHistory: input.conversationHistory,
        knownEntityNames:    input.knownEntityNames,
      });

      const metrics = computeMetrics(
        result.payload,
        input.baseline,
        result.tokenCount,
        result.payload ? 1 : 0,
        result.runtimeMs,
      );

      const r3 = (n: number) => Math.round(n * 1000) / 1000;
      const r1 = (n: number) => Math.round(n * 10) / 10;

      await supabaseAdmin.from('shadow_extraction_log').insert({
        message_id:               input.messageId,
        user_id:                  input.userId,
        merged_extraction:        result.payload ?? null,
        merged_error:             result.error ?? null,
        merged_token_count:       result.tokenCount,
        merged_call_count:        result.payload ? 1 : 0,
        merged_runtime_ms:        result.runtimeMs,
        baseline_entities:        input.baseline.entities,
        baseline_relationships:   input.baseline.relationships,
        baseline_interests:       input.baseline.interests,
        baseline_romantic_signals: input.baseline.romanticSignals,
        baseline_experiences:     input.baseline.experiences,
        baseline_token_count_est: BASELINE_TOKENS,
        baseline_call_count_est:  Math.round(BASELINE_CALLS),
        // Quality
        entity_precision:          r3(metrics.entity.precision),
        entity_recall:             r3(metrics.entity.recall),
        entity_f1:                 r3(metrics.entity.f1),
        relationship_precision:    r3(metrics.relationship.precision),
        relationship_recall:       r3(metrics.relationship.recall),
        relationship_f1:           r3(metrics.relationship.f1),
        romantic_signal_precision: r3(metrics.romantic_signal.precision),
        romantic_signal_recall:    r3(metrics.romantic_signal.recall),
        romantic_signal_f1:        r3(metrics.romantic_signal.f1),
        interest_recall:           r3(metrics.interest.recall),
        interest_f1:               r3(metrics.interest.f1),
        // Economics
        token_reduction_pct:       r1(metrics.token_reduction_pct),
        call_reduction_pct:        r1(metrics.call_reduction_pct),
        latency_reduction_pct:     r1(metrics.latency_reduction_pct),
        token_ratio:               r3(result.tokenCount / BASELINE_TOKENS),
        call_ratio:                r3(1 / BASELINE_CALLS),
        // Discovery
        novel_entities:            metrics.novel.entities,
        novel_relationships:       metrics.novel.relationships,
        novel_experiences:         metrics.novel.experiences,
        novel_entity_count:        metrics.novel_entity_count,
        novel_relationship_count:  metrics.novel_relationship_count,
        novel_experience_count:    metrics.novel_experience_count,
      });

      logger.debug({
        userId:             input.userId,
        messageId:          input.messageId,
        entityF1:           r3(metrics.entity.f1),
        entityRecall:       r3(metrics.entity.recall),
        entityPrecision:    r3(metrics.entity.precision),
        relRecall:          r3(metrics.relationship.recall),
        tokenReductionPct:  r1(metrics.token_reduction_pct),
        callReductionPct:   r1(metrics.call_reduction_pct),
        novelEntities:      metrics.novel_entity_count,
        novelRelationships: metrics.novel_relationship_count,
        mergedTokens:       result.tokenCount,
        latencyMs:          result.runtimeMs,
      }, 'ShadowMode: comparison logged');

      // Hard alert: entity recall below emergency threshold
      if (metrics.entity.recall < 0.70 && input.baseline.entities.length > 2) {
        logger.warn({
          userId:           input.userId,
          messageId:        input.messageId,
          entityRecall:     metrics.entity.recall,
          entityF1:         metrics.entity.f1,
          mergedEntities:   result.payload?.entities.map(e => e.name),
          baselineEntities: input.baseline.entities.map(e => e.name),
        }, 'ShadowMode: ENTITY RECALL CRITICAL — merged extractor needs review');
      }

    } catch (err) {
      logger.debug({ err, userId: input.userId, messageId: input.messageId }, 'ShadowMode: run failed (non-critical)');
    }
  }

  // ─── AGGREGATE METRICS ──────────────────────────────────────────────────────

  async getAggregatedMetrics(windowHours = 24): Promise<{
    quality: {
      entity:        { precision: number; recall: number; f1: number };
      relationship:  { recall: number; f1: number };
      romanticSignal:{ recall: number; f1: number };
      interest:      { recall: number; f1: number };
    };
    economics: {
      avgMergedTokens:      number;
      avgTokenReductionPct: number;
      avgCallReductionPct:  number;
      avgMergedLatencyMs:   number;
      avgLatencyReductionPct: number;
    };
    discovery: {
      avgNovelEntityRate:       number;
      avgNovelRelationshipRate: number;
      avgNovelExperienceRate:   number;
      totalNovelEntities:       number;
      totalNovelRelationships:  number;
    };
    summary: {
      sampleCount:  number;
      successRate:  number;
      windowHours:  number;
    };
  } | null> {
    try {
      const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabaseAdmin
        .from('shadow_extraction_log')
        .select([
          'entity_precision', 'entity_recall', 'entity_f1',
          'relationship_recall', 'relationship_f1',
          'romantic_signal_recall', 'romantic_signal_f1',
          'interest_recall', 'interest_f1',
          'token_reduction_pct', 'call_reduction_pct',
          'latency_reduction_pct', 'merged_runtime_ms',
          'merged_token_count',
          'novel_entity_count', 'novel_relationship_count', 'novel_experience_count',
          'merged_extraction',
        ].join(', '))
        .gte('created_at', since)
        .limit(10_000);

      if (error || !data || data.length === 0) return null;

      const rows        = data as unknown as any[];
      const successful  = rows.filter(r => r.merged_extraction !== null);
      const n           = successful.length;
      const total       = rows.length;
      if (n === 0) return null;

      const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
      const get = (r: any, k: string): number => typeof r[k] === 'number' ? r[k] : 0;

      return {
        quality: {
          entity: {
            precision: avg(successful.map(r => get(r, 'entity_precision'))),
            recall:    avg(successful.map(r => get(r, 'entity_recall'))),
            f1:        avg(successful.map(r => get(r, 'entity_f1'))),
          },
          relationship: {
            recall: avg(successful.map(r => get(r, 'relationship_recall'))),
            f1:     avg(successful.map(r => get(r, 'relationship_f1'))),
          },
          romanticSignal: {
            recall: avg(successful.map(r => get(r, 'romantic_signal_recall'))),
            f1:     avg(successful.map(r => get(r, 'romantic_signal_f1'))),
          },
          interest: {
            recall: avg(successful.map(r => get(r, 'interest_recall'))),
            f1:     avg(successful.map(r => get(r, 'interest_f1'))),
          },
        },
        economics: {
          avgMergedTokens:        avg(successful.map(r => get(r, 'merged_token_count'))),
          avgTokenReductionPct:   avg(successful.map(r => get(r, 'token_reduction_pct'))),
          avgCallReductionPct:    avg(successful.map(r => get(r, 'call_reduction_pct'))),
          avgMergedLatencyMs:     avg(successful.map(r => get(r, 'merged_runtime_ms'))),
          avgLatencyReductionPct: avg(successful.map(r => get(r, 'latency_reduction_pct'))),
        },
        discovery: {
          avgNovelEntityRate:       avg(successful.map(r => get(r, 'novel_entity_count'))),
          avgNovelRelationshipRate: avg(successful.map(r => get(r, 'novel_relationship_count'))),
          avgNovelExperienceRate:   avg(successful.map(r => get(r, 'novel_experience_count'))),
          totalNovelEntities:       sum(successful.map(r => get(r, 'novel_entity_count'))),
          totalNovelRelationships:  sum(successful.map(r => get(r, 'novel_relationship_count'))),
        },
        summary: {
          sampleCount: total,
          successRate: n / total,
          windowHours,
        },
      };
    } catch (err) {
      logger.debug({ err }, 'ShadowMode: failed to aggregate metrics');
      return null;
    }
  }

  // ─── GO / NO-GO READINESS REPORT ─────────────────────────────────────────────
  // Returns a structured decision gate for a given sample threshold (50/100/200).

  async getReadinessReport(targetSamples: 50 | 100 | 200): Promise<ReadinessReport> {
    const thresholds = THRESHOLDS[targetSamples];
    const generated_at = new Date().toISOString();

    // Pull all data (no time window — use total sample population)
    const { data, error } = await supabaseAdmin
      .from('shadow_extraction_log')
      .select([
        'created_at',
        'entity_precision', 'entity_recall', 'entity_f1',
        'relationship_recall', 'relationship_f1',
        'romantic_signal_precision', 'romantic_signal_recall',
        'interest_recall', 'interest_f1',
        'token_reduction_pct', 'call_reduction_pct',
        'latency_reduction_pct', 'merged_runtime_ms',
        'merged_token_count',
        'novel_entity_count', 'novel_relationship_count',
        'merged_extraction',
      ].join(', '))
      .limit(20_000);

    const empty: ReadinessReport = {
      sample_count:             0,
      required_samples:         targetSamples,
      ready_for_ab:             false,
      hard_blocks:              [],
      soft_warnings:            [],
      passed:                   [],
      not_comparable:           [],
      baseline_valid:           false,
      valid_sample_count:       0,
      invalid_sample_count:     0,
      avg_token_reduction_pct:  0,
      avg_call_reduction_pct:   0,
      avg_latency_ms:           0,
      avg_entity_f1:            0,
      avg_relationship_recall:  0,
      avg_novel_entity_rate:    0,
      avg_novel_relationship_rate: 0,
      success_rate:             0,
      generated_at,
    };

    if (error || !data || data.length === 0) return empty;

    const allRows = data as unknown as any[];

    // Baseline integrity split (Sprint P): exclude rows logged before the
    // capture-gate fix — their entity/relationship baselines are
    // systematically empty and their quality scores are degenerate, not
    // evidence. Only post-fix rows count toward the decision gate.
    const cutoverMs   = new Date(BASELINE_CAPTURE_FIX_DEPLOYED_AT).getTime();
    const validRows   = allRows.filter(r => new Date(r.created_at).getTime() >= cutoverMs);
    const invalidRows = allRows.filter(r => new Date(r.created_at).getTime() <  cutoverMs);

    const total      = validRows.length;
    const successful = validRows.filter(r => r.merged_extraction !== null);
    const n          = successful.length;

    const baseline_valid       = invalidRows.length === 0;
    const valid_sample_count   = validRows.length;
    const invalid_sample_count = invalidRows.length;

    if (total < targetSamples) {
      const hard_blocks: ThresholdCheck[] = [{
        metric:   'valid_sample_count',
        required: targetSamples,
        actual:   total,
        verdict:  'INSUFFICIENT_DATA',
      }];
      if (invalid_sample_count > 0) {
        hard_blocks.push({
          metric:   'baseline_integrity',
          required: 0,
          actual:   invalid_sample_count,
          verdict:  'FAIL',
        });
      }
      return {
        ...empty,
        sample_count: total,
        baseline_valid,
        valid_sample_count,
        invalid_sample_count,
        hard_blocks,
      };
    }

    const avg  = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const get  = (r: any, k: string): number => typeof r[k] === 'number' ? r[k] : 0;
    const r2   = (x: number) => Math.round(x * 100) / 100;

    const avgEntityPrecision    = avg(successful.map(r => get(r, 'entity_precision')));
    const avgEntityRecall       = avg(successful.map(r => get(r, 'entity_recall')));
    const avgEntityF1           = avg(successful.map(r => get(r, 'entity_f1')));
    const avgRelRecall          = avg(successful.map(r => get(r, 'relationship_recall')));
    const avgTokenReduction     = avg(successful.map(r => get(r, 'token_reduction_pct')));
    const avgCallReduction      = avg(successful.map(r => get(r, 'call_reduction_pct')));
    const avgLatencyMs          = avg(successful.map(r => get(r, 'merged_runtime_ms')));
    const avgNovelEntityRate    = avg(successful.map(r => get(r, 'novel_entity_count')));
    const avgNovelRelRate       = avg(successful.map(r => get(r, 'novel_relationship_count')));
    const successRate           = n / total;

    // Token ratio ceiling (lower = cheaper)
    const avgTokenRatio = 1 - (avgTokenReduction / 100);

    type Criterion = {
      metric:   string;
      required: number;
      actual:   number;
      passes:   boolean;
    };

    const criteria: Criterion[] = [
      { metric: 'entity_precision',    required: thresholds.entityPrecision,    actual: r2(avgEntityPrecision), passes: avgEntityPrecision >= thresholds.entityPrecision },
      { metric: 'entity_recall',       required: thresholds.entityRecall,       actual: r2(avgEntityRecall),    passes: avgEntityRecall >= thresholds.entityRecall },
      { metric: 'entity_f1',           required: thresholds.entityF1,           actual: r2(avgEntityF1),        passes: avgEntityF1 >= thresholds.entityF1 },
      { metric: 'relationship_recall', required: thresholds.relationshipRecall, actual: r2(avgRelRecall),       passes: avgRelRecall >= thresholds.relationshipRecall },
      { metric: 'token_ratio_ceiling', required: thresholds.tokenRatioCeiling,  actual: r2(avgTokenRatio),      passes: avgTokenRatio <= thresholds.tokenRatioCeiling },
      { metric: 'success_rate',        required: thresholds.successRateFloor,   actual: r2(successRate),        passes: successRate >= thresholds.successRateFloor },
    ];

    const toCheck = (c: Criterion): ThresholdCheck => ({
      metric:   c.metric,
      required: c.required,
      actual:   c.actual,
      verdict:  (c.passes ? 'PASS' : 'FAIL') as ThresholdVerdict,
    });

    // Hard blocks stop A/B approval. Soft warnings are logged but don't block.
    const HARD_BLOCK_METRICS = ['entity_recall', 'entity_f1', 'romantic_signal_precision', 'success_rate'];
    const hard_blocks   = criteria.filter(c => !c.passes && HARD_BLOCK_METRICS.includes(c.metric)).map(toCheck);
    const soft_warnings = criteria.filter(c => !c.passes && !HARD_BLOCK_METRICS.includes(c.metric)).map(toCheck);
    const passed        = criteria.filter(c => c.passes).map(toCheck);

    // romantic_signal_precision is a Phase 6B hard-block metric, but the
    // shadow harness has no legacy baseline to compare it against (see
    // NOT_COMPARABLE_HARD_BLOCK_METRICS doc above). Reporting it as PASS/FAIL
    // would launder an empty-baseline default as measured quality — surface it
    // honestly as NOT_COMPARABLE and keep it a standing block on `ready_for_ab`
    // until a different validation method exists (e.g. human-labeled spot-check).
    const not_comparable: ThresholdCheck[] = [
      {
        metric:   'romantic_signal_precision',
        required: thresholds.romanticSignalPrecision,
        actual:   r2(avg(successful.map(r => get(r, 'romantic_signal_precision')))),
        verdict:  'NOT_COMPARABLE',
      },
      {
        metric:   'interest_recall',
        required: 0,
        actual:   r2(avg(successful.map(r => get(r, 'interest_recall')))),
        verdict:  'NOT_COMPARABLE',
      },
      {
        metric:   'interest_f1',
        required: 0,
        actual:   r2(avg(successful.map(r => get(r, 'interest_f1')))),
        verdict:  'NOT_COMPARABLE',
      },
    ];
    const not_comparable_hard_blocks = not_comparable.filter(c => NOT_COMPARABLE_HARD_BLOCK_METRICS.includes(c.metric));

    return {
      sample_count:              total,
      required_samples:          targetSamples,
      ready_for_ab:              hard_blocks.length === 0
                                 && soft_warnings.length === 0
                                 && not_comparable_hard_blocks.length === 0
                                 && baseline_valid,
      hard_blocks:               [...hard_blocks, ...not_comparable_hard_blocks],
      soft_warnings,
      passed,
      not_comparable,
      baseline_valid,
      valid_sample_count,
      invalid_sample_count,
      avg_token_reduction_pct:   r2(avgTokenReduction),
      avg_call_reduction_pct:    r2(avgCallReduction),
      avg_latency_ms:            r2(avgLatencyMs),
      avg_entity_f1:             r2(avgEntityF1),
      avg_relationship_recall:   r2(avgRelRecall),
      avg_novel_entity_rate:     r2(avgNovelEntityRate),
      avg_novel_relationship_rate: r2(avgNovelRelRate),
      success_rate:              r2(successRate),
      generated_at,
    };
  }

  disable(): void { this.enabled = false; }
  enable():  void { this.enabled = true; }
}

export const shadowModeOrchestrator = new ShadowModeOrchestrator();
