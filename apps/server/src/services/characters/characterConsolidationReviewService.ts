/**
 * Character consolidation review — identity-likelihood scoring for the
 * Character Book UI path (GET /duplicates), keep-separate persistence, and
 * dry-run repair proposals. Uses existing name matching + metadata distinct
 * pairs; does not invent a parallel identity store.
 */

import { logger } from '../../logger';
import {
  matchCharacterName,
  normalizeForMatching,
  parseCharacterName,
  weakGivenNameKeys,
  type NameProfile,
} from '../../utils/characterNameMatching';
import { normalizeNameKey } from '../../utils/nameNormalization';
import { identityLedgerService } from '../identity/identityLedgerService';
import { supabaseAdmin } from '../supabaseClient';
import { filterScoringAliases, validateAliasCandidate } from './aliasProvenanceValidation';
import { classifyCharacterLabel } from './characterLabelSemantics';
import {
  consolidationPairKey,
  type ConsolidationDecisionKind,
  type ConsolidationReasonCode,
  type ConsolidationRecommendation,
} from './characterNameEvidence';

export { consolidationPairKey } from './characterNameEvidence';

export type ConsolidationCharacterRow = {
  id: string;
  name: string;
  alias?: string[] | null;
  metadata?: Record<string, unknown> | null;
  status?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type DuplicateEvidenceBreakdown = {
  exactPreferredNameMatch: number;
  confirmedUniqueAliasMatch: number;
  explicitSamePersonAssertion: number;
  sharedGivenNameOnly: number;
  relationshipGraphSimilarity: number;
  eventHistorySimilarity: number;
  sourceClusterSimilarity: number;
  conflictingRolePenalty: number;
  distinctIdentityAssertionPenalty: number;
  relationalDescriptorPenalty: number;
  multiplePersonNamesPenalty: number;
};

export type ScoredDuplicatePair = {
  left: ConsolidationCharacterRow;
  right: ConsolidationCharacterRow;
  match_type: 'exact' | 'alias' | 'containment' | 'shared_given_name' | 'descriptor' | 'none';
  confidence: number;
  /** Probability the cards are the same person (identity likelihood). */
  identityLikelihood: number;
  recommendation: ConsolidationRecommendation;
  reason: string;
  reasonCode: ConsolidationReasonCode;
  explanation: string[];
  evidence: DuplicateEvidenceBreakdown;
  actions: ConsolidationRecommendation[];
};

export type DuplicateReviewGroup = {
  match_type: ScoredDuplicatePair['match_type'];
  confidence: number;
  recommendation: ConsolidationRecommendation;
  reason: string;
  reasonCode: ConsolidationReasonCode;
  explanation: string[];
  actions: ConsolidationRecommendation[];
  canonical_name: string;
  characters: ConsolidationCharacterRow[];
  pair_key: string;
};

function profileOf(row: ConsolidationCharacterRow): NameProfile | null {
  return ((row.metadata?.nameProfile as NameProfile | undefined) ?? null);
}

function distinctIdSet(row: ConsolidationCharacterRow): Set<string> {
  const m = (row.metadata ?? {}) as Record<string, unknown>;
  return new Set([
    ...((m.confirmed_distinct_from as string[]) ?? []),
    ...((m.distinct_from as string[]) ?? []),
  ].filter(Boolean));
}

function identityTokens(row: ConsolidationCharacterRow): Set<string> {
  const toks = new Set<string>();
  const add = (label: string) => {
    const core = parseCharacterName(label).coreName || normalizeForMatching(label);
    for (const t of core.split(/\s+/).filter(Boolean)) toks.add(t);
  };
  add(row.name);
  for (const a of filterScoringAliases(row.alias ?? [], { canonicalName: row.name })) add(a);
  const given = profileOf(row)?.givenName?.trim();
  if (given) toks.add(normalizeForMatching(given));
  return toks;
}

function emptyEvidence(): DuplicateEvidenceBreakdown {
  return {
    exactPreferredNameMatch: 0,
    confirmedUniqueAliasMatch: 0,
    explicitSamePersonAssertion: 0,
    sharedGivenNameOnly: 0,
    relationshipGraphSimilarity: 0,
    eventHistorySimilarity: 0,
    sourceClusterSimilarity: 0,
    conflictingRolePenalty: 0,
    distinctIdentityAssertionPenalty: 0,
    relationalDescriptorPenalty: 0,
    multiplePersonNamesPenalty: 0,
  };
}

function isPairDistinct(left: ConsolidationCharacterRow, right: ConsolidationCharacterRow): boolean {
  return distinctIdSet(left).has(right.id) || distinctIdSet(right).has(left.id);
}

/**
 * Score whether two cards represent the same real person.
 * Shared first names alone are weak/neutral, not merge evidence.
 */
export function scoreConsolidationPair(
  left: ConsolidationCharacterRow,
  right: ConsolidationCharacterRow,
): ScoredDuplicatePair | null {
  if (left.id === right.id) return null;
  if (isPairDistinct(left, right)) return null;

  const evidence = emptyEvidence();
  const explanation: string[] = [];
  const leftClass = classifyCharacterLabel(left.name, {
    aliases: left.alias,
    nameProfile: profileOf(left),
  });
  const rightClass = classifyCharacterLabel(right.name, {
    aliases: right.alias,
    nameProfile: profileOf(right),
  });

  // ── Relational descriptor vs named anchor ─────────────────────────────
  if (
    leftClass.labelClass === 'RELATIONAL_PERSON_DESCRIPTOR' ||
    rightClass.labelClass === 'RELATIONAL_PERSON_DESCRIPTOR'
  ) {
    const desc = leftClass.labelClass === 'RELATIONAL_PERSON_DESCRIPTOR' ? leftClass : rightClass;
    const other = leftClass.labelClass === 'RELATIONAL_PERSON_DESCRIPTOR' ? rightClass : leftClass;
    const anchorKey = normalizeForMatching(desc.relational?.anchor ?? '');
    const otherKeys = new Set([
      other.coreName,
      normalizeForMatching(other.raw),
      normalizeForMatching(other.headPerson ?? ''),
    ]);
    evidence.relationalDescriptorPenalty = 0.95;
    evidence.multiplePersonNamesPenalty = 0.7;
    if (anchorKey && (otherKeys.has(anchorKey) || [...otherKeys].some((k) => k.includes(anchorKey)))) {
      explanation.push(
        `“${desc.raw}” describes another person (${desc.relational?.relation} of ${desc.relational?.anchor}), not ${other.raw}.`,
      );
      if (desc.associatedPlace) {
        explanation.push(`Associated place: ${desc.associatedPlace}.`);
      }
      return {
        left,
        right,
        match_type: 'descriptor',
        confidence: 0.12,
        identityLikelihood: 0.08,
        recommendation: 'convert_descriptor',
        reason:
          'Possessive/relational descriptor references another person — not an alias match.',
        reasonCode: 'RELATIONAL_DESCRIPTOR_NOT_ALIAS',
        explanation,
        evidence,
        actions: ['keep_separate', 'convert_descriptor', 'mark_distinct_people'],
      };
    }
  }

  // ── Spatial / event descriptor ────────────────────────────────────────
  if (
    leftClass.labelClass === 'SPATIAL_OR_EVENT_DESCRIPTOR' ||
    rightClass.labelClass === 'SPATIAL_OR_EVENT_DESCRIPTOR'
  ) {
    const spatialSide = leftClass.labelClass === 'SPATIAL_OR_EVENT_DESCRIPTOR' ? leftClass : rightClass;
    const otherSide = leftClass.labelClass === 'SPATIAL_OR_EVENT_DESCRIPTOR' ? rightClass : leftClass;
    const headKey = normalizeForMatching(spatialSide.headPerson ?? '');
    const otherKey = normalizeForMatching(otherSide.raw);
    const refKey = normalizeForMatching(spatialSide.referencedPeople[0] ?? '');
    evidence.multiplePersonNamesPenalty = 0.8;

    if (refKey && (otherKey === refKey || otherSide.coreName === refKey)) {
      explanation.push(
        `${spatialSide.referencedPeople[0]} appears only in a location/context phrase.`,
      );
      explanation.push(`Head person is ${spatialSide.headPerson}.`);
      return {
        left,
        right,
        match_type: 'descriptor',
        confidence: 0.1,
        identityLikelihood: 0.06,
        recommendation: 'resolve_head_character',
        reason: 'Spatial descriptor — do not merge with the referenced person.',
        reasonCode: 'SPATIAL_DESCRIPTOR_HEAD_MISMATCH',
        explanation,
        evidence,
        actions: ['keep_separate', 'resolve_head_character', 'mark_distinct_people'],
      };
    }

    // Containment against head only may still be a rename/merge into Hassan.
    if (headKey && otherKey === headKey) {
      explanation.push(`Resolve descriptor card as ${spatialSide.headPerson}.`);
      return {
        left,
        right,
        match_type: 'containment',
        confidence: 0.78,
        identityLikelihood: 0.74,
        recommendation: 'resolve_head_character',
        reason: 'Descriptor head matches an existing named person.',
        reasonCode: 'NEEDS_REVIEW',
        explanation,
        evidence,
        actions: ['resolve_head_character', 'merge', 'keep_separate'],
      };
    }
  }

  // ── Shared given-name / weak-name collision ───────────────────────────
  const weak = new Set<string>([
    ...weakGivenNameKeys(profileOf(left)),
    ...weakGivenNameKeys(profileOf(right)),
  ]);
  // Also treat single-token alias overlap as weak when kinship vs scene contexts differ.
  const leftHasKinship = Boolean(leftClass.kinshipRole);
  const rightHasKinship = Boolean(rightClass.kinshipRole);
  const leftHasScene =
    leftClass.labelClass === 'NAMED_PERSON_WITH_ALIAS' || Boolean(profileOf(left)?.nickname);
  const rightHasScene =
    rightClass.labelClass === 'NAMED_PERSON_WITH_ALIAS' || Boolean(profileOf(right)?.nickname);
  const conflictingContexts =
    (leftHasKinship && rightHasScene) || (rightHasKinship && leftHasScene);

  const sharedTokens = [...identityTokens(left)].filter((t) => identityTokens(right).has(t));
  const sharedOnlyWeak =
    sharedTokens.length > 0 &&
    sharedTokens.every((t) => weak.has(t) || (conflictingContexts && t.split(/\s+/).length === 1));

  if (sharedOnlyWeak && conflictingContexts) {
    evidence.sharedGivenNameOnly = 0.85;
    evidence.conflictingRolePenalty = 0.9;
    explanation.push(`Shared name detected: ${sharedTokens.join(', ')}`);
    explanation.push('Distinct aliases/roles/relationship contexts indicate separate people.');
    explanation.push('Shared first name alone is not identity evidence.');
    return {
      left,
      right,
      match_type: 'shared_given_name',
      confidence: 0.18,
      identityLikelihood: 0.12,
      recommendation: 'keep_separate',
      reason:
        'Shared first name, but distinct aliases, roles, and identity evidence indicate separate people.',
      reasonCode: 'SHARED_GIVEN_NAME_DISTINCT_IDENTITIES',
      explanation,
      evidence,
      actions: [
        'keep_separate',
        'mark_distinct_people',
        'set_preferred_name',
        'link_alias',
      ],
    };
  }

  if (sharedOnlyWeak && weak.size > 0) {
    evidence.sharedGivenNameOnly = 0.8;
    explanation.push(`Overlap only on weak given name(s): ${sharedTokens.join(', ')}`);
    return {
      left,
      right,
      match_type: 'shared_given_name',
      confidence: 0.22,
      identityLikelihood: 0.16,
      recommendation: 'keep_separate',
      reason: 'Shared given name only — insufficient for identity merge.',
      reasonCode: 'SHARED_GIVEN_NAME_DISTINCT_IDENTITIES',
      explanation,
      evidence,
      actions: ['keep_separate', 'mark_distinct_people', 'needs_identity_review'],
    };
  }

  // ── Strong identity matches (validated aliases only) ──────────────────
  const leftLabels = [
    left.name,
    ...filterScoringAliases(left.alias ?? [], { canonicalName: left.name }),
  ];
  const rightLabels = [
    right.name,
    ...filterScoringAliases(right.alias ?? [], { canonicalName: right.name }),
  ];

  const exactName =
    normalizeNameKey(left.name) === normalizeNameKey(right.name)
      ? matchCharacterName(left.name, right.name)
      : { matches: false, confidence: 0, method: 'none' as const };

  if (exactName.matches && exactName.method === 'exact') {
    evidence.exactPreferredNameMatch = 1;
    return {
      left,
      right,
      match_type: 'exact',
      confidence: 0.98,
      identityLikelihood: 0.96,
      recommendation: 'merge',
      reason: 'same canonical name',
      reasonCode: 'SAME_CANONICAL_NAME',
      explanation: ['Preferred display names match exactly.'],
      evidence,
      actions: ['merge', 'keep_separate', 'mark_distinct_people'],
    };
  }

  let bestAlias = { matches: false, confidence: 0, method: 'none' as string };
  for (const la of leftLabels) {
    for (const lb of rightLabels) {
      if (normalizeForMatching(la) === normalizeForMatching(lb) && la !== left.name && lb !== right.name) {
        // Shared alias that is only a weak given name → not unique.
        if (weak.has(normalizeForMatching(la)) || conflictingContexts) {
          continue;
        }
      }
      const m = matchCharacterName(la, lb);
      if (m.matches && m.confidence > bestAlias.confidence) {
        bestAlias = m;
      }
    }
  }

  // Downgrade alias hits that are only shared single-token given names.
  if (bestAlias.matches) {
    const overlapKeys = sharedTokens;
    if (
      overlapKeys.length > 0 &&
      overlapKeys.every((t) => t.split(/\s+/).length === 1) &&
      (weak.has(overlapKeys[0]) || conflictingContexts || leftHasKinship || rightHasKinship)
    ) {
      evidence.sharedGivenNameOnly = 0.75;
      evidence.conflictingRolePenalty = conflictingContexts ? 0.85 : 0.4;
      explanation.push(`Shared name token(s): ${overlapKeys.join(', ')}`);
      explanation.push('Not treating given-name/alias overlap as identity equivalence.');
      return {
        left,
        right,
        match_type: 'shared_given_name',
        confidence: 0.2,
        identityLikelihood: 0.14,
        recommendation: 'keep_separate',
        reason:
          'Shared first name, but distinct aliases, roles, and identity evidence indicate separate people.',
        reasonCode: 'SHARED_GIVEN_NAME_DISTINCT_IDENTITIES',
        explanation,
        evidence,
        actions: ['keep_separate', 'mark_distinct_people', 'set_preferred_name'],
      };
    }

    evidence.confirmedUniqueAliasMatch = bestAlias.confidence;
    const identityLikelihood = Math.min(0.9, bestAlias.confidence * 0.92);
    return {
      left,
      right,
      match_type: 'alias',
      confidence: identityLikelihood,
      identityLikelihood,
      recommendation: identityLikelihood >= 0.88 ? 'merge' : 'needs_identity_review',
      reason: 'confirmed unique alias overlap',
      reasonCode: 'CONFIRMED_UNIQUE_ALIAS',
      explanation: ['A non-weak alias appears to refer to the same person.'],
      evidence,
      actions: ['merge', 'keep_separate', 'mark_distinct_people', 'link_alias'],
    };
  }

  // Containment on display names (weak by default).
  const containment = matchCharacterName(left.name, right.name);
  if (containment.matches && containment.method === 'containment') {
    evidence.sharedGivenNameOnly = 0.35;
    return {
      left,
      right,
      match_type: 'containment',
      confidence: Math.min(0.62, containment.confidence * 0.7),
      identityLikelihood: Math.min(0.55, containment.confidence * 0.6),
      recommendation: 'needs_identity_review',
      reason: 'Name containment — may be the same person or a longer descriptive label.',
      reasonCode: 'CONTAINMENT_WEAK',
      explanation: [
        `“${left.name}” and “${right.name}” overlap by containment; confirm before merging.`,
      ],
      evidence,
      actions: ['needs_identity_review', 'keep_separate', 'merge', 'mark_distinct_people'],
    };
  }

  return null;
}

export function buildDuplicateReviewGroups(
  rows: ConsolidationCharacterRow[],
): DuplicateReviewGroup[] {
  const active = rows.filter((row) => {
    if (row.status === 'archived' || row.status === 'pending_deletion') return false;
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (meta.is_self === true || meta.is_user === true) return false;
    return true;
  });

  const groups: DuplicateReviewGroup[] = [];
  const seen = new Set<string>();

  // Exact-name buckets (still suggest merge, but always offer keep-separate).
  const byKey = new Map<string, ConsolidationCharacterRow[]>();
  for (const row of active) {
    const key = normalizeNameKey(row.name);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(row);
  }
  for (const [canonical_name, characters] of byKey) {
    if (characters.length < 2) continue;
    const include = characters.filter((c, i) =>
      characters.some((o, j) => i !== j && !isPairDistinct(c, o)),
    );
    for (let i = 0; i < characters.length; i++) {
      for (let j = i + 1; j < characters.length; j++) {
        seen.add(consolidationPairKey(characters[i].id, characters[j].id));
      }
    }
    if (include.length < 2) continue;
    groups.push({
      match_type: 'exact',
      confidence: 0.98,
      recommendation: 'merge',
      reason: 'same canonical name',
      reasonCode: 'SAME_CANONICAL_NAME',
      explanation: ['Preferred display names match exactly.'],
      actions: ['merge', 'keep_separate', 'mark_distinct_people'],
      canonical_name,
      characters: include,
      pair_key: consolidationPairKey(include[0].id, include[1].id),
    });
  }

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const left = active[i];
      const right = active[j];
      const pairKey = consolidationPairKey(left.id, right.id);
      if (seen.has(pairKey)) continue;
      if (normalizeNameKey(left.name) === normalizeNameKey(right.name)) continue;

      const scored = scoreConsolidationPair(left, right);
      if (!scored) continue;
      seen.add(pairKey);

      // Surface keep-separate recommendations so the UI can explain them,
      // but do not treat them as merge groups in the amber banner count —
      // callers may filter. We include them with recommendation keep_separate.
      groups.push({
        match_type: scored.match_type,
        confidence: scored.identityLikelihood,
        recommendation: scored.recommendation,
        reason: scored.reason,
        reasonCode: scored.reasonCode,
        explanation: scored.explanation,
        actions: scored.actions,
        canonical_name:
          normalizeNameKey(left.name).length <= normalizeNameKey(right.name).length
            ? normalizeNameKey(left.name)
            : normalizeNameKey(right.name),
        characters: [left, right],
        pair_key: pairKey,
      });
    }
  }

  return groups.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Persist pairwise NOT_SAME_PERSON / KEEP_SEPARATE on both cards (order-invariant).
 */
