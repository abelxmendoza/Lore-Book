import type { EntityType, SpanAlternative } from './lexicalIntelligenceTypes';

/** Canonical entity taxonomy — maps preview/lexical types to intelligence types. */
export const ENTITY_TAXONOMY: EntityType[] = [
  'PERSON',
  'PLACE',
  'ORGANIZATION',
  'GROUP',
  'COMMUNITY',
  'EVENT',
  'TIME_PERIOD',
  'DATE',
  'ROLE',
  'SKILL',
  'TASK',
  'RELATIONSHIP',
  'EMOTION',
  'PREFERENCE',
  'OBJECT',
  'MEDIA',
  'LANGUAGE',
  'SUBJECT',
  'ACTIVITY',
  'WORKSITE',
  'DEPLOYMENT_SITE',
  'SCHOOL',
  'SCHOOL_CLUB',
  'SCHOOL_TEAM',
  'FRIEND_GROUP',
  'MUSIC_GENRE',
  'VENUE',
  'TRAVEL_DESTINATION',
  'WEATHER_CONTEXT',
  'EMOTIONAL_SIGNIFICANCE',
  'INTEREST',
  'WORK_ACTIVITY',
  'WORK_CONTEXT',
  'CONFLICT',
  'TITLE_REFERENCE',
  'ROLE_REFERENCE',
  'FAMILY_REFERENCE',
  'UNRESOLVED_PERSON_REFERENCE',
  'UNKNOWN',
];

const GROUP_SUBTYPES: Record<string, EntityType> = {
  SCHOOL_CLUB: 'SCHOOL_CLUB',
  SCHOOL_TEAM: 'SCHOOL_TEAM',
  SOCIAL_GROUP: 'FRIEND_GROUP',
  SCHOOL_CLASS: 'GROUP',
};

const INTEREST_SUBTYPES: Record<string, EntityType> = {
  MUSIC_GENRE: 'MUSIC_GENRE',
};

export function normalizeEntityType(type: string, subtype?: string): EntityType {
  const upper = type.toUpperCase() as EntityType;
  if (upper === 'GROUP' && subtype) {
    return GROUP_SUBTYPES[subtype] ?? 'GROUP';
  }
  if (upper === 'INTEREST' && subtype) {
    return INTEREST_SUBTYPES[subtype] ?? 'INTEREST';
  }
  if (upper === 'OBJECT' && subtype === 'PREFERENCE') {
    return 'PREFERENCE';
  }
  if (ENTITY_TAXONOMY.includes(upper)) return upper;
  return 'UNKNOWN';
}

export function colorKeyForType(type: EntityType, subtype?: string): string {
  switch (type) {
    case 'PERSON': return 'person';
    case 'PLACE':
    case 'TRAVEL_DESTINATION':
    case 'WORKSITE': return 'place';
    case 'ORGANIZATION': return 'organization';
    case 'GROUP':
    case 'SCHOOL_CLUB':
    case 'SCHOOL_TEAM':
    case 'FRIEND_GROUP':
    case 'COMMUNITY': return 'group';
    case 'SKILL': return 'skill';
    case 'LANGUAGE': return 'language';
    case 'ROLE': return 'role';
    case 'TASK': return 'task';
    case 'WORK_ACTIVITY':
    case 'ACTIVITY': return 'work_activity';
    case 'DEPLOYMENT_SITE': return 'worksite';
    case 'EVENT':
    case 'VENUE': return 'event';
    case 'TIME_PERIOD':
    case 'DATE': return 'time';
    case 'RELATIONSHIP': return 'relationship';
    case 'PREFERENCE': return 'preference';
    case 'EMOTION':
    case 'EMOTIONAL_SIGNIFICANCE': return 'emotional_significance';
    case 'CONFLICT': return 'event';
    case 'TITLE_REFERENCE':
    case 'ROLE_REFERENCE':
    case 'FAMILY_REFERENCE':
    case 'UNRESOLVED_PERSON_REFERENCE': return 'person_reference';
    case 'WORK_CONTEXT': return 'organization';
    case 'MUSIC_GENRE':
    case 'INTEREST': return 'interest';
    case 'WEATHER_CONTEXT': return 'weather';
    case 'OBJECT': return subtype === 'PREFERENCE' ? 'preference' : 'uncertain';
    default: return 'uncertain';
  }
}

