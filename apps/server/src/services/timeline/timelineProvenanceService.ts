import type { TimelineAnchor } from './timelineStitchingTypes';

export function buildAnchorId(userId: string, phrase: string, attachedToLabel: string): string {
  const slug = `${phrase}:${attachedToLabel}`.toLowerCase().replace(/\s+/g, '_').slice(0, 80);
  return `ta_${userId.slice(0, 8)}_${slug}`;
}

export function hasAnchorProvenance(anchor: TimelineAnchor): boolean {
  return Boolean(
    anchor.sourceMessageId &&
      anchor.evidencePhrase &&
      anchor.phrase &&
      anchor.attachedToLabel,
  );
}

export function mergeEvidencePhrases(a: string, b: string): string {
  if (a.includes(b)) return a;
  if (b.includes(a)) return b;
  return `${a} | ${b}`;
}
