/**
 * Event significance — not every Moment deserves a permanent Event.
 *
 * Score dimensions (0–100 total). Below EVENT_SIGNIFICANCE_THRESHOLD → Moment only.
 */

export const EVENT_SIGNIFICANCE_THRESHOLD = 45;

export type SignificanceSignals = {
  text: string;
  /** Distinct conversation/thread count mentioning this. */
  conversationCount?: number;
  /** Prior related moments / recurrences. */
  recurrenceCount?: number;
  /** User used emphasis (caps, "important", "never forget"). */
  userEmphasis?: boolean;
};

export type SignificanceBreakdown = {
  novelty: number;
  impact: number;
  futureRelevance: number;
  relationshipImpact: number;
  careerImpact: number;
  emotionalSignificance: number;
  userEmphasis: number;
  conversationRecurrence: number;
  total: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function scoreText(text: string): Omit<
  SignificanceBreakdown,
  'userEmphasis' | 'conversationRecurrence' | 'total'
> {
  const t = text.toLowerCase();

  // Novelty: concrete firsts / transitions score higher than routine days.
  let novelty = 4;
  if (/\b(?:first|finally|never|for the first time|offer|hired|fired|blocked|broke up|graduated|moved)\b/.test(t)) {
    novelty = 14;
  } else if (/\b(?:started|began|ended|left|joined|interview|onboarding)\b/.test(t)) {
    novelty = 10;
  } else if (/\b(?:went to|visited|met|attended|saw)\b/.test(t)) {
    novelty = 7;
  } else if (/\b(?:worked on|built|stayed home|went to the gym|back from gym|ran|jogged)\b/.test(t)) {
    novelty = 3;
  }

  let impact = 4;
  if (/\b(?:blocked|broke up|hired|fired|offer|surgery|accident|died|death|wedding|engaged)\b/.test(t)) {
    impact = 16;
  } else if (/\b(?:onboarding|interview|moved|quit|graduated|conflict|falling out)\b/.test(t)) {
    impact = 12;
  } else if (/\b(?:finished|completed|launched|released)\b/.test(t)) {
    impact = 8;
  }

  let futureRelevance = 3;
  if (/\b(?:start date|background check|offer|job|role|relationship|lease|lease signed)\b/.test(t)) {
    futureRelevance = 12;
  } else if (/\b(?:interview|onboarding|moving|planning)\b/.test(t)) {
    futureRelevance = 8;
  }

  let relationshipImpact = 0;
  if (/\b(?:blocked|broke up|dated|hooked up|partner|girlfriend|boyfriend|wife|husband|ex)\b/.test(t)) {
    relationshipImpact = 14;
  } else if (/\b(?:friend|argued|fought|reconnected|met with)\b/.test(t)) {
    relationshipImpact = 8;
  }

  let careerImpact = 0;
  if (/\b(?:hired|fired|offer|onboarding|interview|quit|promotion|job|role|agency)\b/.test(t)) {
    careerImpact = 14;
  } else if (/\b(?:worked on|built|shipped|launched)\b[^.!?]{0,80}\b(?:app|project|product|memovault|lore\s*book)\b/.test(t)) {
    careerImpact = 6;
  }

  let emotionalSignificance = 2;
  if (/\b(?:heartbroken|devastated|depressed|cried|trauma|never forget|changed (?:my|our) life)\b/.test(t)) {
    emotionalSignificance = 12;
  } else if (/\b(?:hurt|lonely|anxious|excited|proud|relieved|miss(?:ed)?)\b/.test(t)) {
    emotionalSignificance = 6;
  }

  return {
    novelty,
    impact,
    futureRelevance,
    relationshipImpact,
    careerImpact,
    emotionalSignificance,
  };
}

export function scoreEventSignificance(signals: SignificanceSignals): SignificanceBreakdown {
  const base = scoreText(signals.text ?? '');
  const conversations = Math.max(0, signals.conversationCount ?? 1);
  const recurrence = Math.max(0, signals.recurrenceCount ?? 0);

  const userEmphasis = signals.userEmphasis
    ? 10
    : /\b(?:never forget|important|big deal|life.?changing)\b/i.test(signals.text)
      ? 8
      : 0;

  // Recurrence across conversations boosts durability.
  const conversationRecurrence = clamp(
    (conversations >= 3 ? 10 : conversations >= 2 ? 6 : 2) + Math.min(recurrence * 2, 6),
    0,
    14,
  );

  const total = clamp(
    base.novelty +
      base.impact +
      base.futureRelevance +
      base.relationshipImpact +
      base.careerImpact +
      base.emotionalSignificance +
      userEmphasis +
      conversationRecurrence,
    0,
    100,
  );

  return {
    ...base,
    userEmphasis,
    conversationRecurrence,
    total,
  };
}

export function mayPromoteMomentToEvent(signals: SignificanceSignals): {
  allow: boolean;
  score: SignificanceBreakdown;
} {
  const score = scoreEventSignificance(signals);
  return { allow: score.total >= EVENT_SIGNIFICANCE_THRESHOLD, score };
}
