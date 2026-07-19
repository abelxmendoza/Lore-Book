/**
 * Identity lifecycle scoring — historian rules for who becomes a Character.
 *
 * Pure functions: no DB. Callers supply mention/conversation aggregates.
 *
 * Mention → Candidate → Resolved Identity → Character → Core Character
 */

import {
  classifyMention,
  type ClassifiedMention,
  type MentionStatus,
} from './mentionClassifier';
import {
  IDENTITY_THRESHOLDS,
  type IdentityLifecycleDecision,
  type IdentityScoreBreakdown,
  type IdentityScoreSignals,
  type IdentityStage,
} from './identityLifecycleTypes';

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Score identity signals 0–100.
 * Never promote from a single weak mention — frequency + conversations matter.
 */
export function scoreIdentity(signals: IdentityScoreSignals): IdentityScoreBreakdown {
  const mentions = Math.max(0, signals.mentionCount ?? 0);
  const conversations = Math.max(0, signals.conversationCount ?? 0);
  const span = Math.max(0, signals.timeSpanDays ?? 0);
  const emotional = clamp(signals.emotionalWeight ?? 0, 0, 1);
  const relationship = clamp(signals.relationshipStrength ?? 0, 0, 1);
  const narrative = clamp(signals.narrativeImportance ?? 0, 0, 1);
  const futureRefs = Math.max(0, signals.futureReferences ?? 0);
  const base = clamp(signals.baseConfidence ?? 0.5, 0, 1);

  // Frequency: 1 → 4, 2 → 10, 3 → 16, 5+ → 25
  const frequency = clamp(mentions === 0 ? 0 : 4 + (mentions - 1) * 6, 0, 25);

  // Conversations: 1 → 6, 2 → 14, 3 → 20, 5+ → 25
  const conversationsScore = clamp(
    conversations === 0 ? 0 : 6 + (conversations - 1) * 8,
    0,
    25,
  );

  // Time span: 0d → 0, 7d → 5, 30d → 10, 90d+ → 15
  const timeSpan = clamp(span <= 0 ? 0 : span < 7 ? 3 : span < 30 ? 8 : span < 90 ? 12 : 15, 0, 15);

  // Naming: explicit proper name / user confirmed
  let naming = 0;
  if (signals.userConfirmed) naming = 20;
  else if (signals.namedExplicitly) naming = 16;
  else naming = Math.round(base * 6);

  const relationshipScore = Math.round(relationship * 10);
  const emotionalScore = Math.round(emotional * 10);
  const narrativeScore = Math.round(narrative * 8);
  const futureRefsScore = clamp(futureRefs * 3, 0, 7);

  const total = clamp(
    frequency +
      conversationsScore +
      timeSpan +
      naming +
      relationshipScore +
      emotionalScore +
      narrativeScore +
      futureRefsScore,
    0,
    100,
  );

  return {
    frequency,
    conversations: conversationsScore,
    timeSpan,
    naming,
    relationship: relationshipScore,
    emotional: emotionalScore,
    narrative: narrativeScore,
    futureRefs: futureRefsScore,
    total,
  };
}

function mentionStatusToFloor(status: MentionStatus): IdentityStage {
  if (status === 'IGNORE' || status === 'GENERIC' || status === 'GROUP') return 'MENTION';
  if (status === 'UNRESOLVED') return 'CANDIDATE';
  if (status === 'RESOLVED') return 'RESOLVED';
  return 'MENTION';
}

/**
 * Decide lifecycle stage from mention classification + aggregate signals.
 */
