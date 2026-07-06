/** Character card audit — status, actions, and provenance model. */

export type CharacterAuditStatus =
  | 'valid_identity'
  | 'valid_contextual_reference'
  | 'contextual_character_needs_context'
  | 'needs_context'
  | 'wrong_domain'
  | 'wrong_domain_tool'
  | 'wrong_domain_media'
  | 'wrong_domain_band'
  | 'wrong_domain_role'
  | 'wrong_domain_event'
  | 'wrong_domain_process'
  | 'sentence_bleed'
  | 'pronoun_fragment'
  | 'broken_span'
  | 'duplicate_or_merge_candidate'
  | 'junk_test_data'
  | 'bare_title_invalid'
  | 'needs_identity_resolution';

/** All wrong-domain flavors — legacy coarse status plus arbitration statuses. */
export function isWrongDomainStatus(status: CharacterAuditStatus): boolean {
  return status === 'wrong_domain' || status.startsWith('wrong_domain_');
}

export type CharacterAuditAction =
  | 'keep'
  | 'rename_with_context'
  | 'merge'
  | 'move_to_group'
  | 'move_to_interest'
  | 'move_to_book'
  | 'delete'
  | 'needs_review';

export type AmbiguousIdentityResolutionStatus =
  | 'unresolved'
  | 'candidate_named'
  | 'merged'
  | 'kept_separate';

export type AmbiguousCharacterContext = {
  roleLabel: string;
  contextualTitle: string;
  sourceMessageIds: string[];
  storyContexts: string[];
  environments: string[];
  timeHints: string[];
  linkedPeople: string[];
  linkedEvents: string[];
  linkedPlaces: string[];
  confidence: number;
  identityResolutionStatus: AmbiguousIdentityResolutionStatus;
};

export type CharacterCardAuditInput = {
  id: string;
  name: string;
  alias: string[];
  metadata: Record<string, unknown>;
  contextOfMention?: string | null;
  provenanceText?: string;
};

export type MergeCandidateRef = {
  characterId: string;
  currentTitle: string;
  overlapScore: number;
  reason: string;
};

export type CharacterCardAuditResult = {
  characterId: string;
  currentTitle: string;
  status: CharacterAuditStatus;
  reason: string;
  recommendedAction: CharacterAuditAction;
  suggestedTitle?: string;
  mergeCandidates?: MergeCandidateRef[];
  wrongDomainTarget?:
    | 'group'
    | 'interest'
    | 'system'
    | 'tool'
    | 'media'
    | 'band'
    | 'role'
    | 'event'
    | 'process'
    | 'skill'
    | 'place';
  provenanceSummary?: string;
  ambiguousContext?: AmbiguousCharacterContext;
  aliasToAdd?: string;
};

export type CharacterCardAuditReport = {
  userId: string;
  generatedAt: string;
  characterCount: number;
  results: CharacterCardAuditResult[];
  summary: Record<CharacterAuditStatus, number>;
};
