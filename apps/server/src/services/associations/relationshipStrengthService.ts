/**
 * Relationship Strength Service (Rules 8 & 13) — turns accumulated evidence into
 * a confidence score. Association strength accumulates: one "visited Club Nova"
 * is weak; eight of them is strong. But accumulation alone never crosses a type
 * boundary — confidence for an inferred edge is clamped below the next tier and
 * below a global inferred ceiling. Crossing into a stronger TYPE (e.g.
 * visited → associated_with → member_of) is the promotion service's job, and
 * only happens on explicit statements or evidence thresholds.
 */
import { associationEvidenceService } from './associationEvidenceService';
import {
  BASE_CONFIDENCE,
  INFERRED_CONFIDENCE_CEILING,
  type AssociationEdge,
  type AssociationType,
} from './associationTypes';

/** Confidence gained per additional distinct source backing the edge. */
const PER_SOURCE_BONUS = 0.05;
/** Maximum bonus accumulation can add on top of the type's base confidence. */
const MAX_ACCUMULATION_BONUS = 0.2;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const relationshipStrengthService = {
  /**
   * Confidence for an edge given its type, how many distinct sources back it,
   * and whether it was stated explicitly. Inferred edges are capped; explicit
   * membership/ownership edges may reach their full base (0.9+).
   */
  computeConfidence(params: {
    type: AssociationType;
    distinctSources: number;
    explicit?: boolean;
  }): number {
    const base = BASE_CONFIDENCE[params.type];
    const bonus = Math.min(MAX_ACCUMULATION_BONUS, Math.max(0, params.distinctSources - 1) * PER_SOURCE_BONUS);
    let c = base + bonus;
    if (!params.explicit) c = Math.min(c, INFERRED_CONFIDENCE_CEILING);
    return round2(Math.min(1, c));
  },

  /** Recompute and write back an edge's confidence from its current evidence. */
  recompute(edge: AssociationEdge, explicit = false): AssociationEdge {
    const distinctSources = associationEvidenceService.distinctSources(edge.supportingEvidence);
    edge.confidence = this.computeConfidence({ type: edge.associationType, distinctSources, explicit });
    return edge;
  },

  /**
   * A coarse strength band for UI / downstream gating. Mirrors the evidentiary
   * tiers in the confidence model.
   */
  band(confidence: number): 'mention' | 'weak' | 'moderate' | 'strong' | 'confirmed' {
    if (confidence < 0.3) return 'mention';
    if (confidence < 0.5) return 'weak';
    if (confidence < 0.7) return 'moderate';
    if (confidence < 0.9) return 'strong';
    return 'confirmed';
  },
};
