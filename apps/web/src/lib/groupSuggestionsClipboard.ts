import { buildListClipboardText } from './listClipboard';

interface GroupSuggestionLike {
  id: string;
  proposed_name?: string;
  detected_members: string[];
  suggested_group_type: string;
  suggested_user_relationship: string;
  is_public_entity: boolean;
  confidence: number;
  occurrence_count: number;
  context?: string;
}

export function buildGroupSuggestionsClipboardText<T extends GroupSuggestionLike>(
  suggestions: T[],
  displayName: (s: T) => string,
): string {
  return buildListClipboardText({
    title: 'Suggested Groups',
    items: suggestions.map((suggestion) => ({
      heading: displayName(suggestion),
      fields: [
        { label: 'Type', value: suggestion.suggested_group_type },
        { label: 'Your relationship', value: suggestion.suggested_user_relationship },
        { label: 'Members', value: suggestion.detected_members },
        { label: 'Public entity', value: suggestion.is_public_entity },
        { label: 'Confidence', value: `${Math.round((suggestion.confidence ?? 0) * 100)}%` },
        { label: 'Occurrences', value: suggestion.occurrence_count },
        { label: 'Context', value: suggestion.context },
      ],
    })),
  });
}
