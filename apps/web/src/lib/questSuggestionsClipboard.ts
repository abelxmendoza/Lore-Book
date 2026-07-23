import type { QuestSuggestion } from '../types/quest';

import { buildListClipboardText } from './listClipboard';

export function buildQuestSuggestionsClipboardText(suggestions: QuestSuggestion[]): string {
  return buildListClipboardText({
    title: 'Suggested Quests',
    items: suggestions.map((suggestion) => ({
      heading: suggestion.title,
      fields: [
        { label: 'Type', value: suggestion.quest_type },
        { label: 'Description', value: suggestion.description },
        { label: 'Priority', value: suggestion.priority },
        { label: 'Importance', value: suggestion.importance },
        { label: 'Impact', value: suggestion.impact },
        { label: 'Confidence', value: `${Math.round((suggestion.confidence ?? 0) * 100)}%` },
        { label: 'Match status', value: suggestion.match_status },
        { label: 'Matched book entry', value: suggestion.matched_book_name },
        { label: 'Reasoning', value: suggestion.reasoning },
      ],
    })),
  });
}
