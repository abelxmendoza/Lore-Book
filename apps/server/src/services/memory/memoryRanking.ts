// =====================================================
// MEMORY RANKING — Durable Memory Architecture, Slice 6
//
// Pure scoring + selection for the retrieval pipeline. Given candidate memories
// (events/facts/summaries) already fetched for a chat turn, rank them so the LLM
// receives only the best compact slice. No I/O — fully unit-testable.
//
// score = Σ wᵢ·featureᵢ  (normalized to 0..1), gated by epistemic lifecycle:
//   recency       — exponential time decay  2^(-age/halfLife)
//   relevance     — caller-supplied (e.g. cosine similarity / term overlap)
//   confidence    — 0..1
//   importance    — emotional/narrative weight 0..1
//   userConfirmed — user-confirmed truth dominates (binary feature)
//
// Lifecycle gating keeps superseded truth from masquerading as current:
//   active 1.0 · contradicted 0.4 · outdated 0.25 · corrected/retracted 0 (excluded)
// =====================================================

import { isLifecycleState, type FactLifecycleState } from './factLifecycle';

export interface RankableMemory {
  id: string;
  /** now - occurredAt, in ms. */
  ageMs: number;
  /** 0..1 similarity/overlap to the query (caller-computed). */
  relevance: number;
  /** 0..1 belief confidence. */
  confidence: number;
  /** 0..1 emotional/narrative importance. */
  importance: number;
  /** User-stated/confirmed truth. */
  userConfirmed: boolean;
  /** Epistemic state — non-active states are down-weighted/excluded. */
  lifecycleState?: string | null;
  /** Approx size (bytes/chars/tokens) for budgeted selection. */
  weight?: number;
}

export interface RankWeights {
  recency: number;
  relevance: number;
  confidence: number;
  importance: number;
  userConfirmed: number;
}

export const DEFAULT_WEIGHTS: RankWeights = {
  recency: 0.2,
  relevance: 0.35,
  confidence: 0.15,
  importance: 0.1,
  userConfirmed: 0.2,
};

/** Default recency half-life: 14 days. */
export const DEFAULT_HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;

const LIFECYCLE_MULTIPLIER: Record<FactLifecycleState, number> = {
  active: 1,
  contradicted: 0.4,
  outdated: 0.25,
  corrected: 0,
  retracted: 0,
};

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Exponential time decay in [0,1]: 1 at age 0, 0.5 at one half-life. */
export function recencyScore(ageMs: number, halfLifeMs: number = DEFAULT_HALF_LIFE_MS): number {
  if (!Number.isFinite(ageMs) || ageMs <= 0) return 1;
  if (!Number.isFinite(halfLifeMs) || halfLifeMs <= 0) return 0;
  return 2 ** (-ageMs / halfLifeMs);
}

/** Lifecycle gate multiplier (1 for unknown/absent state — don't penalize legacy rows). */
export function lifecycleMultiplier(state: string | null | undefined): number {
  if (isLifecycleState(state)) return LIFECYCLE_MULTIPLIER[state];
  return 1;
}

export interface ScoreOptions {
  weights?: Partial<RankWeights>;
  halfLifeMs?: number;
}

/**
 * Weighted, normalized 0..1 score for one memory, multiplied by its lifecycle
 * gate. Corrected/retracted memories score 0 (effectively excluded).
 */
export function scoreMemory(memory: RankableMemory, options: ScoreOptions = {}): number {
  const w = { ...DEFAULT_WEIGHTS, ...(options.weights ?? {}) };
  const wSum = w.recency + w.relevance + w.confidence + w.importance + w.userConfirmed;
  if (wSum <= 0) return 0;

  const features =
    w.recency * recencyScore(memory.ageMs, options.halfLifeMs) +
    w.relevance * clamp01(memory.relevance) +
    w.confidence * clamp01(memory.confidence) +
    w.importance * clamp01(memory.importance) +
    w.userConfirmed * (memory.userConfirmed ? 1 : 0);

  return (features / wSum) * lifecycleMultiplier(memory.lifecycleState);
}

export interface ScoredMemory<T extends RankableMemory = RankableMemory> {
  memory: T;
  score: number;
}

/**
 * Rank memories by score, descending. O(n log n). Excludes zero-scored
 * (corrected/retracted) memories unless `includeZero` is set.
 */
export function rankMemories<T extends RankableMemory>(
  memories: T[],
  options: ScoreOptions & { includeZero?: boolean } = {}
): ScoredMemory<T>[] {
  const scored: ScoredMemory<T>[] = [];
  for (const memory of memories ?? []) {
    const score = scoreMemory(memory, options);
    if (score > 0 || options.includeZero) scored.push({ memory, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Greedily select the highest-scoring memories whose cumulative `weight` fits the
 * budget — the compact slice handed to the LLM. Assumes `ranked` is already
 * sorted desc (as from rankMemories). O(n).
 */
export function selectWithinBudget<T extends RankableMemory>(
  ranked: ScoredMemory<T>[],
  budget: number
): T[] {
  const out: T[] = [];
  let used = 0;
  for (const { memory } of ranked) {
    const cost = Math.max(0, memory.weight ?? 0);
    if (used + cost > budget) continue; // skip; a smaller later item may still fit
    out.push(memory);
    used += cost;
    if (used >= budget) break;
  }
  return out;
}

/** Convenience: rank then budget-select in one call. */
export function rankAndSelect<T extends RankableMemory>(
  memories: T[],
  budget: number,
  options: ScoreOptions = {}
): T[] {
  return selectWithinBudget(rankMemories(memories, options), budget);
}
