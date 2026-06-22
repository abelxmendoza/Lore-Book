import type { RetrievalMemoryRecord } from './retrievalTypes';

const TEMPORAL_PATTERNS: Array<{ re: RegExp; era: string }> = [
  { re: /\bmiddle school\b/i, era: 'middle school' },
  { re: /\bhigh school\b/i, era: 'high school' },
  { re: /\bbefore covid\b/i, era: 'before covid' },
  { re: /\bback then\b/i, era: 'past era' },
  { re: /\bwhen I worked at\b/i, era: 'work era' },
  { re: /\bat Meridian\b/i, era: 'Meridian Robotics era' },
  { re: /\bMeridian Robotics\b/i, era: 'Meridian Robotics era' },
];

export function detectTemporalEra(query: string): string[] {
  const eras: string[] = [];
  for (const { re, era } of TEMPORAL_PATTERNS) {
    if (re.test(query)) eras.push(era);
  }
  return eras;
}

export function retrieveByTimeline(
  records: RetrievalMemoryRecord[],
  query: string,
): RetrievalMemoryRecord[] {
  const eras = detectTemporalEra(query);
  if (eras.length === 0) return [];

  return records.filter((r) => {
    const blob = `${r.text} ${r.eraLabels.join(' ')} ${r.anchorTitles.join(' ')}`.toLowerCase();
    return eras.some((era) => blob.includes(era.toLowerCase()));
  });
}

export function timelineMatchScore(record: RetrievalMemoryRecord, query: string): number {
  const eras = detectTemporalEra(query);
  if (eras.length === 0) return 0;

  const blob = `${record.text} ${record.eraLabels.join(' ')}`.toLowerCase();
  let score = 0;
  for (const era of eras) {
    if (blob.includes(era.toLowerCase())) score += 0.35;
  }
  for (const label of record.eraLabels) {
    if (query.toLowerCase().includes(label.toLowerCase())) score += 0.2;
  }
  return Math.min(1, score);
}
