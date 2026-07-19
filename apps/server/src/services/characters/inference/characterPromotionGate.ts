import { decideIdentityLifecycle } from '../../actors/identityLifecycleService';
import { classifyMention } from '../../actors/mentionClassifier';
import type { CharacterCandidate, CharacterPromotionStatus } from './characterInferenceTypes';
import { detectEmotionalWeight } from './rolePersonInference';

const NAMED_TYPES = new Set([
  'full_name',
  'family_title_name',
  'honorific_name',
  'nickname',
  'stage_name',
]);

function stageToPromotionStatus(
  stage: ReturnType<typeof decideIdentityLifecycle>['stage'],
): CharacterPromotionStatus {
  switch (stage) {
    case 'CORE_CHARACTER':
      return 'confirmed_character';
    case 'CHARACTER':
      return 'suggested_card';
    case 'RESOLVED':
    case 'CANDIDATE':
      return 'candidate';
    case 'MENTION':
    default:
      return 'mention_only';
  }
}

export function evaluatePromotionStatus(
  candidate: CharacterCandidate,
  opts: {
    mentionCount?: number;
    conversationCount?: number;
    timeSpanDays?: number;
    userConfirmed?: boolean;
    evidenceText?: string;
  } = {},
): CharacterPromotionStatus {
  if (opts.userConfirmed) return 'confirmed_character';

  const mentionCount = opts.mentionCount ?? 1;
  const emotional = detectEmotionalWeight(opts.evidenceText ?? candidate.evidencePhrases.join(' '));
  const mention = classifyMention({ text: candidate.displayName, kind: 'character' });
  const decision = decideIdentityLifecycle({
    name: candidate.displayName,
    mention,
    signals: {
      mentionCount,
      conversationCount: opts.conversationCount ?? Math.min(mentionCount, 2),
      timeSpanDays: opts.timeSpanDays ?? 0,
      userConfirmed: opts.userConfirmed,
      namedExplicitly: NAMED_TYPES.has(candidate.identityType),
      baseConfidence: Math.min(1, candidate.confidence + emotional.boost),
      emotionalWeight: Math.min(1, emotional.boost * 4),
      narrativeImportance:
        candidate.identityType === 'role_contextual' || candidate.identityType === 'ambiguous_contextual'
          ? 0.35
          : 0.2,
    },
  });

  return stageToPromotionStatus(decision.stage);
}

export function canPromoteToCharacterCard(
  candidate: CharacterCandidate,
  opts: {
    mentionCount?: number;
    conversationCount?: number;
    timeSpanDays?: number;
    userConfirmed?: boolean;
    evidenceText?: string;
  } = {},
): boolean {
  if (opts.userConfirmed) return true;
  const status = evaluatePromotionStatus(candidate, opts);
  if (status !== 'confirmed_character' && status !== 'suggested_card') return false;

  const mention = classifyMention({ text: candidate.displayName, kind: 'character' });
  const decision = decideIdentityLifecycle({
    name: candidate.displayName,
    mention,
    signals: {
      mentionCount: opts.mentionCount ?? 1,
      conversationCount: opts.conversationCount ?? Math.min(opts.mentionCount ?? 1, 2),
      timeSpanDays: opts.timeSpanDays ?? 0,
      userConfirmed: opts.userConfirmed,
      namedExplicitly: NAMED_TYPES.has(candidate.identityType),
      baseConfidence: candidate.confidence,
    },
  });
  return decision.mayPromoteToCharacter;
}

export function shouldKeepAsSuggestionOnly(candidate: CharacterCandidate): boolean {
  return (
    candidate.promotionStatus === 'mention_only' ||
    candidate.promotionStatus === 'candidate' ||
    candidate.requiresReview
  );
}
