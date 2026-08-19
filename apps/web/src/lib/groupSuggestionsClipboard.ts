import { buildListClipboardText } from './listClipboard';

export interface GroupSuggestionClipboardFields {
  detected_members: string[];
  suggested_group_type: string;
  suggested_user_relationship: string;
  is_public_entity: boolean;
  confidence: number;
  occurrence_count: number;
  context?: string;
}

export function buildGroupSuggestionsClipboardText<T extends GroupSuggestionClipboardFields>(
  candidates: T[],
  nameFn: (candidate: T) => string,
): string {
  return buildListClipboardText({
    title: 'Groups detected in your chats',
    items: candidates.map((candidate) => ({
      heading: nameFn(candidate),
      fields: [
        { label: 'Type', value: candidate.suggested_group_type },
        { label: 'Your relationship', value: candidate.suggested_user_relationship },
        { label: 'Public entity', value: candidate.is_public_entity },
        { label: 'Confidence', value: `${Math.round((candidate.confidence ?? 0) * 100)}%` },
        { label: 'Occurrences', value: candidate.occurrence_count },
        { label: 'Members', value: candidate.detected_members },
        { label: 'Context', value: candidate.context },
      ],
    })),
  });
}
