import { parseCharacterName, kinshipRoleKey } from '../../../utils/characterNameMatching';
import { normalizePersonNameKey } from '../../../utils/personNameValidation';
import { isBareTitleInvalid } from '../audit/bareTitleInvalidGuard';
import type { CharacterCandidate } from './characterInferenceTypes';

const FAMILY_TITLE_RE =
  /\b((?:T[íi]o|T[íi]a|Uncle|Aunt|Abuela|Abuelo|Cousin|Step\s*(?:Dad|Father|Mom|Mother))\s+[A-ZÀ-Ý][a-zà-ÿ'’.-]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ'’.-]+)?)\b/gi;

export function inferFamilyTitlePersons(text: string): CharacterCandidate[] {
  const out: CharacterCandidate[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(FAMILY_TITLE_RE.source, 'gi');
  while ((match = re.exec(text)) !== null) {
    const displayName = match[1].trim().replace(/\s+/g, ' ');
    const key = normalizePersonNameKey(displayName);
    if (seen.has(key) || isBareTitleInvalid(displayName)) continue;
    seen.add(key);

    const parsed = parseCharacterName(displayName);
    out.push({
      displayName,
      identityType: 'family_title_name',
      titleParts: {
        familyTitle: parsed.strippedTitle ?? undefined,
        firstName: parsed.coreName || undefined,
      },
      context: {},
      aliases: [],
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.88,
      needsResolution: false,
      requiresReview: false,
      promotionStatus: 'suggested_card',
    });
  }
  return out;
}

export function isValidFamilyTitleName(name: string): boolean {
  if (isBareTitleInvalid(name)) return false;
  const parsed = parseCharacterName(name);
  if (parsed.kinshipRole && parsed.coreName) return true;
  if (/^step\s*(?:dad|father|mom|mother)\s+\S+/i.test(name)) return true;
  return Boolean(kinshipRoleKey(name) && parsed.coreName);
}
