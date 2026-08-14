import type { StitchedTimelineItem } from './stitchedTimelineService';
import type { TemporalRelationType } from '../timeline/timelineStitchingTypes';

export type ProjectedTemporalRelation = {
  id: string;
  sourceId: string | null;
  sourceLabel: string;
  targetId: string | null;
  targetLabel: string;
  relation: TemporalRelationType;
  confidence: number;
  evidencePhrase: string;
  sourceMessageId: string;
  sourceAssertionIds: string[];
};

export type HistoricalTrack = {
  id: string;
  label: string;
  itemIds: string[];
};

export type HistoricalNeighborhood = {
  id: string;
  label: string;
  start: string;
  end: string;
  precision: 'year';
  tracks: HistoricalTrack[];
  relationIds: string[];
};

function yearFrom(value: string | null | undefined): number | null {
  if (!value) return null;
  const year = Number(value.slice(0, 4));
  return Number.isInteger(year) && year >= 1000 && year <= 9999 ? year : null;
}

function normalizedLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function inferHistoricalTrack(item: StitchedTimelineItem): HistoricalTrack {
  const text = `${item.title} ${item.body} ${(item.tags ?? []).join(' ')}`;
  if (/\b(dating|relationship|girlfriend|boyfriend|partner|romance|breakup|crush)\b/i.test(text)) {
    return { id: 'relationships', label: 'Relationships', itemIds: [item.id] };
  }
  if (/\b(muay thai|bjj|mma|martial arts|boxing|kickboxing|training|fight record|gym)\b/i.test(text)) {
    return { id: 'martial_arts', label: 'Martial arts', itemIds: [item.id] };
  }
  if (/\b(work|job|career|interview|employer|hired)\b/i.test(text)) {
    return { id: 'career', label: 'Career', itemIds: [item.id] };
  }
  if (/\b(school|college|class|university|degree)\b/i.test(text)) {
    return { id: 'education', label: 'Education', itemIds: [item.id] };
  }
  if (/\b(family|mother|father|mom|dad|sister|brother|abuela|t[ií]o)\b/i.test(text)) {
    return { id: 'family', label: 'Family', itemIds: [item.id] };
  }
  return { id: 'life', label: 'Life', itemIds: [item.id] };
}

export function buildHistoricalNeighborhoods(
  items: StitchedTimelineItem[],
  relations: ProjectedTemporalRelation[] = [],
): HistoricalNeighborhood[] {
  const byYear = new Map<number, StitchedTimelineItem[]>();
  for (const item of items) {
    const startYear = yearFrom(item.temporal?.occurred.start ?? item.occurredAt ?? item.sortTime);
    const endYear = yearFrom(item.temporal?.occurred.end) ?? startYear;
    if (startYear == null || endYear == null) continue;
    const cappedEnd = Math.min(endYear, startYear + 100);
    for (let year = startYear; year <= cappedEnd; year += 1) {
      const list = byYear.get(year) ?? [];
      list.push(item);
      byYear.set(year, list);
    }
  }

  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, yearItems]) => {
      const tracks = new Map<string, HistoricalTrack>();
      for (const item of yearItems) {
        const track = inferHistoricalTrack(item);
        const existing = tracks.get(track.id);
        if (existing) existing.itemIds.push(item.id);
        else tracks.set(track.id, track);
      }
      const labels = yearItems.flatMap((item) => [normalizedLabel(item.title), item.sourceId]);
      const matchesYearItem = (label: string, id: string | null): boolean => {
        if (id && labels.includes(id)) return true;
        const normalized = normalizedLabel(label);
        return labels.some((candidate) =>
          candidate === normalized
          || candidate.includes(normalized)
          || normalized.includes(candidate),
        );
      };
      const relationIds = relations
        .filter((relation) =>
          matchesYearItem(relation.sourceLabel, relation.sourceId)
          || matchesYearItem(relation.targetLabel, relation.targetId),
        )
        .map((relation) => relation.id);
      return {
        id: `year:${year}`,
        label: String(year),
        start: `${year}-01-01T00:00:00.000Z`,
        end: `${year}-12-31T23:59:59.999Z`,
        precision: 'year' as const,
        tracks: [...tracks.values()],
        relationIds,
      };
    });
}
