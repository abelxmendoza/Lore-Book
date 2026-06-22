import type { TimelineAnchor, TimelineContradictionReview } from './timelineStitchingTypes';

type ExistingAnchor = Pick<
  TimelineAnchor,
  'id' | 'phrase' | 'attachedToLabel' | 'attachedToType' | 'normalizedTime'
>;

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

export function detectTimelineContradictions(
  newAnchor: TimelineAnchor,
  existing: ExistingAnchor[],
): TimelineContradictionReview[] {
  const reviews: TimelineContradictionReview[] = [];

  for (const prior of existing) {
    if (prior.attachedToLabel !== newAnchor.attachedToLabel) continue;
    if (prior.attachedToType !== newAnchor.attachedToType) continue;

    const conflict = timeConflict(prior, newAnchor);
    if (!conflict) continue;

    reviews.push({
      existingAnchorId: prior.id,
      existingPhrase: prior.phrase,
      newPhrase: newAnchor.phrase,
      attachedToLabel: newAnchor.attachedToLabel ?? '',
      attachedToType: newAnchor.attachedToType,
      reason: conflict,
    });
  }

  return reviews;
}

function timeConflict(a: ExistingAnchor, b: TimelineAnchor): string | null {
  const aStart = extractStartHint(a.phrase, a.normalizedTime?.startHint);
  const bStart = extractStartHint(b.phrase, b.normalizedTime?.startHint);

  if (aStart && bStart && aStart !== bStart) {
    return `Conflicting start hints for ${a.attachedToLabel}: ${aStart} vs ${bStart}`;
  }

  if (a.normalizedTime?.date && b.normalizedTime?.date && a.normalizedTime.date !== b.normalizedTime.date) {
    return `Conflicting exact dates for ${a.attachedToLabel}`;
  }

  return null;
}

function extractStartHint(phrase: string, startHint?: string): string | undefined {
  if (startHint) return startHint.toLowerCase();
  const inMonth = phrase.match(/\bin\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
  if (inMonth) return inMonth[1].toLowerCase();
  for (const month of MONTHS) {
    if (phrase.toLowerCase().includes(month)) return month;
  }
  return undefined;
}

export function applyContradictionPolicy(
  anchor: TimelineAnchor,
  reviews: TimelineContradictionReview[],
): TimelineAnchor {
  if (reviews.length === 0) return anchor;
  return {
    ...anchor,
    requiresReview: true,
    inferredNotConfirmed: true,
    confidence: Math.min(anchor.confidence, 0.55),
  };
}
