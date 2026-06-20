/** Dynamic character display title model — stored in characters.metadata.display_title */

export type CharacterTitleType =
  | 'legal_or_full_name'
  | 'honorific_name'
  | 'role_contextual'
  | 'nickname'
  | 'stage_name'
  | 'family_title_name'
  | 'unknown_contextual_reference';

export type TitleStability =
  | 'locked'
  | 'stable'
  | 'suggested_update'
  | 'temporary'
  | 'needs_resolution';

export type CharacterAliasType =
  | 'nickname'
  | 'stage_name'
  | 'middle_name'
  | 'family_title'
  | 'role_reference'
  | 'misspelling'
  | 'alternate_spelling'
  | 'old_display_title';

export type CharacterTitleParts = {
  honorific?: string;
  roleTitle?: string;
  givenName?: string;
  middleName?: string;
  familyName?: string;
  suffix?: string;
  nickname?: string;
  stageName?: string;
  contextualQualifier?: string;
};

export type CharacterAlias = {
  id: string;
  value: string;
  aliasType: CharacterAliasType;
  prominenceScore: number;
  evidenceCount: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
};

export type CharacterDisplayTitle = {
  characterId: string;
  primaryTitle: string;
  titleParts: CharacterTitleParts;
  titleType: CharacterTitleType;
  aliases: CharacterAlias[];
  stability: TitleStability;
  evidencePhrases: string[];
  lastUpdatedFromMessageId?: string;
};

export type ContextSourceKind =
  | 'organization'
  | 'event'
  | 'group'
  | 'place'
  | 'relationship_cluster'
  | 'time_period';

export type RankedContextSource = {
  kind: ContextSourceKind;
  label: string;
  rank: number;
};

export type ContextualReferenceInput = {
  rolePhrase: string;
  text: string;
  contextSources?: RankedContextSource[];
  evidencePhrases?: string[];
  messageId?: string;
};

export type TitleBuildResult = {
  displayTitle: CharacterDisplayTitle;
  characterSubtitle?: string;
  rejected: boolean;
  rejectionReason?: string;
};

export type TitleUpdateProposal = {
  proposedPrimaryTitle: string;
  proposedTitleType: CharacterTitleType;
  proposedParts: CharacterTitleParts;
  reason: string;
  stability: TitleStability;
  preservePreviousAsAlias: boolean;
};

export type MergeWithNamedPersonProposal = {
  namedPersonTitle: string;
  contextualTitle: string;
  suggestedPrimary: string;
  suggestedAliases: string[];
  suggestedSubtitle?: string;
};

export const METADATA_DISPLAY_TITLE_KEY = 'display_title';
export const METADATA_CHARACTER_SUBTITLE_KEY = 'character_subtitle';
export const METADATA_ALIAS_PROMINENCE_KEY = 'alias_prominence';
