export type LifeLogEligibilityReason =
  | 'personal_event'
  | 'state_transition'
  | 'project_milestone'
  | 'relationship_event'
  | 'visit'
  | 'attended_event'
  | 'intentional_nonattendance'
  | 'rejected_greeting'
  | 'rejected_command'
  | 'rejected_question'
  | 'rejected_static_fact'
  | 'rejected_world_fact'
  | 'rejected_audit_record'
  | 'rejected_low_information'
  | 'rejected_failed_extraction';

export type LifeLogEligibilityDecision = {
  eligible: boolean;
  reason: LifeLogEligibilityReason;
  confidence: number;
  autobiographicalText: string;
};

const COMMAND_PREFIX = /^(?:please\s+)?(?:remember(?:\s+that)?|recap|summari[sz]e|tell me|show me|list|generate|fix|update|delete|forget|do you remember|what do you know|can you remember)\b[,:]?\s*/i;
const PURE_COMMAND = /^(?:please\s+)?(?:recap|summari[sz]e|do you remember|what do you know|remember this|test(?:ing)?(?:\s+the)?\s+(?:chat|app|response|improvements?)|fix (?:this|the)|generate (?:a )?title)\b/i;
const GREETING = /^(?:hi|hey|hello|yo|good (?:morning|afternoon|evening))\b[!,.\s]*(?:i(?:'?m| am)\s+[\p{L}'-]+(?:\s+[\p{L}'-]+){0,3})?[!,.\s]*$/iu;
const AUDIT = /\b(?:reclassified|reclassification|migrated|merged record|cleanup|debug record)\b/i;
const FAILED_TITLE = /^(?:captured conversation|untitled event|conversation|chat|memory|event|moment)$/i;
const WORLD_FACT = /^(?:the\s+)?(?:world cup|weather|news|stock market|election|game|show)\b.*\b(?:is|are|was|were|starts?|happens?|going on)\b/i;
const PERSONAL_ACTION = /\b(?:i|we)\s+(?:(?:briefly|recently|finally|just)\s+)?(?:went|visited|saw|attended|worked|built|created|designed|developed|fixed|finished|completed|started|began|ended|left|joined|quit|moved|traveled|arrived|stayed|met|dated|broke up|hooked up|slept with|had sex|kissed|argued|fought|listened|played|performed|celebrated|skipped|missed|did not attend|didn't attend|decided not to go)\b/i;
const CURRENT_VISIT = /\b(?:i(?:'m| am)|we(?:'re| are))\s+(?:here\s+)?at\s+[^.!?]+(?:house|home|place|venue|club|school|work)\b/i;
const STATE_CHANGE = /\b(?:i|we)\s+(?:became|started|stopped|quit|joined|moved|graduated|got hired|was hired|ended|left)\b/i;
const RELATIONSHIP = /\b(?:dated|broke up|got together|separated|married|engaged|reconnected|fell out|blocked me|unblocked me)\b/i;
const CURRENT_ONBOARDING = /\b(?:i(?:'m| am)|we(?:'re| are))\s+(?:currently\s+)?(?:onboarding|in onboarding|training for (?:a|the|my) (?:job|role))\b/i;
const INTERPERSONAL_CONFLICT = /\b(?:situation|conflict|argument|fight|falling out)\s+with\b/i;
const PROJECT = /\b(?:worked|built|created|designed|developed|fixed|finished|completed|implemented|launched|released|improved|updated)\b[^.!?]{0,100}\b(?:lore\s*book|app|project|ui|feature|flow|release|build)\b/i;

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Removes a memory command while retaining its autobiographical payload. */
export function autobiographicalClause(input: string): string {
  const text = compact(input);
  if (!COMMAND_PREFIX.test(text)) return text;
  const stripped = compact(text.replace(COMMAND_PREFIX, ''));
  return /\b(?:i|we)\b/i.test(stripped) ? stripped : '';
}

export function evaluateLifeLogEligibility(input: {
  text: string;
  title?: string | null;
  type?: string | null;
  metadata?: Record<string, unknown> | null;
}): LifeLogEligibilityDecision {
  const raw = compact(input.text);
  const title = compact(input.title ?? '');
  const metadata = input.metadata ?? {};
  const text = autobiographicalClause(raw);

  if (AUDIT.test(`${input.type ?? ''} ${title} ${raw}`) || metadata.audit_only) {
    return { eligible: false, reason: 'rejected_audit_record', confidence: 0.99, autobiographicalText: '' };
  }
  if (FAILED_TITLE.test(title) || metadata.extraction_failed === true) {
    return { eligible: false, reason: 'rejected_failed_extraction', confidence: 0.99, autobiographicalText: text };
  }
  const structuredType = (input.type ?? '').toLowerCase();
  if (/^(?:career_event|job_start|job_transition|onboarding|employment_event)$/.test(structuredType)) {
    return { eligible: true, reason: 'state_transition', confidence: 0.9, autobiographicalText: text || title };
  }
  if (/^(?:relationship_event|relationship_transition)$/.test(structuredType)) {
    return { eligible: true, reason: 'relationship_event', confidence: 0.88, autobiographicalText: text || title };
  }
  if (/^(?:visit|attended_event|project_milestone|personal_event)$/.test(structuredType)) {
    return { eligible: true, reason: structuredType as LifeLogEligibilityReason, confidence: 0.86, autobiographicalText: text || title };
  }
  if (GREETING.test(raw)) return { eligible: false, reason: 'rejected_greeting', confidence: 0.99, autobiographicalText: '' };
  if (/\?\s*$/.test(raw) && !PERSONAL_ACTION.test(text)) {
    return { eligible: false, reason: 'rejected_question', confidence: 0.95, autobiographicalText: '' };
  }
  if (PURE_COMMAND.test(raw) && !PERSONAL_ACTION.test(text)) return { eligible: false, reason: 'rejected_command', confidence: 0.98, autobiographicalText: '' };
  if (/\btest(?:ing|ed)?\b.*\b(?:chat|response|improvements?|app)\b/i.test(raw) && !PROJECT.test(text)) {
    return { eligible: false, reason: 'rejected_command', confidence: 0.96, autobiographicalText: '' };
  }
  if (WORLD_FACT.test(text) && !PERSONAL_ACTION.test(text)) {
    return { eligible: false, reason: 'rejected_world_fact', confidence: 0.95, autobiographicalText: '' };
  }
  if (CURRENT_ONBOARDING.test(text)) return { eligible: true, reason: 'state_transition', confidence: 0.88, autobiographicalText: text };
  if (/^(?:i am|i'm|i code|i work as|my name is)\b/i.test(text) && !PERSONAL_ACTION.test(text)) {
    return { eligible: false, reason: 'rejected_static_fact', confidence: 0.93, autobiographicalText: '' };
  }
  if (text.length < 12) return { eligible: false, reason: 'rejected_low_information', confidence: 0.9, autobiographicalText: '' };

  if (/\b(?:my|i)\b[^.!?]{0,100}\b(?:api )?tokens?\b/i.test(text) && /\b(?:spam(?:med)?|used|usage|ran out|missing|charged)\b/i.test(text)) {
    return { eligible: true, reason: 'personal_event', confidence: 0.84, autobiographicalText: text };
  }
  if (/\b(?:did not attend|didn't attend|decided not to go|skipped|missed|instead of (?:attending|going to))\b/i.test(text)) {
    return { eligible: true, reason: 'intentional_nonattendance', confidence: 0.9, autobiographicalText: text };
  }
  if (PROJECT.test(text)) return { eligible: true, reason: 'project_milestone', confidence: 0.9, autobiographicalText: text };
  if (RELATIONSHIP.test(text)) return { eligible: true, reason: 'relationship_event', confidence: 0.88, autobiographicalText: text };
  if (INTERPERSONAL_CONFLICT.test(text)) return { eligible: true, reason: 'relationship_event', confidence: 0.85, autobiographicalText: text };
  if (STATE_CHANGE.test(text)) return { eligible: true, reason: 'state_transition', confidence: 0.88, autobiographicalText: text };
  if (/\b(?:visited|went to|at)\b[^.!?]{0,100}\b(?:house|home|place)\b/i.test(text) || CURRENT_VISIT.test(text)) {
    return { eligible: true, reason: 'visit', confidence: 0.87, autobiographicalText: text };
  }
  if (/\b(?:saw|attended|went to)\b[^.!?]{0,100}\b(?:show|concert|party|festival|club|anniversary)\b/i.test(text)) {
    return { eligible: true, reason: 'attended_event', confidence: 0.88, autobiographicalText: text };
  }
  if (PERSONAL_ACTION.test(text)) return { eligible: true, reason: 'personal_event', confidence: 0.82, autobiographicalText: text };
  return { eligible: false, reason: 'rejected_static_fact', confidence: 0.78, autobiographicalText: '' };
}

export function isPublishableLifeLogTitle(title: string | null | undefined): boolean {
  const value = compact(title ?? '');
  if (!value || FAILED_TITLE.test(value)) return false;
  if (/^(?:i|we|hi|hey|damn|wtf|so|well)\b/i.test(value)) return false;
  const words = value.split(/\s+/);
  return words.length >= 2 && words.length <= 12 && !/\b(?:and|or|but|because|so|then|the|a|an)$/i.test(value);
}
