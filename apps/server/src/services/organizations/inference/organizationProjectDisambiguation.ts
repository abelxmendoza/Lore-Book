import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { OrganizationCandidate } from './organizationInferenceTypes';

const PROJECT_NAMES = new Set([
  'lorebook',
  'lore book',
  'omega',
  'omega-1',
  'omega 1',
]);

const COMMUNITY_SCENE_PATTERNS = [
  /\b([A-Z]{2,}\s+)?Ska Scene\b/i,
  /\b(?:the\s+)?(?:LA|Los Angeles)\s+Ska\s+Scene\b/i,
  /\b(?:music|art|goth|punk)\s+scene\b/i,
];

export function isProjectNotOrganization(name: string): boolean {
  return PROJECT_NAMES.has(normalizeNameKey(name));
}

export function isCommunityNotOrganization(name: string, text: string): boolean {
  const key = normalizeNameKey(name);
  if (key.includes('scene') || key.includes('community') && !key.includes('robotics')) {
    if (/\b(?:ska scene|music scene|goth scene)\b/i.test(text)) return true;
  }
  for (const re of COMMUNITY_SCENE_PATTERNS) {
    if (re.test(name) || re.test(text)) return true;
  }
  return false;
}

/** Reject org candidates that are really user projects or community scenes. */
export function disambiguateOrganizationFromProject(
  candidates: OrganizationCandidate[],
  text: string,
): OrganizationCandidate[] {
  return candidates.filter((candidate) => {
    if (isProjectNotOrganization(candidate.displayName)) return false;
    if (isCommunityNotOrganization(candidate.displayName, text)) return false;

    if (/\b(?:building|developing|working on)\s+LoreBook\b/i.test(text)) {
      if (normalizeNameKey(candidate.displayName) === 'lorebook') return false;
    }

    if (/\bOpenAI\s+API\b/i.test(text) && normalizeNameKey(candidate.displayName) === 'openai') {
      return true;
    }

    return true;
  });
}

export function isLoreBookProductName(name: string): boolean {
  return normalizeNameKey(name) === 'lorebook';
}
