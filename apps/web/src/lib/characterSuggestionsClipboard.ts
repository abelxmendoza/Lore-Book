import type { CharacterSuggestion } from '../api/entitySuggestions';

import { buildListClipboardText } from './listClipboard';

const SOURCE_LABEL: Record<CharacterSuggestion['source'], string> = {
  omega_entity: 'Detected person',
  entity_question: 'Needs confirmation',
  chat_extract: 'From recent chats',
};

export function buildCharacterSuggestionsClipboardText(
  suggestions: CharacterSuggestion[],
  options?: { title?: string },
): string {
  return buildListClipboardText({
    title: options?.title ?? 'People detected in your chats',
    items: suggestions.map((suggestion) => ({
      heading: suggestion.name,
      fields: [
        { label: 'Source', value: SOURCE_LABEL[suggestion.source] ?? suggestion.source },
        { label: 'Role', value: suggestion.role },
        { label: 'Archetype', value: suggestion.archetype },
        { label: 'Relationship', value: suggestion.relationship },
        { label: 'Mentions', value: suggestion.mentionCount },
        { label: 'Confidence', value: `${Math.round((suggestion.confidence ?? 0) * 100)}%` },
        { label: 'Match status', value: suggestion.match_status },
        { label: 'Matched book entry', value: suggestion.matched_book_name },
        { label: 'Context', value: suggestion.context },
      ],
    })),
  });
}
