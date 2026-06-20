import { fetchJson } from '../lib/api';

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

export type CharacterAlias = {
  id: string;
  value: string;
  aliasType: string;
  prominenceScore: number;
  evidenceCount: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
};

export type CharacterDisplayTitle = {
  characterId: string;
  primaryTitle: string;
  titleParts: Record<string, string | undefined>;
  titleType: CharacterTitleType;
  aliases: CharacterAlias[];
  stability: TitleStability;
  evidencePhrases: string[];
  lastUpdatedFromMessageId?: string;
};

export type CharacterTitleResponse = {
  displayTitle: CharacterDisplayTitle;
  characterSubtitle?: string;
};

export const characterTitleApi = {
  get: (characterId: string) =>
    fetchJson<CharacterTitleResponse>(`/api/characters/${characterId}/title`),

  patch: (characterId: string, body: {
    primaryTitle: string;
    characterSubtitle?: string;
    stability?: TitleStability;
    userConfirmed?: boolean;
  }) =>
    fetchJson<CharacterTitleResponse & { applied?: boolean }>(`/api/characters/${characterId}/title`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  addAlias: (characterId: string, body: { value: string; aliasType: string }) =>
    fetchJson<{ displayTitle: CharacterDisplayTitle }>(`/api/characters/${characterId}/aliases`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  promoteAlias: (characterId: string, aliasId: string) =>
    fetchJson<{ displayTitle: CharacterDisplayTitle }>(
      `/api/characters/${characterId}/aliases/${encodeURIComponent(aliasId)}/promote`,
      { method: 'POST' }
    ),

  lockTitle: (characterId: string) =>
    fetchJson<{ displayTitle: CharacterDisplayTitle }>(`/api/characters/${characterId}/title/lock`, {
      method: 'POST',
    }),

  suggestUpdate: (characterId: string) =>
    fetchJson<{ suggestion: unknown; displayTitle: CharacterDisplayTitle }>(
      `/api/characters/${characterId}/suggest-title-update`,
      { method: 'POST' }
    ),

  resolveReference: (
    characterId: string,
    body: {
      namedPerson?: string;
      preferContextualPrimary?: boolean;
      subtitle?: string;
      userConfirmed?: boolean;
    }
  ) =>
    fetchJson<{ displayTitle: CharacterDisplayTitle; applied: boolean; proposal?: unknown }>(
      `/api/characters/${characterId}/resolve-reference`,
      { method: 'POST', body: JSON.stringify(body) }
    ),
};
