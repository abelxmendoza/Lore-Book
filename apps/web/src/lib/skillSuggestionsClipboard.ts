import type { SkillSuggestion } from '../api/skills';

import { buildListClipboardText } from './listClipboard';

function evidenceText(suggestion: SkillSuggestion): string | undefined {
  const raw = suggestion.evidence?.[0];
  if (!raw) return undefined;
  return typeof raw === 'string' ? raw : raw.text;
}

export function buildSkillSuggestionsClipboardText(suggestions: SkillSuggestion[]): string {
  return buildListClipboardText({
    title: 'Skills detected in your story',
    items: suggestions.map((suggestion) => ({
      heading: suggestion.skill_name,
      fields: [
        { label: 'Category', value: suggestion.skill_category },
        { label: 'Type', value: suggestion.skill_type },
        { label: 'Confidence', value: `${Math.round((suggestion.confidence ?? 0) * 100)}%` },
        { label: 'Proficiency', value: suggestion.proficiency },
        { label: 'Enjoyment', value: suggestion.enjoyment },
        { label: 'Usage', value: suggestion.usage_frequency },
        { label: 'Trajectory', value: suggestion.trajectory },
        { label: 'Monetization', value: suggestion.monetization },
        { label: 'Parent skill', value: suggestion.parent_skill_name },
        { label: 'Related skills', value: suggestion.related_skill_names },
        { label: 'Related jobs', value: suggestion.related_jobs },
        { label: 'Related projects', value: suggestion.related_projects },
        { label: 'Match status', value: suggestion.match_status },
        { label: 'Matched book entry', value: suggestion.matched_book_name },
        { label: 'Description', value: suggestion.description },
        { label: 'Origin', value: suggestion.origin_story },
        { label: 'Evidence', value: evidenceText(suggestion) },
      ],
    })),
  });
}
