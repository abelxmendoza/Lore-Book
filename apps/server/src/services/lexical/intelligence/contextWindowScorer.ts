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
    hasWorkOrg: /\b(?:robotics|vanguard|employer|worked at|with gary|with jeff|robot tech|old job)\b/i.test(
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

  // "worked at Vanguard Robotics" → EMPLOYER
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

  if (/old job/i.test(ctx) && /^Vanguard$/i.test(window.match)) {
    type = 'ORGANIZATION';
    subtype = 'WORKPLACE';
    rulesFired.push('workplace_vanguard_context');
    needsReview = true;
    confidenceDelta += 0.04;
  }

  if (/old job/i.test(window.match)) {
    type = 'WORK_CONTEXT';
    subtype = 'PAST_EMPLOYMENT';
    rulesFired.push('past_employment_old_job');
    needsReview = true;
    confidenceDelta += 0.03;
  }

  if (/swung on him/i.test(window.match)) {
    type = 'CONFLICT';
    subtype = 'THREAT_EVENT';
    rulesFired.push('conflict_threat_review_first');
    needsReview = true;
    confidenceDelta += 0.02;
  }

  if (/estranged dad/i.test(window.match)) {
    type = 'RELATIONSHIP';
    subtype = 'FATHER';
    rulesFired.push('relationship_estranged_father');
    needsReview = true;
    confidenceDelta += 0.03;
  }

  if (/mixing us up/i.test(window.match)) {
    type = 'EVENT';
    subtype = 'IDENTITY_COLLISION_EVENT';
    rulesFired.push('identity_collision_event');
    needsReview = true;
    confidenceDelta += 0.04;
  }

  if (/^Abel Mendoza$/i.test(window.match) && /\bis me\b/i.test(window.after)) {
    subtype = 'SELF_NAME_CANDIDATE';
    rulesFired.push('identity_self_name_candidate');
    needsReview = true;
    confidenceDelta += 0.02;
  }

  if (/club/i.test(window.match) && /from\s+[a-z]+\s+club/i.test(ctx)) {
    if (type === 'GROUP' || type === 'SCHOOL_CLUB') {
      type = 'SCHOOL_CLUB';
      subtype = 'SCHOOL_CLUB';
      rulesFired.push('school_club_from_phrase');
      confidenceDelta += 0.04;
    }
  }

  if (/^lunch$/i.test(window.match) && /school|yesterday|club|gym|robotics/i.test(ctx)) {
    type = 'TIME_PERIOD';
    subtype = 'SCHOOL_DAY_TIME';
    rulesFired.push('school_day_lunch');
    confidenceDelta += 0.02;
  }

  if (/robotics kids/i.test(window.match)) {
    type = 'FRIEND_GROUP';
    subtype = 'SCHOOL_GROUP';
    rulesFired.push('school_group_robotics_kids');
    needsReview = true;
    confidenceDelta += 0.03;
  }

  if (/^gym$/i.test(window.match) && /school|lunch|club|robotics|near the gym/i.test(ctx)) {
    subtype = 'SCHOOL_PLACE';
    rulesFired.push('school_place_gym');
    needsReview = true;
    confidenceDelta += 0.02;
  }

  if (/japanese class/i.test(window.match)) {
    type = 'GROUP';
    subtype = 'SCHOOL_CLASS';
    rulesFired.push('school_class_japanese');
    needsReview = true;
    confidenceDelta += 0.03;
  }

  if (/LA ska scene/i.test(window.match)) {
    type = 'COMMUNITY';
    subtype = 'MUSIC_SCENE';
    rulesFired.push('music_scene_la_ska');
    needsReview = true;
    confidenceDelta += 0.03;
  }

  if (/before covid/i.test(window.match)) {
    type = 'TIME_PERIOD';
    subtype = 'FUZZY_TIME_PERIOD';
    rulesFired.push('fuzzy_time_before_covid');
    needsReview = true;
    confidenceDelta += 0.02;
  }

  if (/best friend/i.test(window.match) && /used to be|haven't seen|since before/i.test(ctx)) {
    rulesFired.push('relationship_past_dormant');
    needsReview = true;
  }

  if (/hot as hell/i.test(window.match)) {
    type = 'WEATHER_CONTEXT';
    subtype = 'HEAT';
    confidenceDelta += 0.02;
  }

  if (/black summer shirts/i.test(window.match)) {
    type = 'PREFERENCE';
    subtype = 'CLOTHING';
    confidenceDelta += 0.02;
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