export async function persistConsolidationDecision(input: {
  userId: string;
  leftEntityId: string;
  rightEntityId: string;
  decision: Extract<ConsolidationDecisionKind, 'KEEP_SEPARATE' | 'NOT_SAME_PERSON'>;
  reasonCode?: ConsolidationReasonCode;
  sourceMessageId?: string;
}): Promise<{ ok: true; pairKey: string } | { ok: false; error: string }> {
  const { userId, leftEntityId, rightEntityId, decision, reasonCode } = input;
  if (!leftEntityId || !rightEntityId || leftEntityId === rightEntityId) {
    return { ok: false, error: 'invalid_pair' };
  }
  const pairKey = consolidationPairKey(leftEntityId, rightEntityId);
  const [idA, idB] = pairKey.split(':');

  const { data: rows, error } = await supabaseAdmin
    .from('characters')
    .select('id, metadata')
    .eq('user_id', userId)
    .in('id', [idA, idB]);
  if (error) return { ok: false, error: error.message };
  if ((rows ?? []).length !== 2) return { ok: false, error: 'pair_not_found' };

  const decidedAt = new Date().toISOString();
  for (const row of rows ?? []) {
    const otherId = row.id === idA ? idB : idA;
    const meta = { ...((row.metadata ?? {}) as Record<string, unknown>) };
    const confirmed = new Set<string>([
      ...((meta.confirmed_distinct_from as string[]) ?? []),
      otherId,
    ]);
    const distinct = new Set<string>([...((meta.distinct_from as string[]) ?? []), otherId]);
    const decisions = Array.isArray(meta.consolidation_decisions)
      ? [...(meta.consolidation_decisions as Array<Record<string, unknown>>)]
      : [];
    const withoutPair = decisions.filter((d) => d.pairKey !== pairKey);
    withoutPair.push({
      pairKey,
      leftEntityId: idA,
      rightEntityId: idB,
      decision,
      reasonCode: reasonCode ?? 'DISTINCT_IDENTITY_ASSERTION',
      source: 'USER_REVIEW',
      decidedAt,
    });
    meta.confirmed_distinct_from = [...confirmed];
    meta.distinct_from = [...distinct];
    meta.consolidation_decisions = withoutPair;

    const { error: updateError } = await supabaseAdmin
      .from('characters')
      .update({ metadata: meta, updated_at: decidedAt })
      .eq('id', row.id)
      .eq('user_id', userId);
    if (updateError) {
      logger.warn({ updateError, userId, id: row.id }, 'Failed to persist consolidation decision');
      return { ok: false, error: updateError.message };
    }

    void identityLedgerService.recordMutation({
      userId,
      entityId: row.id,
      entityType: 'character',
      mutationType: 'MERGE_REJECTED',
      newValue: { not_same_person: otherId, pairKey, decision },
      reason: `User marked pair as ${decision}`,
      source: 'USER',
    });
  }

  return { ok: true, pairKey };
}

