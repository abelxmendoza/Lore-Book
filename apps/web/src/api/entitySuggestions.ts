import { fetchJson } from '../lib/api';
import type { AlternativeCategory } from '../lib/suggestionMatchTypes';

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

export const characterSuggestionsApi = {
  list: (options?: { context?: 'general' | 'romantic'; rescan?: boolean }) => {
    const params = new URLSearchParams();
    if (options?.context === 'romantic') params.set('context', 'romantic');
    if (options?.rescan) params.set('rescan', 'true');
    const query = params.toString() ? `?${params.toString()}` : '';
    return fetchJson<{ success: boolean; suggestions: CharacterSuggestion[]; count: number }>(
      `/api/characters/suggestions${query}`
    );
  },

  add: (suggestion: CharacterSuggestion) =>
    fetchJson<{ character: unknown }>('/api/characters', {
      method: 'POST',
      body: JSON.stringify({
        name: suggestion.name,
        archetype: suggestion.archetype ?? (suggestion.relationship === 'romantic' ? 'romantic' : undefined),
        role: suggestion.role,
        relationshipDepth: suggestion.archetype === 'romantic' ? 'moderate' : 'acquaintance',
        hasMet: true,
        proximity: 'direct',
        omegaEntityId: suggestion.omegaEntityId,
        questionId: suggestion.questionId,
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
