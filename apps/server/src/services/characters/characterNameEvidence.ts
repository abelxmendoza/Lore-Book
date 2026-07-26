/**
 * Character name-evidence typing — distinguishes given names, nicknames,
 * kinship labels, and descriptive labels so shared first names are not
 * treated as alias-equivalence edges.
 */

export type CharacterNameEvidenceKind =
  | 'canonical_name'
  | 'given_name'
  | 'family_name'
  | 'nickname'
  | 'handle'
  | 'scene_alias'
  | 'kinship_label'
  | 'preferred_display_name'
  | 'descriptive_label';

export type CharacterNameAuthority =
  | 'explicit_user_statement'
  | 'explicit_user_correction'
  | 'confirmed_record'
  | 'model_extraction'
  | 'title_derivation';

export type CharacterNameEvidenceStatus = 'confirmed' | 'candidate' | 'rejected';

export type CharacterNameEvidence = {
  value: string;
  kind: CharacterNameEvidenceKind;
  authority: CharacterNameAuthority;
  confidence: number;
  status: CharacterNameEvidenceStatus;
  sourceMessageId?: string;
};

export type CharacterLabelClass =
  | 'NAMED_PERSON'
  | 'NAMED_PERSON_WITH_ALIAS'
  | 'RELATIONAL_PERSON_DESCRIPTOR'
  | 'UNKNOWN_PERSON_DESCRIPTOR'
  | 'ROLE_BASED_PERSON_DESCRIPTOR'
  | 'SPATIAL_OR_EVENT_DESCRIPTOR'
  | 'AMBIGUOUS_MENTION';

export type ConsolidationRecommendation =
  | 'merge'
  | 'keep_separate'
  | 'link_alias'
  | 'set_preferred_name'
  | 'convert_descriptor'
  | 'resolve_head_character'
  | 'mark_distinct_people'
  | 'needs_identity_review'
  | 'review';

export type ConsolidationReasonCode =
  | 'SAME_CANONICAL_NAME'
  | 'CONFIRMED_UNIQUE_ALIAS'
  | 'EXPLICIT_SAME_PERSON'
  | 'SHARED_GIVEN_NAME_DISTINCT_IDENTITIES'
  | 'RELATIONAL_DESCRIPTOR_NOT_ALIAS'
  | 'SPATIAL_DESCRIPTOR_HEAD_MISMATCH'
  | 'DISTINCT_IDENTITY_ASSERTION'
  | 'MALFORMED_ALIAS_IGNORED'
  | 'CONFLICTING_ROLE_CONTEXT'
  | 'CONTAINMENT_WEAK'
  | 'NEEDS_REVIEW';

export type ConsolidationDecisionKind =
  | 'MERGED'
  | 'KEEP_SEPARATE'
  | 'NOT_SAME_PERSON'
  | 'DEFERRED';

/** Order-invariant pair key for consolidation decisions. */
export function consolidationPairKey(entityAId: string, entityBId: string): string {
  return [entityAId, entityBId].filter(Boolean).sort().join(':');
}
