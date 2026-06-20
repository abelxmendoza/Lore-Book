import {
  collectBookEntriesWithIds,
  resolveBookNameMatch,
  type BookMatchStatus,
  type BookNameEntryWithId,
} from '../utils/suggestionBookFilter';

export type SuggestionMatchFields = {
  match_status: BookMatchStatus;
  matched_book_id?: string | null;
  matched_book_name?: string | null;
};

export function buildBookIndexFromLabels(
  items: Array<{ id: string; label: string; aliases?: string[] }>
): { exactKeys: Set<string>; entries: BookNameEntryWithId[] } {
  return collectBookEntriesWithIds(
    items.map((item) => ({
      id: item.id,
      names: [item.label, ...(item.aliases ?? [])],
    }))
  );
}

export function enrichNameWithBookMatch(
  name: string,
  index: { exactKeys: Set<string>; entries: BookNameEntryWithId[] }
): SuggestionMatchFields {
  const match = resolveBookNameMatch(name, index.exactKeys, index.entries);
  return {
    match_status: match.status,
    matched_book_id: match.matchedId ?? null,
    matched_book_name: match.matchedName ?? null,
  };
}

export function enrichSuggestionsWithBookMatch<T extends Record<string, unknown>>(
  items: T[],
  getName: (item: T) => string,
  index: { exactKeys: Set<string>; entries: BookNameEntryWithId[] }
): Array<T & SuggestionMatchFields> {
  return items.map((item) => ({
    ...item,
    ...enrichNameWithBookMatch(getName(item), index),
  }));
}