/** Plausible alternative types when context is ambiguous. */
export function defaultAlternatives(
  type: EntityType,
  subtype?: string,
  contextCues: string[] = []
): SpanAlternative[] {
  const cues = contextCues.join(' ').toLowerCase();
  const alts: SpanAlternative[] = [];

  if (type === 'GROUP' && subtype === 'SOCIAL_GROUP') {
    alts.push(
      { type: 'FRIEND_GROUP', subtype: 'SOCIAL_GROUP', confidence: 0.89, reason: 'friends-from-team phrasing' },
      { type: 'GROUP', subtype: 'SOCIAL_GROUP', confidence: 0.62, reason: 'generic group' }
    );
  }

  if (type === 'GROUP' && /club.*school|school.*club/i.test(cues)) {
    alts.push(
      { type: 'SCHOOL_CLUB', confidence: 0.89, reason: 'club at school context' },
      { type: 'GROUP', confidence: 0.55, reason: 'generic group without school cue' }
    );
  }

  if (type === 'PLACE' && /went to|travel|trip/i.test(cues)) {
    alts.push(
      { type: 'TRAVEL_DESTINATION', confidence: 0.88, reason: 'travel verb nearby' },
      { type: 'PLACE', confidence: 0.72, reason: 'bare place name' }
    );
  }

  if (type === 'EVENT' && subtype === 'EVENT_OR_VENUE') {
    alts.push(
      { type: 'VENUE', confidence: 0.58, reason: 'could be venue not event' },
      { type: 'EVENT', subtype: 'EVENT_OR_VENUE', confidence: 0.55, reason: 'could be one-off event' }
    );
  }

  if (type === 'ORGANIZATION' && /worked at|employer/i.test(cues)) {
    alts.push(
      { type: 'ORGANIZATION', subtype: 'EMPLOYER', confidence: 0.91, reason: 'employment cue' },
      { type: 'DEPLOYMENT_SITE', confidence: 0.35, reason: 'without deployment cue' }
    );
  }

  if (type === 'DEPLOYMENT_SITE') {
    alts.push(
      { type: 'ORGANIZATION', subtype: 'EMPLOYER', confidence: 0.42, reason: 'could be employer not site' },
      { type: 'WORKSITE', confidence: 0.86, reason: 'field deployment context' }
    );
  }

  if (type === 'ACTIVITY' && /fix|repair|garden/i.test(cues)) {
    alts.push(
      { type: 'SKILL', confidence: 0.68, reason: 'repeated activity may be skill' },
      { type: 'ACTIVITY', confidence: 0.82, reason: 'one-off activity mention' }
    );
  }

  return alts.filter((a) => a.type !== type || a.subtype !== subtype);
}

export function isParentSubgroupRelation(
  parent: { type: EntityType; text: string },
  child: { type: EntityType; text: string }
): boolean {
  const childLower = child.text.toLowerCase();
  const parentLower = parent.text.toLowerCase();

  if (
    parent.type === 'SCHOOL_TEAM' &&
    child.type === 'FRIEND_GROUP' &&
    childLower.includes('friends') &&
    childLower.includes(parentLower.replace(/\s+team$/i, ''))
  ) {
    return true;
  }

  if (
    parent.type === 'FRIEND_GROUP' &&
    child.type === 'SCHOOL_TEAM' &&
    parentLower.includes(childLower)
  ) {
    return true;
  }

  if (
    (parent.type === 'SCHOOL_TEAM' || parent.type === 'SCHOOL_CLUB') &&
    child.type === 'FRIEND_GROUP'
  ) {
    return true;
  }

  if (
    parent.type === 'EVENT' &&
    parent.subtype === 'TRAVEL_EVENT' &&
    (child.type === 'PLACE' || child.type === 'TRAVEL_DESTINATION') &&
    parentLower.includes(childLower)
  ) {
    return true;
  }

  if (parent.type === 'PLACE' && child.type === 'TRAVEL_DESTINATION' && parent.text === child.text) {
    return true;
  }

  if (
    (parent.type === 'PLACE' || parent.type === 'TRAVEL_DESTINATION') &&
    child.type === 'EVENT' &&
    child.subtype === 'TRAVEL_EVENT' &&
    child.text.toLowerCase().includes(parent.text.toLowerCase())
  ) {
    return true;
  }

  return false;
}
