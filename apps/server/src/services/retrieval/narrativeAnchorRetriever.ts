import type { RetrievalAnchorRef, RetrievalMemoryRecord } from './retrievalTypes';

export function retrieveByAnchor(
  records: RetrievalMemoryRecord[],
  anchors: RetrievalAnchorRef[],
  anchorIds: string[],
): RetrievalMemoryRecord[] {
  const idSet = new Set(anchorIds);
  return records.filter((r) => r.anchorIds.some((id) => idSet.has(id)));
}

export function anchorMatchScore(
  record: RetrievalMemoryRecord,
  anchors: RetrievalAnchorRef[],
  query: string,
): number {
  const q = query.toLowerCase();
  let score = 0;

  for (const anchor of anchors) {
    if (record.anchorIds.includes(anchor.id)) score += 0.3;
    if (q.includes(anchor.title.toLowerCase())) score += 0.25;
    if (anchor.activities?.some((a) => q.includes(a.toLowerCase()))) score += 0.2;
  }

  for (const title of record.anchorTitles) {
    if (q.includes(title.toLowerCase())) score += 0.15;
  }

  return Math.min(1, score);
}

export function retrieveAnchorContext(
  anchors: RetrievalAnchorRef[],
  entityAnchorIds: string[],
): RetrievalAnchorRef[] {
  const idSet = new Set(entityAnchorIds);
  return anchors.filter((a) => idSet.has(a.id) || a.entityIds.length > 0);
}

export function formatAnchorContext(anchors: RetrievalAnchorRef[]): string {
  return anchors
    .map((a) => {
      const activities = a.activities?.length ? ` · ${a.activities.join(', ')}` : '';
      return `${a.title}${activities}`;
    })
    .join(' → ');
}
