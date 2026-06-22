import type { CharacterCandidate, CharacterPromotionStatus } from './characterInferenceTypes';
import { detectEmotionalWeight } from './rolePersonInference';

const NAMED_TYPES = new Set([
  'full_name',
  'family_title_name',
  'honorific_name',
  'nickname',
  'stage_name',
]);

export function evaluatePromotionStatus(
  candidate: CharacterCandidate,
  opts: {
    mentionCount?: number;
    userConfirmed?: boolean;
    evidenceText?: string;
  } = {},
): CharacterPromotionStatus {
  if (opts.userConfirmed) return 'confirmed_character';

  const mentionCount = opts.mentionCount ?? 1;
  const emotional = detectEmotionalWeight(opts.evidenceText ?? candidate.evidencePhrases.join(' '));
  const boostedConfidence = Math.min(1, candidate.confidence + emotional.boost);

  if (NAMED_TYPES.has(candidate.identityType) && boostedConfidence >= 0.85) {
    return mentionCount >= 2 ? 'suggested_card' : 'candidate';
  }

  if (candidate.identityType === 'role_contextual' || candidate.identityType === 'ambiguous_contextual') {
    if (mentionCount >= 3 || emotional.boost >= 0.12) return 'suggested_card';
    return 'candidate';
  }

  if (mentionCount >= 3 && boostedConfidence >= 0.75) return 'suggested_card';
  if (mentionCount >= 2) return 'candidate';
  return 'mention_only';
}

export function canPromoteToCharacterCard(
  candidate: CharacterCandidate,
  opts: { mentionCount?: number; userConfirmed?: boolean } = {},
): boolean {
  const status = evaluatePromotionStatus(candidate, opts);
  if (opts.userConfirmed) return true;
  if (status === 'confirmed_character' || status === 'suggested_card') {
    if (candidate.identityType === 'full_name' || candidate.identityType === 'family_title_name') {
      return true;
    }
    if (candidate.identityType === 'honorific_name') return true;
    if (status === 'suggested_card' && (opts.mentionCount ?? 0) >= 2) return true;
  }
  return false;
}

export function shouldKeepAsSuggestionOnly(candidate: CharacterCandidate): boolean {
  return (
    candidate.promotionStatus === 'mention_only' ||
    candidate.promotionStatus === 'candidate' ||
    candidate.requiresReview
  );
}
