import { normalizePersonNameKey } from '../../../utils/personNameValidation';
import { isBareTitleInvalid } from '../audit/bareTitleInvalidGuard';
import type { CharacterCandidate } from './characterInferenceTypes';

const HONORIFIC_NAME_RE =
  /\b((?:Mr\.?|Mrs\.?|Ms\.?|Miss|Dr\.?|Professor|Prof\.?|Pastor|Coach)\s+[A-ZÀ-Ý][a-zà-ÿ'’.-]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ'’.-]+)?)\b/g;

export function inferHonorificPersons(text: string): CharacterCandidate[] {
  const out: CharacterCandidate[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(HONORIFIC_NAME_RE.source, 'g');
  while ((match = re.exec(text)) !== null) {
    const displayName = match[1].trim().replace(/\s+/g, ' ');
    const key = normalizePersonNameKey(displayName);
    if (seen.has(key) || isBareTitleInvalid(displayName)) continue;
    seen.add(key);

    const [honorific, ...rest] = displayName.split(/\s+/);
    out.push({
      displayName,
      identityType: 'honorific_name',
      titleParts: {
        honorific,
        firstName: rest[0],
        lastName: rest.length > 1 ? rest.slice(1).join(' ') : undefined,
      },
      context: {},
      aliases: [],
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.87,
      needsResolution: false,
      requiresReview: false,
      promotionStatus: 'suggested_card',
    });
  }
  return out;
}

export function isBareHonorificOnly(name: string): boolean {
  const key = normalizePersonNameKey(name);
  return ['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'professor', 'pastor', 'coach'].includes(key);
}
