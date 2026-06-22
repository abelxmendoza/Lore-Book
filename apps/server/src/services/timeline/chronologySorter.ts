import type { TimelineAnchor } from './timelineStitchingTypes';

const PRECISION_RANK: Record<string, number> = {
  exact: 0,
  day: 1,
  month: 2,
  season: 3,
  year: 4,
  era: 5,
  relative: 6,
  fuzzy: 7,
  recurring: 8,
  unknown: 9,
};

const ERA_ORDER: Record<string, number> = {
  childhood: 1,
  'middle school': 2,
  'middle school era': 2,
  'high school': 3,
  'high school era': 3,
  college: 4,
  'csuf era': 4,
  'vanguard robotics era': 5,
  'amazon era': 6,
  'lorebook build era': 7,
  'pandemic era': 8,
};

function sortKey(anchor: TimelineAnchor, messageTimestamp?: string): [number, number] {
  const nt = anchor.normalizedTime;
  if (!nt) return [4, messageTimestamp ? Date.parse(messageTimestamp) : 1e15];

  if (nt.date) return [0, Date.parse(nt.date)];
  if (nt.startDate) return [1, Date.parse(nt.startDate)];
  if (nt.endDate) return [1, Date.parse(nt.endDate)];

  if (nt.precision === 'era') {
    const eraLabel = (nt.eraLabel ?? nt.relativeLabel ?? '').toLowerCase();
    return [2, ERA_ORDER[eraLabel] ?? 50];
  }

  if (nt.precision === 'fuzzy' || nt.precision === 'relative' || nt.precision === 'season') {
    return [3, PRECISION_RANK[nt.precision] ?? 9];
  }

  if (nt.precision === 'recurring') return [3, 20];

  if (messageTimestamp) return [4, Date.parse(messageTimestamp)];

  return [4, PRECISION_RANK[nt.precision] ?? 9];
}

export function sortTimelineAnchorsChronologically(
  anchors: TimelineAnchor[],
  messageTimestampById?: Record<string, string>,
): TimelineAnchor[] {
  return [...anchors].sort((a, b) => {
    const aTs = messageTimestampById?.[a.sourceMessageId];
    const bTs = messageTimestampById?.[b.sourceMessageId];
    const [aTier, aKey] = sortKey(a, aTs);
    const [bTier, bKey] = sortKey(b, bTs);
    if (aTier !== bTier) return aTier - bTier;
    return aKey - bKey;
  });
}

export function comparePrecision(a: string, b: string): number {
  return (PRECISION_RANK[a] ?? 9) - (PRECISION_RANK[b] ?? 9);
}
