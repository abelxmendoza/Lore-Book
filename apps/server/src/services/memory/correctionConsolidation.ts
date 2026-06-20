// =====================================================
// CORRECTION CONSOLIDATION — Durable Memory Architecture, Slice 5
//
// Turns `correction` events from the immutable log into real fact lifecycle
// transitions (active -> corrected), so recall can later say "you updated this".
//
// Safety:
//   - Pure `planCorrectionConsolidation` decides what to do (testable, no I/O).
//   - Conservative matching: a claim is only touched when the correction clearly
//     references it AND the correction confidence clears a threshold.
//   - Non-destructive: claims are flagged `corrected`/`outdated`, never deleted —
//     so even a wrong match is recoverable and fully audited.
//   - Capability-guarded writes: no-ops cleanly before the migration is applied.
//   - Fail-open orchestration: consolidation can never break the chat path.
// =====================================================

import { supabaseAdmin } from '../supabaseClient';
import {
  nextLifecycleState,
  isLifecycleState,
  isTerminalLifecycleState,
  type FactLifecycleState,
} from './factLifecycle';
import { columnsExist, type CapabilityClient } from './schemaCapability';
import { type MemoryEventRow } from './memoryEventService';

export interface CandidateClaim {
  id: string;
  text: string;
  entity_id?: string | null;
  lifecycle_state?: string | null;
  is_active?: boolean | null;
}

export interface ClaimTransition {
  claimId: string;
  fromState: FactLifecycleState;
  toState: FactLifecycleState;
  action: 'correct';
  matchScore: number;
}

/** Default confidence floor before a correction is allowed to transition a claim. */
export const CORRECTION_CONFIDENCE_FLOOR = 0.7;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'was', 'are', 'were', 'it', 'its', "it's", 'that', "that's",
  'this', 'no', 'not', 'actually', 'correction', 'i', 'me', 'my', 'we', 'her', 'his',
  'their', 'name', 'really', 'but', 'and', 'or', 'to', 'of', 'in', 'on', 'at', 'for',
  'with', 'meant', 'mean', 'said', 'should', 'be', 'they', 'them',
]);

function contentTerms(text: string | null | undefined): Set<string> {
  if (typeof text !== 'string') return new Set();
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
  );
}

/**
 * Conservative overlap score (0..1) between a correction's text and a claim's
 * text — the fraction of the claim's meaningful terms that appear in the
 * correction. Pure; the basis for "does this correction reference this claim?".
 */
export function claimMatchScore(correctionText: string | null | undefined, claim: CandidateClaim): number {
  const claimTerms = contentTerms(claim.text);
  if (claimTerms.size === 0) return 0;
  const corrTerms = contentTerms(correctionText);
  if (corrTerms.size === 0) return 0;
  let shared = 0;
  for (const t of claimTerms) if (corrTerms.has(t)) shared++;
  return shared / claimTerms.size;
}

function currentState(claim: CandidateClaim): FactLifecycleState {
  const raw = claim.lifecycle_state;
  if (isLifecycleState(raw)) return raw;
  return claim.is_active === false ? 'outdated' : 'active';
}

export interface PlanOptions {
  /** Confidence of the correction event itself (0..1). */
  correctionConfidence?: number | null;
  /** Minimum match score to act on a claim. */
  matchThreshold?: number;
  /** Minimum correction confidence to act at all. */
  confidenceFloor?: number;
}

/**
 * Pure planner: which candidate claims should this correction transition, and to
 * what state. Skips terminal/invalid states, low-confidence corrections, and
 * weak matches. Returns at most the single best-matching claim (a correction
 * fixes one thing) to avoid collateral transitions.
 */
