import { fetchJson } from '../lib/api';
import type { SuggestionBookDomain } from '../lib/suggestionMatchTypes';

export type SuggestionReclassifyInput = {
  name: string;
  fromDomain: SuggestionBookDomain;
  toDomain: SuggestionBookDomain;
  suggestionId?: string;
  context?: string;
  evidence?: string;
  description?: string;
  questType?: string;
  skillCategory?: string;
  projectType?: string;
  locationType?: string;
};

export type SuggestionReclassifyResult = {
  success: boolean;
  fromDomain: SuggestionBookDomain;
  toDomain: SuggestionBookDomain;
  name: string;
  correctionId?: string;
  message: string;
  autoMerged?: boolean;
  mergeNotification?: string;
  redirectMatch?: {
    disposition: 'auto_merged' | 'suggested' | 'uncertain';
    matchedId?: string;
    matchedName?: string;
    confidence?: number;
    method?: string;
  };
};

export const suggestionReclassifyApi = {
  reclassify: (input: SuggestionReclassifyInput) =>
    fetchJson<SuggestionReclassifyResult>('/api/conversation/suggestion-reclassify', {
      method: 'POST',
      body: JSON.stringify({
        name: input.name,
        from_domain: input.fromDomain,
        to_domain: input.toDomain,
        suggestion_id: input.suggestionId,
        context: input.context,
        evidence: input.evidence,
        description: input.description,
        quest_type: input.questType,
        skill_category: input.skillCategory,
        project_type: input.projectType,
        location_type: input.locationType,
      }),
    }),
};
