import type { LocationSuggestion } from '../api/entitySuggestions';

import { buildListClipboardText } from './listClipboard';

export function buildLocationSuggestionsClipboardText(suggestions: LocationSuggestion[]): string {
  return buildListClipboardText({
    title: 'Suggested Places',
    items: suggestions.map((suggestion) => ({
      heading: suggestion.name,
      fields: [
        { label: 'Type', value: suggestion.type },
        { label: 'Source', value: suggestion.source },
        { label: 'Status', value: suggestion.status },
        { label: 'Mentions', value: suggestion.mentionCount },
        { label: 'Confidence', value: `${Math.round((suggestion.confidence ?? 0) * 100)}%` },
        { label: 'Match status', value: suggestion.match_status },
        { label: 'Matched place', value: suggestion.matched_book_name },
        { label: 'Owner', value: suggestion.ownerDisplayName },
        { label: 'Privacy sensitive', value: suggestion.privacySensitive },
        { label: 'Associated with', value: suggestion.associatedWith },
        { label: 'Context', value: suggestion.context },
        { label: 'Description', value: suggestion.description },
      ],
    })),
  });
}
