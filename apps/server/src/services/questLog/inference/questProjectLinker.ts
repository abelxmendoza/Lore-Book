import { normalizeNameKey } from '../../../utils/nameNormalization';
import { PROJECT_BOOK_ENTITIES } from './questLogInferenceTypes';

export type ProjectLinkResult = {
  displayName: string;
  parentProjectName?: string;
  parentProjectId?: string;
};

const PROJECT_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'LoreBook', pattern: /\b(?:for|on|in)\s+LoreBook\b|\bLoreBook\s+(?:project|build|feature)\b/i },
  { name: 'Omega-1', pattern: /\b(?:for|on|in)\s+Omega-1\b/i },
  { name: 'Abeliciousness', pattern: /\b(?:for|on|in)\s+Abeliciousness\b/i },
];

export function linkQuestItemToProject(displayName: string, text: string): ProjectLinkResult {
  for (const { name, pattern } of PROJECT_PATTERNS) {
    if (pattern.test(text) || new RegExp(`\\b${escapeRe(name)}\\b`, 'i').test(displayName)) {
      return { displayName, parentProjectName: name };
    }
  }

  if (/\bLoreBook\b/i.test(text)) {
    return { displayName, parentProjectName: 'LoreBook' };
  }

  return { displayName };
}

export function resolveParentProjectId(
  parentProjectName: string | undefined,
  knownProjects?: Record<string, string>,
): string | undefined {
  if (!parentProjectName || !knownProjects) return undefined;
  return knownProjects[normalizeNameKey(parentProjectName)];
}

/** Project Book entities should not become Quest Log items without an action verb. */
export function isProjectBookEntity(name: string): boolean {
  return PROJECT_BOOK_ENTITIES.has(normalizeNameKey(name));
}

/** Quest Log items must not become Project Book card suggestions. */
export function shouldCreateProjectCardFromQuestItem(displayName: string): boolean {
  const key = normalizeNameKey(displayName);
  if (PROJECT_BOOK_ENTITIES.has(key)) return true;
  if (/\b(?:launch|build|ship|run|fix|add|implement)\b/i.test(displayName)) return false;
  return false;
}

export function attachProjectLinks<T extends { displayName: string; context: { projectContext?: string }; parentProjectId?: string }>(
  candidate: T,
  text: string,
  knownProjects?: Record<string, string>,
): T {
  const linked = linkQuestItemToProject(candidate.displayName, text);
  const parentProjectName = candidate.context.projectContext ?? linked.parentProjectName;
  return {
    ...candidate,
    context: { ...candidate.context, projectContext: parentProjectName },
    parentProjectId: resolveParentProjectId(parentProjectName, knownProjects),
  };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