export function decideIdentityLifecycle(input: {
  name: string;
  mention?: ClassifiedMention;
  signals: IdentityScoreSignals;
}): IdentityLifecycleDecision {
  const mention =
    input.mention ??
    classifyMention({
      text: input.name,
      kind: 'character',
    });

  const reasons: string[] = [];
  const namedExplicitly =
    input.signals.namedExplicitly ??
    (mention.status === 'RESOLVED' && mention.actorType === 'PERSON');

  const score = scoreIdentity({
    ...input.signals,
    namedExplicitly,
    baseConfidence: input.signals.baseConfidence ?? mention.confidence,
  });

  // Hard floor from mention class — generics never become characters.
  if (mention.status === 'IGNORE' || mention.status === 'GENERIC') {
    reasons.push(`Mention status ${mention.status} — remain ephemeral`);
    return {
      stage: 'MENTION',
      identityConfidence: Math.min(15, score.total),
      score,
      mayPromoteToCharacter: false,
      shouldArchive: true,
      reasons,
      promotionLog: formatPromotionLog(input.name, 'MENTION', Math.min(15, score.total), reasons),
    };
  }

  if (mention.status === 'GROUP') {
    reasons.push('Group mention — not a person identity');
    return {
      stage: 'MENTION',
      identityConfidence: Math.min(20, score.total),
      score,
      mayPromoteToCharacter: false,
      shouldArchive: false,
      reasons,
      promotionLog: formatPromotionLog(input.name, 'MENTION', Math.min(20, score.total), reasons),
    };
  }

  const mentions = input.signals.mentionCount ?? 0;
  const conversations = input.signals.conversationCount ?? 0;
  const timeSpanDays = input.signals.timeSpanDays ?? 0;

  // Never promote to Character on a single mention unless the user confirmed.
  const singleMentionBlock = mentions < 2 && !input.signals.userConfirmed;

  let stage: IdentityStage = mentionStatusToFloor(mention.status);

  if (
    score.total >= IDENTITY_THRESHOLDS.core &&
    conversations >= 4 &&
    timeSpanDays >= 30 &&
    !singleMentionBlock
  ) {
    stage = 'CORE_CHARACTER';
    reasons.push('High score across conversations and time span');
  } else if (score.total >= IDENTITY_THRESHOLDS.character && !singleMentionBlock) {
    if (namedExplicitly || mention.status === 'RESOLVED') {
      stage = 'CHARACTER';
      reasons.push('Named identity with recurring evidence');
    } else if (mentions >= 3 && conversations >= 2) {
      stage = 'CHARACTER';
      reasons.push('Recurring unresolved identity crossed character threshold');
    } else {
      stage = mention.status === 'RESOLVED' ? 'RESOLVED' : 'CANDIDATE';
      reasons.push('Score high but identity not yet stable enough for Character card');
    }
  } else if (score.total >= IDENTITY_THRESHOLDS.resolved || mention.status === 'RESOLVED') {
    stage = mention.status === 'RESOLVED' ? 'RESOLVED' : 'CANDIDATE';
    if (mention.status === 'RESOLVED') {
      reasons.push(
        singleMentionBlock
          ? 'Named once — resolved identity, awaiting recurrence for Character'
          : 'Explicitly named / resolved mention',
      );
    } else {
      reasons.push('Candidate identity — awaiting recurrence or name');
    }
  } else if (score.total >= IDENTITY_THRESHOLDS.candidate || mention.status === 'UNRESOLVED') {
    stage = 'CANDIDATE';
    reasons.push('Meaningful but unresolved — preserve as candidate');
  } else {
    stage = 'MENTION';
    reasons.push('Below candidate threshold — ephemeral mention');
  }

  // User confirmation is an explicit Character Book write.
  if (input.signals.userConfirmed) {
    stage = 'CHARACTER';
    reasons.push('User confirmed identity');
  }

  // Single-mention hard stop for Character+ (user confirmation exempt)
  if (singleMentionBlock && (stage === 'CHARACTER' || stage === 'CORE_CHARACTER')) {
    stage = mention.status === 'RESOLVED' || namedExplicitly ? 'RESOLVED' : 'CANDIDATE';
    reasons.push('Blocked Character promotion — only one mention so far');
  }

  const mayPromoteToCharacter =
    (input.signals.userConfirmed || stage === 'CHARACTER' || stage === 'CORE_CHARACTER') &&
    mention.status !== 'GENERIC' &&
    mention.status !== 'IGNORE' &&
    mention.status !== 'GROUP';

  const idle = input.signals.daysSinceLastSeen ?? 0;
  const shouldArchive =
    (stage === 'MENTION' || stage === 'CANDIDATE') &&
    idle >= IDENTITY_THRESHOLDS.archiveIdleDays &&
    mentions < 3;

  if (shouldArchive) {
    reasons.push(`Idle ${idle}d with weak recurrence — archive candidate`);
  }

  const identityConfidence = clamp(
    stage === 'MENTION'
      ? Math.min(20, score.total)
      : stage === 'CANDIDATE'
        ? clamp(score.total, 25, 65)
        : stage === 'RESOLVED'
          ? clamp(score.total, 45, 90)
          : stage === 'CHARACTER'
            ? clamp(score.total, 55, 96)
            : clamp(score.total, 80, 99),
    0,
    99,
  );

  return {
    stage,
    identityConfidence,
    score,
    mayPromoteToCharacter,
    shouldArchive,
    reasons,
    promotionLog: formatPromotionLog(input.name, stage, identityConfidence, reasons),
  };
}

export function formatPromotionLog(
  name: string,
  stage: IdentityStage,
  confidence: number,
  reasons: string[],
): string {
  const lines = [
    `Stage: ${stage}`,
    `Name: ${name}`,
    `Identity confidence: ${Math.round(confidence)}`,
    ...reasons.map((r) => `Reason: ${r}`),
  ];
  return lines.join('\n');
}

/**
 * Gate for Character Book insert paths.
 * Requires lifecycle mayPromote + mention not generic.
 */
export function mayCreateCharacterFromLifecycle(input: {
  name: string;
  mentionCount: number;
  conversationCount?: number;
  timeSpanDays?: number;
  daysSinceLastSeen?: number;
  userConfirmed?: boolean;
  emotionalWeight?: number;
  relationshipStrength?: number;
  narrativeImportance?: number;
}): { allow: boolean; decision: IdentityLifecycleDecision } {
  const mention = classifyMention({ text: input.name, kind: 'character' });
  const decision = decideIdentityLifecycle({
    name: input.name,
    mention,
    signals: {
      mentionCount: input.mentionCount,
      conversationCount: input.conversationCount ?? Math.min(input.mentionCount, 2),
      timeSpanDays: input.timeSpanDays ?? 0,
      daysSinceLastSeen: input.daysSinceLastSeen,
      userConfirmed: input.userConfirmed,
      namedExplicitly: mention.status === 'RESOLVED',
      baseConfidence: mention.confidence,
      emotionalWeight: input.emotionalWeight,
      relationshipStrength: input.relationshipStrength,
      narrativeImportance: input.narrativeImportance,
    },
  });

  return { allow: decision.mayPromoteToCharacter, decision };
}
