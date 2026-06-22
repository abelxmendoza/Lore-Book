import { fetchJson } from '../lib/api';
import type { AlternativeCategory } from '../lib/suggestionMatchTypes';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function optionalUuidField(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  return UUID_RE.test(value.trim()) ? value.trim() : undefined;
}

export type CharacterSuggestion = {
  id: string;
  name: string;
  omegaEntityId?: string;
  questionId?: string;
  archetype?: string;
  role?: string;
  relationship?: string;
  context?: string;
  mentionCount: number;
  confidence: number;
  source: 'omega_entity' | 'entity_question' | 'chat_extract';
  match_status?: 'new' | 'similar' | 'existing';
  matched_book_id?: string | null;
  matched_book_name?: string | null;
  alternative_categories?: AlternativeCategory[];
};

export type CharacterCardReviewSuggestion = {
  id: string;
  characterId: string;
  name: string;
  status: string;
  reason: string;
  suggestedTitle?: string;
  reviewRound: number;
  maxRounds: number;
  source: 'card_audit';
  context: string;
};

export const characterSuggestionsApi = {
  list: (options?: { context?: 'general' | 'romantic'; rescan?: boolean }) => {
    const params = new URLSearchParams();
    if (options?.context === 'romantic') params.set('context', 'romantic');
    if (options?.rescan) params.set('rescan', 'true');
    const query = params.toString() ? `?${params.toString()}` : '';
    return fetchJson<{
      success: boolean;
      suggestions: CharacterSuggestion[];
      cardReviewSuggestions?: CharacterCardReviewSuggestion[];
      count: number;
    }>(`/api/characters/suggestions${query}`);
  },

  resolveCardReview: (characterId: string, action: 'keep' | 'delete') =>
    fetchJson<{ success: boolean }>(`/api/characters/card-audit/review/${characterId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),

  add: (suggestion: CharacterSuggestion) =>
    fetchJson<{ character: unknown; deduplicated?: boolean; restored?: boolean }>('/api/characters', {
      method: 'POST',
      body: JSON.stringify({
        name: suggestion.name,
        archetype: suggestion.archetype ?? (suggestion.relationship === 'romantic' ? 'romantic' : undefined),
        role: suggestion.role,
        relationshipDepth: suggestion.archetype === 'romantic' ? 'moderate' : 'acquaintance',
        hasMet: true,
        proximity: 'direct',
        omegaEntityId: optionalUuidField(suggestion.omegaEntityId),
        questionId: optionalUuidField(suggestion.questionId),
        suggestionId: suggestion.id,
      }),
    }),
};

export type LocationSuggestion = {
  id: string;
  name: string;
  type?: string;
  context?: string;
  description?: string;
  associatedWith?: string[];
  mentionCount: number;
  confidence: number;
  source: 'chat_detect' | 'metadata';
  status?: 'known' | 'new' | 'needs_review' | 'rejected';
  privacySensitive?: boolean;
  ownerDisplayName?: string;
  rejectionReason?: string;
  match_status?: 'new' | 'similar' | 'existing';
  matched_book_id?: string | null;
  matched_book_name?: string | null;
  alternative_categories?: AlternativeCategory[];
};

export const locationSuggestionsApi = {
  list: (options?: { rescan?: boolean }) => {
    const query = options?.rescan ? '?rescan=true' : '';
    return fetchJson<{ success: boolean; suggestions: LocationSuggestion[]; count: number }>(
      `/api/locations/suggestions${query}`
    );
  },

  accept: (suggestion: LocationSuggestion) =>
    fetchJson<{ success: boolean; location: { id: string; name: string } }>(
      '/api/locations/suggestions/accept',
      {
        method: 'POST',
        body: JSON.stringify({
          id: suggestion.id,
          name: suggestion.name,
          type: suggestion.type,
          context: suggestion.context,
          description: suggestion.description,
          associatedWith: suggestion.associatedWith,
        }),
      }
    ),
};
