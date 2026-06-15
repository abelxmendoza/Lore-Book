/**
 * Contradiction Engine — pure, deterministic detectors.
 *
 * A contradiction is a proven divergence between a category's STATED signal
 * ("I value / I want X") and its REVEALED signal (what the user actually does),
 * both already computed by the Revealed Preference Engine. No LLM decides a
 * contradiction here; these functions prove it from counts/shares/recency.
 *
 * Trust language is built deterministically: "evidence suggests", "current
 * actions support / do not strongly support" — never accuse, diagnose, speculate.
 */

import { confidenceFromEvidence, type PreferenceType } from '../revealedPreference/preferenceTaxonomy';

export type ContradictionType =
  | 'STATED_VS_REVEALED' | 'GOAL_VS_ACTION' | 'IDENTITY_VS_BEHAVIOR' | 'VALUE_CONFLICT' | 'INTENTION_OUTCOME';
export type Section = 'tension' | 'blind_spot' | 'identity_conflict' | 'value_conflict';
export type Severity = 'low' | 'medium' | 'high';

export interface SignalView {
  categoryKey: string; label: string; type: PreferenceType;
  statedCount: number; revealedCount: number;
  statedShare: number; revealedShare: number;
  recentRevealed: number; trend: number;
  firstSeen: string | null; lastSeen: string | null;
}

export type DivergenceKind = 'aligned' | 'tension' | 'blind_spot' | 'insufficient';

export interface Divergence {
  kind: DivergenceKind;
  contradictionType?: ContradictionType;
  section?: Section;
  alignmentDelta: number; // statedShare - revealedShare  (+ say>do, - do>say)
}

const BLIND_MIN = 3;          // revealed episodes (with no stated) to call a blind spot
const ALIGN_RATIO = 0.5;      // do must be ≥ 50% of say (by share) to count as aligned

/** Classify a category's stated-vs-revealed divergence. Pure. */
export function classifyDivergence(s: SignalView): Divergence {
  const alignmentDelta = Number((s.statedShare - s.revealedShare).toFixed(4));
  const says = s.statedCount >= 1;
  const does = s.revealedCount >= 1;

  // Says it and does it, proportionally → aligned (no contradiction).
  if (says && does && s.revealedShare >= s.statedShare * ALIGN_RATIO) {
    return { kind: 'aligned', alignmentDelta };
  }

  // Says it but actions don't strongly support it → a tension.
  if (says && s.revealedShare < s.statedShare * ALIGN_RATIO) {
    // A previously-acted-on goal that has gone quiet is an intention/outcome gap.
    if (s.type === 'goal' && s.revealedCount > 0 && s.recentRevealed === 0) {
      return { kind: 'tension', contradictionType: 'INTENTION_OUTCOME', section: 'tension', alignmentDelta };
    }
    const contradictionType: ContradictionType =
      s.type === 'goal' ? 'GOAL_VS_ACTION' : s.type === 'identity' ? 'IDENTITY_VS_BEHAVIOR' : 'STATED_VS_REVEALED';
    const section: Section = s.type === 'identity' ? 'identity_conflict' : 'tension';
    return { kind: 'tension', contradictionType, section, alignmentDelta };
  }

  // Does it a lot but never names it → a blind spot (behavior reveals an unstated value/identity).
  if (!says && s.revealedCount >= BLIND_MIN) {
    return { kind: 'blind_spot', contradictionType: 'IDENTITY_VS_BEHAVIOR', section: 'blind_spot', alignmentDelta };
  }

  return { kind: 'insufficient', alignmentDelta };
}

/** Severity from evidence, gap size, recency and persistence. Pure. */
export function computeSeverity(input: {
  evidenceCount: number; alignmentDelta: number; recentRevealed: number; durationDays: number;
}): { severity: Severity; score: number } {
  const normEvidence = Math.min(1, input.evidenceCount / 10);
  const normDelta = Math.min(1, Math.abs(input.alignmentDelta) / 0.3);
  const recencyFactor = input.recentRevealed > 0 ? 1 : 0.3; // active divergence weighs more
  const durationFactor = Math.min(1, input.durationDays / 180);
  const score = Number((0.4 * normEvidence + 0.3 * normDelta + 0.15 * recencyFactor + 0.15 * durationFactor).toFixed(4));
  const severity: Severity = score >= 0.6 ? 'high' : score >= 0.38 ? 'medium' : 'low';
  return { severity, score };
}

export { confidenceFromEvidence };

/** Non-accusatory, evidence-framed explanation. Pure. */
export function buildDetail(section: Section, label: string, statedCount: number, revealedCount: number, conflictWith?: string): string {
  switch (section) {
    case 'tension':
      return `You've expressed that ${label} matters (${statedCount} ${statedCount === 1 ? 'mention' : 'mentions'}), but your current actions don't strongly support it yet (${revealedCount} supporting ${revealedCount === 1 ? 'episode' : 'episodes'}). Evidence suggests a gap between intention and action.`;
    case 'identity_conflict':
      return `You identify with ${label}, yet current actions don't strongly reflect it (${statedCount} stated vs ${revealedCount} acted). Evidence suggests this part of your identity is more aspirational than lived right now.`;
    case 'blind_spot':
      return `Your actions strongly reflect ${label} (${revealedCount} supporting episodes), though you rarely name it as something you value. Evidence suggests this is a lived priority you haven't consciously claimed.`;
    case 'value_conflict':
      return `You've expressed that ${label} matters, but evidence suggests ${conflictWith ?? 'another area'} currently receives more of your time and energy. These may be competing for the same hours.`;
  }
}

/** Curated, genuinely resource-competing pairs. (a) is the stated value, (b) the time-dominant rival. */
export const VALUE_CONFLICT_PAIRS: Array<[string, string]> = [
  ['family', 'career'],
  ['family', 'nightlife'],
  ['fitness', 'nightlife'],
  ['financial_freedom', 'nightlife'],
  ['relationships', 'career'],
  ['relationships', 'coding'],
  ['fitness', 'career'],
];

/**
 * Value conflicts: a STATED value whose competing category's revealed time
 * substantially dominates. Requires a stated side ⇒ never speculative.
 */
export function detectValueConflicts(byKey: Map<string, SignalView>): Array<{
  categoryKey: string; label: string; conflictWith: string; conflictLabel: string; alignmentDelta: number;
}> {
  const out: Array<{ categoryKey: string; label: string; conflictWith: string; conflictLabel: string; alignmentDelta: number }> = [];
  for (const [valueKey, rivalKey] of VALUE_CONFLICT_PAIRS) {
    const v = byKey.get(valueKey);
    const r = byKey.get(rivalKey);
    if (!v || !r) continue;
    if (v.statedCount >= 1 && r.revealedCount >= 3 && r.revealedShare > v.revealedShare * 2) {
      out.push({
        categoryKey: v.categoryKey, label: v.label, conflictWith: r.categoryKey, conflictLabel: r.label,
        alignmentDelta: Number((v.statedShare - r.revealedShare).toFixed(4)),
      });
    }
  }
  return out;
}
