/**
 * Identity Strength Engine
 *
 * A richer identity-health model than a single confidence score. It blends
 * evidence quality, relationship grounding, and risk penalties into a 0..100
 * strength score plus a breakdown of the contributing signals.
 *
 * This is a SEPARATE signal and does NOT overwrite existing confidence logic.
 * The engine emits `confidence` as a pass-through input so callers can compare
 * the two, but it never mutates the entity's stored confidence column.
 *
 *   0–25   Weak Identity
 *   26–50  Emerging Identity
 *   51–75  Established Identity
 *   76–90  Strong Identity
 *   91–100 Canonical Identity
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export interface IdentityStrengthInput {
  /** Existing per-entity confidence (0..1). Passed through, never overwritten. */
  confidence?: number;

  // ── Evidence ──────────────────────────────────────────────
  /** Number of distinct pieces of evidence (facts/claims/mentions). */
  evidenceCount?: number;
  /** Distinct evidence source kinds (utterance, correction, inference, ...). */
  evidenceSourceKinds?: number;
  /** Mean provenance quality of the evidence (0..1): confirmed > inferred. */
  provenanceQuality?: number;

  // ── Relationships ─────────────────────────────────────────
  /** Number of distinct connected entities. */
  connectedEntities?: number;
  /** Of those, how many are user-confirmed (not just inferred). */
  confirmedRelationships?: number;
  /** Count of interactions/appearances across the history. */
  interactionCount?: number;

  // ── Penalties ─────────────────────────────────────────────
  /** Name/identity ambiguity (0..1) — e.g. shared first name, vague mention. */
  ambiguity?: number;
  /** Number of unresolved duplicate candidates competing for this identity. */
  duplicateCandidates?: number;
  /** Number of contradictory/disputed claims about this entity. */
  contradictoryClaims?: number;
}

export interface IdentityStrength {
  /** Overall 0..100 identity-health score. */
  score: number;
  /** Pass-through 0..1 confidence (NOT recomputed here). */
  confidence: number;
  /** 0..1 — how well-evidenced the identity is. */
  evidenceStrength: number;
  /** 0..1 — how well-connected/grounded the identity is. */
  relationshipStrength: number;
  /** 0..1 — risk that this identity is ambiguous or a duplicate. */
  ambiguityRisk: number;
  /** 0..1 — risk that this identity carries contradictions. */
  contradictionRisk: number;
}

export type IdentityStrengthBand =
  | 'Weak Identity'
  | 'Emerging Identity'
  | 'Established Identity'
  | 'Strong Identity'
  | 'Canonical Identity';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const num = (n: number | undefined, fallback = 0) => (typeof n === 'number' && Number.isFinite(n) ? n : fallback);

/** Diminishing-returns saturation: 0 → 0, grows toward 1 as count grows. */
function saturate(count: number, halfway: number): number {
  const c = Math.max(0, count);
  return c / (c + halfway);
}

/** Map a 0..100 score to its identity band. */
export function identityBand(score: number): IdentityStrengthBand {
  if (score <= 25) return 'Weak Identity';
  if (score <= 50) return 'Emerging Identity';
  if (score <= 75) return 'Established Identity';
  if (score <= 90) return 'Strong Identity';
  return 'Canonical Identity';
}

/**
 * Pure scoring. Combines evidence (40%) + relationships (30%) + confidence
 * floor (30%), then subtracts ambiguity and contradiction risk. Fully
 * deterministic and unit-testable.
 */
