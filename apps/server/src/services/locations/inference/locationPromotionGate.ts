import type { LocationCandidate, LocationPromotionStatus } from './locationInferenceTypes';

const NAMED_TYPES = new Set<LocationCandidate['locationType']>([
  'country',
  'state',
  'city',
  'neighborhood',
  'street',
  'store',
  'school',
  'university',
  'campus',
  'music_venue',
  'event_space',
  'restaurant',
  'bar',
  'deployment_site',
  'worksite',
]);

const REVIEW_FIRST_TYPES = new Set<LocationCandidate['locationType']>([
  'private_residence',
  'family_home',
]);

export function evaluateLocationPromotionStatus(
  candidate: LocationCandidate,
  opts: {
    mentionCount?: number;
    userConfirmed?: boolean;
    knownFromHistory?: boolean;
  } = {},
): LocationPromotionStatus {
  if (opts.userConfirmed) return 'confirmed_location';
  if (candidate.locationType === 'relative_location') return 'mention_only';

  const mentionCount = opts.mentionCount ?? 1;

  if (REVIEW_FIRST_TYPES.has(candidate.locationType)) {
    return mentionCount >= 2 || opts.knownFromHistory ? 'suggested_location' : 'candidate';
  }

  if (NAMED_TYPES.has(candidate.locationType) && candidate.confidence >= 0.8) {
    if (mentionCount >= 2 || opts.knownFromHistory) return 'suggested_location';
    return 'candidate';
  }

  if (candidate.locationType === 'deployment_site' || candidate.locationType === 'worksite') {
    return mentionCount >= 2 ? 'suggested_location' : 'candidate';
  }

  if (mentionCount >= 3 && candidate.confidence >= 0.75) return 'suggested_location';
  if (mentionCount >= 2) return 'candidate';
  return 'mention_only';
}

export function canPromoteToLocationCard(
  candidate: LocationCandidate,
  opts: { mentionCount?: number; userConfirmed?: boolean; knownFromHistory?: boolean } = {},
): boolean {
  const status = evaluateLocationPromotionStatus(candidate, opts);
  if (opts.userConfirmed) return true;
  if (candidate.requiresReview && !opts.userConfirmed && (opts.mentionCount ?? 0) < 2) {
    return false;
  }
  return status === 'suggested_location' || status === 'confirmed_location';
}
