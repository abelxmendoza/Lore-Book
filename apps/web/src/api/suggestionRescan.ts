import { fetchJson } from '../lib/api';

export type SuggestionDomain =
  | 'characters'
  | 'quests'
  | 'skills'
  | 'projects'
  | 'locations'
  | 'romantic';

export type SuggestionRescanSummary = {
  domains: SuggestionDomain[];
  lorebookParse?: {
    linesParsed: number;
    operationsSeen: number;
    applied: number;
    skipped: number;
    byDomain: Record<string, number>;
  };
  results: Partial<Record<SuggestionDomain, Record<string, unknown>>>;
};

export const suggestionRescanApi = {
  rescan: (domains: SuggestionDomain[]) =>
    fetchJson<{ success: boolean; summary: SuggestionRescanSummary }>(
      '/api/conversation/suggestion-rescan',
      {
        method: 'POST',
        body: JSON.stringify({ domains }),
      }
    ),
};