export function computeIdentityStrength(input: IdentityStrengthInput): IdentityStrength {
  const confidence = clamp01(num(input.confidence, 0));

  // ── Evidence strength ───────────────────────────────────────────────────
  const evCount = saturate(num(input.evidenceCount), 6);          // ~6 pieces → 0.5
  const evDiversity = saturate(num(input.evidenceSourceKinds), 3); // ~3 kinds → 0.5
  const provenance = clamp01(num(input.provenanceQuality, 0.5));
  const evidenceStrength = clamp01(0.5 * evCount + 0.2 * evDiversity + 0.3 * provenance);

  // ── Relationship strength ───────────────────────────────────────────────
  const connected = saturate(num(input.connectedEntities), 5);     // ~5 links → 0.5
  const confirmedCount = num(input.confirmedRelationships);
  const connCount = num(input.connectedEntities);
  const confirmedRatio = connCount > 0 ? clamp01(confirmedCount / connCount) : 0;
  const interactions = saturate(num(input.interactionCount), 8);   // ~8 interactions → 0.5
  const relationshipStrength = clamp01(0.45 * connected + 0.3 * confirmedRatio + 0.25 * interactions);

  // ── Risks (penalties) ───────────────────────────────────────────────────
  const ambiguityRisk = clamp01(
    0.6 * clamp01(num(input.ambiguity)) + 0.4 * saturate(num(input.duplicateCandidates), 2)
  );
  const contradictionRisk = clamp01(saturate(num(input.contradictoryClaims), 2));

  // ── Composite ───────────────────────────────────────────────────────────
  // Positive base from evidence + relationships + a confidence floor.
  const base = 0.4 * evidenceStrength + 0.3 * relationshipStrength + 0.3 * confidence;
  // Risks erode the score multiplicatively so a strongly-contradicted identity
  // can never read as canonical regardless of its evidence count.
  const penaltyFactor = (1 - 0.5 * ambiguityRisk) * (1 - 0.6 * contradictionRisk);
  const score = Math.round(clamp01(base * penaltyFactor) * 100);

  return {
    score,
    confidence,
    evidenceStrength: round2(evidenceStrength),
    relationshipStrength: round2(relationshipStrength),
    ambiguityRisk: round2(ambiguityRisk),
    contradictionRisk: round2(contradictionRisk),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Table that holds the `identity_strength_score` / `identity_strength` columns. */
const STRENGTH_TABLES: Record<string, string> = {
  character: 'characters',
  location: 'locations',
  organization: 'organizations',
};

class IdentityStrengthEngine {
  /** Pure compute — exposed on the engine for convenience. */
  compute(input: IdentityStrengthInput): IdentityStrength {
    return computeIdentityStrength(input);
  }

  band(score: number): IdentityStrengthBand {
    return identityBand(score);
  }

  /**
   * Persist a computed strength to the entity's `identity_strength_score` and
   * `identity_strength` columns. Never touches the `confidence` column.
   * Best-effort: failures are logged, not thrown.
   */
  async persist(
    userId: string,
    entityType: string,
    entityId: string,
    strength: IdentityStrength
  ): Promise<boolean> {
    const table = STRENGTH_TABLES[entityType];
    if (!table) {
      logger.debug({ entityType }, '[IdentityStrength] no strength column for entity type — skipped');
      return false;
    }
    try {
      const { error } = await supabaseAdmin
        .from(table)
        .update({
          identity_strength_score: strength.score,
          identity_strength: {
            ...strength,
            band: identityBand(strength.score),
            computed_at: new Date().toISOString(),
          },
        })
        .eq('id', entityId)
        .eq('user_id', userId);

      if (error) {
        logger.warn({ err: error, entityType, entityId }, '[IdentityStrength] persist failed');
        return false;
      }
      return true;
    } catch (err) {
      logger.warn({ err, entityType, entityId }, '[IdentityStrength] persist threw');
      return false;
    }
  }

  /** Compute + persist in one step, returning the strength. */
  async computeAndPersist(
    userId: string,
    entityType: string,
    entityId: string,
    input: IdentityStrengthInput
  ): Promise<IdentityStrength> {
    const strength = this.compute(input);
    await this.persist(userId, entityType, entityId, strength);
    return strength;
  }
}

export const identityStrengthEngine = new IdentityStrengthEngine();
export type { IdentityStrengthEngine };
