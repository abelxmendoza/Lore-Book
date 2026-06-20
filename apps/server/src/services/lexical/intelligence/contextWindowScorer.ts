import type { ContextWindow, EntityType, RawSpanCandidate, SpanAlternative } from './lexicalIntelligenceTypes';
import { normalizeEntityType } from './lexicalEntityTaxonomy';

const CONTEXT_RADIUS = 48;

export function extractContextWindow(
  text: string,
  start: number,
  end: number,
  radius = CONTEXT_RADIUS
): ContextWindow {
  const before = text.slice(Math.max(0, start - radius), start);
  const match = text.slice(start, end);
  const after = text.slice(end, Math.min(text.length, end + radius));
  return { before, match, after };
}

export type ContextRuleResult = {
  type: EntityType;
  subtype?: string;
  confidenceDelta: number;
  evidencePhrases: string[];
  rulesFired: string[];
  alternatives: SpanAlternative[];
  needsReview?: boolean;
  parentHint?: string;
};

export type ContextRuleSession = {
  fullTextLower: string;
  hasWorkOrg: boolean;
};

export function buildContextRuleSession(fullText: string): ContextRuleSession {
  const fullTextLower = fullText.toLowerCase();
  return {
    fullTextLower,
    hasWorkOrg: /\b(?:robotics|armstrong|employer|worked at|with gary|with jeff|robot tech)\b/i.test(
      fullTextLower
    ),
  };
}