export type ConsolidationRepairProposal = {
  pairKey: string;
  recommendation: ConsolidationRecommendation;
  reasonCode: ConsolidationReasonCode;
  leftName: string;
  rightName: string;
  proposedActions: string[];
};

/** Dry-run planner — never mutates records. */
export function planConsolidationRepairs(
  rows: ConsolidationCharacterRow[],
): ConsolidationRepairProposal[] {
  const groups = buildDuplicateReviewGroups(rows);
  return groups
    .filter((g) =>
      ['keep_separate', 'convert_descriptor', 'resolve_head_character', 'mark_distinct_people'].includes(
        g.recommendation,
      ),
    )
    .map((g) => ({
      pairKey: g.pair_key,
      recommendation: g.recommendation,
      reasonCode: g.reasonCode,
      leftName: g.characters[0]?.name ?? '',
      rightName: g.characters[1]?.name ?? '',
      proposedActions: [
        ...g.actions,
        ...g.characters.flatMap((c) =>
          (c.alias ?? [])
            .filter((a) => !validateAliasCandidate(a, { canonicalName: c.name }).accepted)
            .map((a) => `remove_invalid_alias:${c.name}:${a}`),
        ),
      ],
    }));
}

export const characterConsolidationReviewService = {
  scorePair: scoreConsolidationPair,
  buildGroups: buildDuplicateReviewGroups,
  persistDecision: persistConsolidationDecision,
  planRepairs: planConsolidationRepairs,
  pairKey: consolidationPairKey,
};
