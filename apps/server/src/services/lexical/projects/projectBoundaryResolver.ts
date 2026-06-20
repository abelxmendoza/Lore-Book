/**
 * Trim trailing conjunctions and generic tails from project candidate spans.
 */

import { GENERIC_PROJECT_WORDS, TRAILING_CONJUNCTION } from './projectSuggestionTypes';

export type ProjectBoundaryResolution = {
  text: string;
  fixes: string[];
  trimmedSuffix?: string;
};

const TRAILING_GENERIC =
  /\s+(?:project|app|build|system|feature|idea|thing|stuff|code|repo|program)\s+(?:and|or|but)\s*$/i;

const LEADING_DETERMINER = /^(?:the|a|an|my|our|your|this|that)\s+/i;

export function resolveProjectBoundary(candidate: string): ProjectBoundaryResolution {
  let text = candidate.trim();
  const fixes: string[] = [];
  let trimmedSuffix: string | undefined;

  const apply = (re: RegExp, label: string) => {
    const m = text.match(re);
    if (m && m.index !== undefined && m.index > 0) {
      trimmedSuffix = text.slice(m.index).trim();
      text = text.slice(0, m.index).trim();
      fixes.push(`trim_${label}`);
    }
  };

  apply(TRAILING_GENERIC, 'generic_and_conjunction');
  apply(TRAILING_CONJUNCTION, 'trailing_conjunction');

  // "the LoreBook project" → LoreBook
  const projectSuffix = text.match(/^(.+?)\s+project$/i);
  if (projectSuffix) {
    const head = projectSuffix[1].replace(LEADING_DETERMINER, '').trim();
    if (head && !GENERIC_PROJECT_WORDS.has(head.toLowerCase())) {
      text = head;
      fixes.push('strip_project_suffix');
    }
  }

  text = text.replace(LEADING_DETERMINER, '').trim();

  return { text, fixes, trimmedSuffix };
}