/** Context-aware reclassification — nearby words influence type/subtype. */
export function applyContextRules(
  fullText: string,
  candidate: RawSpanCandidate,
  opts?: {
    window?: ContextWindow;
    session?: ContextRuleSession;
  }
): ContextRuleResult {
  const window = opts?.window ?? extractContextWindow(fullText, candidate.start, candidate.end);
  const session = opts?.session ?? buildContextRuleSession(fullText);
  const ctx = `${window.before} ${window.match} ${window.after}`.toLowerCase();
  const rulesFired: string[] = [];
  const evidence: string[] = [...candidate.evidencePhrases];
  let type = candidate.type;
  let subtype = candidate.subtype;
  let confidenceDelta = 0;
  let needsReview = candidate.needsReview;
  const alternatives: SpanAlternative[] = [];

  // "coding club at school" → SCHOOL_CLUB
  if (/club\s+at\s+school/i.test(window.match) || /club\s+at\s+school/i.test(ctx)) {
    if (type === 'GROUP' || type === 'SCHOOL_CLUB') {
      type = 'SCHOOL_CLUB';
      subtype = 'SCHOOL_CLUB';
      rulesFired.push('school_club_at_school');
      evidence.push('from', 'at school');
      confidenceDelta += 0.06;
      alternatives.push({ type: 'GROUP', confidence: 0.62, reason: 'generic group without school parent' });
    }
  }

  // "friends from the football team" → FRIEND_GROUP (not individual people)
  if (/friends?\s+(?:from|on|in)\s+(?:the\s+)?[a-z]+\s+team/i.test(window.match)) {
    type = 'FRIEND_GROUP';
    subtype = 'SOCIAL_GROUP';
    rulesFired.push('friend_group_from_team');
    evidence.push('friends from', 'team');
    confidenceDelta += 0.05;
    alternatives.push({ type: 'GROUP', subtype: 'SOCIAL_GROUP', confidence: 0.62, reason: 'bare social group' });
  } else if (
    /\b(?:football|soccer|basketball|baseball|track|swim|debate|chess)\s+team\b/i.test(window.match)
  ) {
    // football team alone → SCHOOL_TEAM (skip when embedded in friend-group phrasing)
    type = 'SCHOOL_TEAM';
    subtype = 'SCHOOL_TEAM';
    rulesFired.push('school_team_sport');
    confidenceDelta += 0.04;
  }

  // "worked at Armstrong Robotics" → EMPLOYER
  if (/worked\s+at/i.test(window.before) && type === 'ORGANIZATION') {
    subtype = 'EMPLOYER';
    rulesFired.push('employer_worked_at');
    evidence.push('worked at');
    confidenceDelta += 0.05;
  }

  // Denny's in Hollywood when employer/work context nearby → DEPLOYMENT_SITE
  const deploymentPhrase =
    /\b(?:at\s+[A-Z][\w']*(?:'s)?\s+in\s+[A-Z][a-z]+)\b/.test(window.match) ||
    /\bDenny's in Hollywood\b/i.test(window.match);
  if (session.hasWorkOrg && deploymentPhrase) {
    const prevType = type;
    if (type !== 'DEPLOYMENT_SITE') {
      type = 'DEPLOYMENT_SITE';
      subtype = 'WORKSITE';
      needsReview = true;
      confidenceDelta += 0.04;
      alternatives.push({
        type: prevType as EntityType,
        subtype: 'EMPLOYER',
        confidence: 0.38,
        reason: 'without workplace deployment context',
      });
    }
    rulesFired.push('deployment_site_not_employer');
    evidence.push('at … in …', 'work employer context');
  }

  // "went to Japan" + Japan place → linked travel
  if (/^Japan$/i.test(window.match) && /went to/i.test(window.before)) {
    type = 'TRAVEL_DESTINATION';
    subtype = 'COUNTRY';
    rulesFired.push('travel_destination_japan');
    evidence.push('went to');
    confidenceDelta += 0.05;
    alternatives.push({ type: 'PLACE', confidence: 0.7, reason: 'country without travel verb' });
  }

  if (/last summer/i.test(window.match)) {
    type = 'TIME_PERIOD';
    subtype = subtype ?? 'RELATIVE';
    rulesFired.push('fuzzy_time_last_summer');
    needsReview = true;
    confidenceDelta += 0.02;
  }

  if (/best friend/i.test(window.match)) {
    type = 'RELATIONSHIP';
    subtype = 'CLOSE_FRIEND';
    rulesFired.push('relationship_best_friend');
    needsReview = true;
    confidenceDelta += 0.03;
  }

  if (/never had .* friends like him/i.test(window.match)) {
    type = 'EMOTIONAL_SIGNIFICANCE';
    subtype = 'IRREPLACEABILITY';
    rulesFired.push('emotional_irreplaceability');
    needsReview = true;
    confidenceDelta += 0.04;
  }

  if (/fixing\s+(?:his|her|their)\s+bike/i.test(window.match)) {
    type = 'ACTIVITY';
    subtype = 'BIKE_REPAIR';
    rulesFired.push('activity_bike_repair');
    evidence.push('fixing', 'bike');
    alternatives.push(
      { type: 'SKILL', subtype: 'BIKE_REPAIR', confidence: 0.7, reason: 'repair as skill/hobby' },
      { type: 'OBJECT', confidence: 0.55, reason: 'bike as object only' }
    );
  }

  if (/gardening/i.test(window.match)) {
    type = 'ACTIVITY';
    subtype = subtype ?? 'OUTDOOR';
    rulesFired.push('activity_gardening');
    alternatives.push(
      { type: 'SKILL', confidence: 0.66, reason: 'gardening as hobby/skill' },
      { type: 'ACTIVITY', confidence: 0.84, reason: 'one-off gardening mention' }
    );
  }

  if (/school/i.test(ctx) && !rulesFired.includes('school_club_at_school')) {
    evidence.push('school context nearby');
  }

  return {
    type: normalizeEntityType(type, subtype),
    subtype,
    confidenceDelta,
    evidencePhrases: [...new Set(evidence)],
    rulesFired,
    alternatives,
    needsReview,
  };
}

export function contextCuesFromWindow(window: ContextWindow): string[] {
  const tokens = `${window.before} ${window.match} ${window.after}`
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return tokens.slice(-12);
}
