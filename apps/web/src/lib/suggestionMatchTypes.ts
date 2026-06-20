/** Shared match metadata for LoreBook suggestion cards. */

export type SuggestionMatchStatus = 'new' | 'similar' | 'existing';

export type SuggestionBookDomain =
  | 'characters'
  | 'locations'
  | 'skills'
  | 'projects'
  | 'quests'
  | 'organizations'
  | 'groups';

export type AlternativeCategory = {
  domain: SuggestionBookDomain;
  label: string;
  reason: 'known_in_book' | 'lexical_type' | 'cross_book_guard';
  confidence: number;
  matchedName?: string;
};

export type SuggestionCategoryFields = {
  alternative_categories?: AlternativeCategory[];
};

export const SUGGESTION_DOMAIN_LABELS: Record<SuggestionBookDomain, string> = {
  characters: 'Characters',
  locations: 'Places',
  skills: 'Skills',
  projects: 'Projects',
  quests: 'Quests',
  organizations: 'Organizations',
  groups: 'Groups',
};

/** LoreBooks users can redirect suggestions into from suggestion panels. */
export const REDIRECTABLE_SUGGESTION_DOMAINS: SuggestionBookDomain[] = [
  'characters',
  'locations',
  'skills',
  'projects',
  'quests',
];

export type SuggestionBookEntry = {
  id?: string;
  name: string;
  aliases?: string[];
};

export type SuggestionMatchFields = {
  match_status?: SuggestionMatchStatus;
  matched_book_id?: string | null;
  matched_book_name?: string | null;
  /** Projects use these field names — normalized at display time. */
  matched_project_id?: string | null;
  matched_project_name?: string | null;
};

export function suggestionMatchStatus(item: SuggestionMatchFields): SuggestionMatchStatus {
  return item.match_status ?? 'new';
}

export function suggestionMatchedName(item: SuggestionMatchFields): string | null {
  return item.matched_book_name ?? item.matched_project_name ?? null;
}

export function suggestionMatchedId(item: SuggestionMatchFields): string | null {
  return item.matched_book_id ?? item.matched_project_id ?? null;
}

export function isSimilarSuggestion(item: SuggestionMatchFields): boolean {
  return suggestionMatchStatus(item) === 'similar';
}

export function isExistingSuggestion(item: SuggestionMatchFields): boolean {
  return suggestionMatchStatus(item) === 'existing';
}
