import type { ProjectSuggestion } from '../api/projects';

import { buildListClipboardText } from './listClipboard';

function evidenceText(suggestion: ProjectSuggestion): string | undefined {
  const first = suggestion.evidence?.[0];
  if (!first) return undefined;
  return typeof first === 'string' ? first : first.text;
}

export function buildProjectSuggestionsClipboardText(suggestions: ProjectSuggestion[]): string {
  return buildListClipboardText({
    title: 'Suggested Projects',
    items: suggestions.map((suggestion) => ({
      heading: suggestion.name,
      fields: [
        { label: 'Type', value: suggestion.project_type },
        { label: 'Status', value: suggestion.status },
        { label: 'Confidence', value: `${Math.round((suggestion.confidence ?? 0) * 100)}%` },
        { label: 'Match status', value: suggestion.match_status },
        { label: 'Matched project', value: suggestion.matched_project_name },
        { label: 'Source', value: suggestion.source },
        { label: 'Reasoning', value: suggestion.reasoning },
        { label: 'Evidence', value: evidenceText(suggestion) },
        { label: 'Description', value: suggestion.description },
      ],
    })),
  });
}
