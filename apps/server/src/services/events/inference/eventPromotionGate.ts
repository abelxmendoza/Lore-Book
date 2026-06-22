import type { EventCandidate, EventPromotionStatus } from './eventInferenceTypes';

const NAMED_EVENT_TYPES = new Set<EventCandidate['eventType']>([
  'graduation_party',
  'music_event',
  'show',
  'concert',
  'trip',
  'travel',
  'recurring_activity',
  'work_event',
  'interview',
]);

const HIGH_IMPACT_TYPES = new Set<EventCandidate['eventType']>([
  'conflict',
  'fight',
  'relationship_event',
  'milestone',
  'school_event',
]);

export function countAnchors(candidate: EventCandidate): number {
  let count = 0;
  if (candidate.titleParts?.honoree || candidate.titleParts?.actor) count++;
  if (candidate.titleParts?.place || candidate.context.place) count++;
  if (candidate.titleParts?.time || candidate.context.timeHint) count++;
  if (candidate.context.organization) count++;
  if (candidate.context.group) count++;
  if (candidate.context.people && candidate.context.people.length > 0) count++;
  if (candidate.context.emotionalWeight) count++;
  if (NAMED_EVENT_TYPES.has(candidate.eventType)) count++;
  return count;
}

export function evaluateEventPromotionStatus(
  candidate: EventCandidate,
  opts: {
    mentionCount?: number;
    userConfirmed?: boolean;
    anchorCount?: number;
  } = {},
): EventPromotionStatus {
  if (opts.userConfirmed) return 'confirmed_event';

  const mentionCount = opts.mentionCount ?? 1;
  const anchors = opts.anchorCount ?? countAnchors(candidate);

  if (candidate.sensitive && !opts.userConfirmed && mentionCount < 2) {
    return anchors >= 2 ? 'candidate' : 'mention_only';
  }

  if (NAMED_EVENT_TYPES.has(candidate.eventType) && anchors >= 1) {
    return mentionCount >= 2 ? 'suggested_event' : 'candidate';
  }

  if (HIGH_IMPACT_TYPES.has(candidate.eventType) && anchors >= 2) {
    return 'suggested_event';
  }

  if (candidate.eventType === 'recurring_activity') {
    return mentionCount >= 2 ? 'suggested_event' : 'candidate';
  }

  if (anchors >= 3) return 'suggested_event';
  if (anchors >= 2 && mentionCount >= 2) return 'candidate';
  if (anchors >= 1) return 'mention_only';
  return 'mention_only';
}

export function canPromoteToEventCard(
  candidate: EventCandidate,
  opts: { mentionCount?: number; userConfirmed?: boolean } = {},
): boolean {
  const status = evaluateEventPromotionStatus(candidate, opts);
  if (opts.userConfirmed) return true;
  if (candidate.sensitive && !opts.userConfirmed && (opts.mentionCount ?? 0) < 2) return false;
  return status === 'suggested_event' || status === 'confirmed_event';
}