export function planCorrectionConsolidation(
  correctionText: string | null | undefined,
  candidateClaims: CandidateClaim[],
  options: PlanOptions = {}
): ClaimTransition[] {
  const confidence = options.correctionConfidence ?? 1;
  const floor = options.confidenceFloor ?? CORRECTION_CONFIDENCE_FLOOR;
  const threshold = options.matchThreshold ?? 0.5;

  if (confidence < floor) return [];

  let best: ClaimTransition | null = null;
  for (const claim of candidateClaims ?? []) {
    const from = currentState(claim);
    if (isTerminalLifecycleState(from)) continue;
    const to = nextLifecycleState(from, 'correct');
    if (!to) continue;
    const score = claimMatchScore(correctionText, claim);
    if (score < threshold) continue;
    if (!best || score > best.matchScore) {
      best = { claimId: claim.id, fromState: from, toState: to, action: 'correct', matchScore: score };
    }
  }
  return best ? [best] : [];
}

// ── Guarded apply ────────────────────────────────────────────────────────────

export interface ApplyClient extends CapabilityClient {
  from(table: string): {
    select(columns: string): { limit(n: number): Promise<{ error: unknown }> };
    update(values: Record<string, unknown>): {
      eq(column: string, value: unknown): Promise<{ error: unknown }>;
    };
  };
}

/**
 * Apply a lifecycle transition to one claim. Capability-guarded (no-op before the
 * migration adds lifecycle_state) and fail-open (never throws). Non-destructive:
 * sets lifecycle_state + supersession fields; the row and its history remain.
 */
export async function applyClaimLifecycle(
  claimId: string,
  toState: FactLifecycleState,
  opts: { sourceEventId?: string | null; client?: ApplyClient } = {}
): Promise<boolean> {
  const client = (opts.client ?? (supabaseAdmin as unknown as ApplyClient)) as ApplyClient;
  const capable = await columnsExist(client, 'omega_claims', ['lifecycle_state']);
  if (!capable) return false;

  const now = new Date().toISOString();
  const values: Record<string, unknown> = { lifecycle_state: toState, updated_at: now };
  // Non-active states are superseded: mirror the existing is_active/end_time shape.
  if (toState !== 'active') {
    values.is_active = false;
    values.end_time = now;
  } else {
    values.last_confirmed_at = now;
  }
  if (opts.sourceEventId) values.source_event_id = opts.sourceEventId;

  try {
    const { error } = await client.from('omega_claims').update(values).eq('id', claimId);
    if (error) {
      console.warn('[correctionConsolidation] claim update failed (fail-open):', error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[correctionConsolidation] claim update threw (fail-open):', err);
    return false;
  }
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

export interface ConsolidationSummary {
  correctionsProcessed: number;
  claimsTransitioned: number;
  skipped: number;
}

export interface ConsolidateOptions {
  /** Correction events to process (already loaded from memory_events). */
  corrections: MemoryEventRow[];
  /** Loads candidate claims for one correction event (injectable for testing). */
  loadCandidateClaims: (correction: MemoryEventRow) => Promise<CandidateClaim[]>;
  planOptions?: Omit<PlanOptions, 'correctionConfidence'>;
  client?: ApplyClient;
}

/**
 * Consolidate a batch of correction events into fact lifecycle transitions.
 * Idempotent (already-terminal claims are skipped) and fail-open (a failure on
 * one correction never aborts the batch). Returns a summary.
 */
export async function consolidateCorrections(
  opts: ConsolidateOptions
): Promise<ConsolidationSummary> {
  const summary: ConsolidationSummary = { correctionsProcessed: 0, claimsTransitioned: 0, skipped: 0 };

  for (const correction of opts.corrections ?? []) {
    summary.correctionsProcessed++;
    let claims: CandidateClaim[] = [];
    try {
      claims = await opts.loadCandidateClaims(correction);
    } catch (err) {
      console.warn('[correctionConsolidation] loadCandidateClaims threw (fail-open):', err);
      summary.skipped++;
      continue;
    }

    const plans = planCorrectionConsolidation(correction.content, claims, {
      ...opts.planOptions,
      correctionConfidence: correction.confidence ?? 1,
    });
    if (plans.length === 0) {
      summary.skipped++;
      continue;
    }

    for (const plan of plans) {
      const ok = await applyClaimLifecycle(plan.claimId, plan.toState, {
        sourceEventId: (correction as { id?: string }).id ?? null,
        client: opts.client,
      });
      if (ok) summary.claimsTransitioned++;
      else summary.skipped++;
    }
  }

  return summary;
}
