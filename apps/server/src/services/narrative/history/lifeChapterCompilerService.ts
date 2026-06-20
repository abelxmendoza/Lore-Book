import {
  LIFE_EVENT_CATEGORY_LABELS,
  type LifeEventCategory,
} from './lifeEventTaxonomy';
import type { ClassifiedLifeEvent } from './lifeEventClassificationService';

export type LifeHistoryChapter = {
  id: string;
  title: string;
  summary: string;
  startDate: string;
  endDate: string;
  dominantCategory: LifeEventCategory;
  themes: string[];
  significance: number;
  eventCount: number;
  turningPointCount: number;
  events: ClassifiedLifeEvent[];
};

const GAP_SPLIT_MS = 1000 * 60 * 60 * 24 * 180; // ~6 months
const MIN_CHAPTER_EVENTS = 2;
const TURNING_POINT_THRESHOLD = 0.72;

function dominantCategory(events: ClassifiedLifeEvent[]): LifeEventCategory {
  const counts = new Map<LifeEventCategory, number>();
  for (const event of events) {
    counts.set(event.category, (counts.get(event.category) ?? 0) + 1);
  }
  let best: LifeEventCategory = 'other';
  let bestCount = 0;
  for (const [category, count] of counts) {
    if (count > bestCount) {
      best = category;
      bestCount = count;
    }
  }
  return best;
}

function chapterThemes(events: ClassifiedLifeEvent[]): string[] {
  const themes = new Set<string>();
  for (const event of events) {
    themes.add(LIFE_EVENT_CATEGORY_LABELS[event.category]);
    if (event.relationshipSubtype) themes.add(event.relationshipSubtype);
  }
  return [...themes].slice(0, 5);
}

function chapterTitle(category: LifeEventCategory, startDate: string, endDate: string): string {
  const label = LIFE_EVENT_CATEGORY_LABELS[category];
  const startYear = startDate.slice(0, 4);
  const endYear = endDate.slice(0, 4);
  if (startYear === endYear) return `${label} · ${startYear}`;
  return `${label} · ${startYear}–${endYear}`;
}

function chapterSummary(events: ClassifiedLifeEvent[]): string {
  const top = [...events].sort((a, b) => b.significance - a.significance).slice(0, 3);
  if (top.length === 0) return 'A period with limited recorded events.';
  return top.map((e) => e.title).join('; ');
}

function shouldSplitChapter(prev: ClassifiedLifeEvent, next: ClassifiedLifeEvent): boolean {
  const gap = new Date(next.startTime).getTime() - new Date(prev.startTime).getTime();
  if (gap >= GAP_SPLIT_MS) return true;
  return prev.category !== next.category && gap >= GAP_SPLIT_MS / 3;
}

export function compileLifeChapters(events: ClassifiedLifeEvent[]): LifeHistoryChapter[] {
  if (events.length === 0) return [];

  const sorted = [...events].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  const groups: ClassifiedLifeEvent[][] = [];
  let current: ClassifiedLifeEvent[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    if (shouldSplitChapter(prev, next) && current.length >= MIN_CHAPTER_EVENTS) {
      groups.push(current);
      current = [next];
    } else {
      current.push(next);
    }
  }
  groups.push(current);

  return groups.map((group, index) => {
    const category = dominantCategory(group);
    const startDate = group[0].startTime.slice(0, 10);
    const endDate = group[group.length - 1].startTime.slice(0, 10);
    const turningPointCount = group.filter((e) => e.significance >= TURNING_POINT_THRESHOLD).length;
    const avgSignificance =
      group.reduce((sum, e) => sum + e.significance, 0) / Math.max(1, group.length);

    return {
      id: `chapter-${index + 1}-${startDate}`,
      title: chapterTitle(category, startDate, endDate),
      summary: chapterSummary(group),
      startDate,
      endDate,
      dominantCategory: category,
      themes: chapterThemes(group),
      significance: Math.round(avgSignificance * 100) / 100,
      eventCount: group.length,
      turningPointCount,
      events: group,
    };
  });
}
