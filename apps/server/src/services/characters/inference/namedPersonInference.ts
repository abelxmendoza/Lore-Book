import { parseCharacterName } from '../../../utils/characterNameMatching';
import { normalizePersonNameKey } from '../../../utils/personNameValidation';
import { looksLikeStageOrNickname } from '../audit/ambiguousCharacterGuard';
import { isValidFamilyTitleName } from './familyPersonInference';
import { isBareHonorificOnly } from './titlePersonInference';
import type { CharacterCandidate, CharacterTitleParts } from './characterInferenceTypes';

const FULL_NAME_RE =
  /\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+)\s+([A-ZÀ-Ý][a-zà-ÿ'’.-]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ'’.-]+)?)\b/g;

const NICKNAME_RE =
  /\b((?:Hell Fairy|Goth Tio|Ducky|Oscuridad|Baby Bats)(?:\s+[A-Z][a-z]+)?)\b/g;

const HONORIFIC_PREFIX_RE =
  /^(?:Mr\.?|Mrs\.?|Ms\.?|Miss|Dr\.?|Professor|Prof\.?|Pastor|Coach)\s+/i;

function shouldDeferToSpecializedInference(displayName: string): boolean {
  if (isValidFamilyTitleName(displayName)) return true;
  if (HONORIFIC_PREFIX_RE.test(displayName.trim())) return true;
  if (looksLikeStageOrNickname(displayName)) return true;
  const first = displayName.trim().split(/\s+/)[0] ?? '';
  if (isBareHonorificOnly(first)) return true;
  return false;
}

export function inferNamedPersons(text: string): CharacterCandidate[] {
  const out: CharacterCandidate[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  const fullRe = new RegExp(FULL_NAME_RE.source, 'g');
  while ((match = fullRe.exec(text)) !== null) {
    const displayName = match[0].trim();
    if (shouldDeferToSpecializedInference(displayName)) continue;
    const key = normalizePersonNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    const parts: CharacterTitleParts = {
      firstName: match[1],
      lastName: match[2],
    };

    out.push({
      displayName,
      identityType: 'full_name',
      titleParts: parts,
      context: {},
      aliases: [],
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.9,
      needsResolution: false,
      requiresReview: false,
      promotionStatus: 'suggested_card',
    });
  }

  const nickRe = new RegExp(NICKNAME_RE.source, 'gi');
  while ((match = nickRe.exec(text)) !== null) {
    const displayName = match[1].trim();
    const key = normalizePersonNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      displayName,
      identityType: looksLikeStage(displayName) ? 'stage_name' : 'nickname',
      titleParts: { nickname: displayName },
      context: {},
      aliases: [],
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.82,
      needsResolution: false,
      requiresReview: false,
      promotionStatus: 'candidate',
    });
  }

  return out;
}

function looksLikeStage(name: string): boolean {
  return /fairy|goth|oscuridad|baby bats/i.test(name);
}

export function isLikelyFullName(name: string): boolean {
  const tokens = name.trim().split(/\s+/);
  return tokens.length >= 2 && tokens.every((t) => /^[A-ZÀ-Ý]/.test(t));
}

export function parseNameTitleParts(name: string): CharacterTitleParts {
  const parsed = parseCharacterName(name);
  const tokens = name.trim().split(/\s+/);
  if (tokens.length >= 2 && parsed.coreName) {
    return {
      firstName: tokens[0],
      lastName: tokens.slice(1).join(' '),
    };
  }
  return { nickname: name };
}
