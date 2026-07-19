import type { EnrichedLifeArc } from '../../continuityRuntime/arcs/lifeArcSynthesisService';
import type { NarrativeTurningPoint, TurningPointKind } from '../types';
import { loadClassifiedLifeEvents, type ClassifiedLifeEvent } from './lifeEventClassificationService';
import { compileLifeChapters, type LifeHistoryChapter } from './lifeChapterCompilerService';
import { type LifeEventCategory } from './lifeEventTaxonomy';

export type LifeHistoryReport = {
  generatedAt: string;
  eventCount: number;
  chapterCount: number;
  turningPointCount: number;
  categoryCounts: Partial<Record<LifeEventCategory, number>>;
  chapters: LifeHistoryChapter[];
  turningPoints: NarrativeTurningPoint[];
  topEvents: ClassifiedLifeEvent[];
};

const CATEGORY_TO_TURNING_KIND: Partial<Record<LifeEventCategory, TurningPointKind>> = {
  relationship: 'new_relationship',
  career: 'career_change',
  move: 'move',
  education: 'graduation',
  achievement: 'achievement',
  failure: 'major_failure',
  health: 'awakening',
};

function classifiedToTurningPoint(event: ClassifiedLifeEvent): NarrativeTurningPoint {
  const kind =
    event.relationshipSubtype === 'separation'
      ? 'breakup'
      : event.relationshipSubtype === 'milestone'
        ? 'new_relationship'
        : CATEGORY_TO_TURNING_KIND[event.category] ?? 'other';

  return {
    id: event.id,
    title: event.title,
    date: event.startTime,
    kind,
    importance: event.significance,
    affectedArcIds: [],
    evidence: [{
      id: `${event.id}-ev`,
      label: event.summary ?? event.title,
      source: 'resolved_event',
      date: event.startTime,
      confidence: event.confidence,
      storyState: 'confirmed',
    }],
    confidence: event.confidence,
    storyState: event.significance >= 0.72 ? 'confirmed' : 'compiled',
  };
}

function matchArcs(event: ClassifiedLifeEvent, arcs: EnrichedLifeArc[]): string[] {
  const haystack = `${event.title} ${event.summary ?? ''}`.toLowerCase();
  return arcs
    .filter((arc) =>
      haystack.includes(arc.title.toLowerCase()) ||
      arc.evidence.some((e) => haystack.includes(e.toLowerCase().slice(0, 24))),
    )
    .map((a) => a.id)
    .slice(0, 3);
}

export async function compileLifeHistory(
  userId: string,
  arcs: EnrichedLifeArc[] = [],
  opts: { limit?: number } = {},
): Promise<LifeHistoryReport> {
  const events = await loadClassifiedLifeEvents(userId, opts.limit ?? 2000);
  const chapters = compileLifeChapters(events);

  const turningPoints = events
    .filter((e) => e.significance >= 0.72)
    .sort((a, b) => b.significance - a.significance)
    .slice(0, 25)
    .map((event) => {
      const tp = classifiedToTurningPoint(event);
      tp.affectedArcIds = matchArcs(event, arcs);
      return tp;
    });

  const categoryCounts: Partial<Record<LifeEventCategory, number>> = {};
  for (const event of events) {
    categoryCounts[event.category] = (categoryCounts[event.category] ?? 0) + 1;
  }

  const topEvents = [...events]
    .sort((a, b) => b.significance - a.significance)
    .slice(0, 12);

  return {
    generatedAt: new Date().toISOString(),
    eventCount: events.length,
    chapterCount: chapters.length,
    turningPointCount: turningPoints.length,
    categoryCounts,
    chapters,
    turningPoints,
    topEvents,
  };
}

export const historyEngineService = {
  compile: compileLifeHistory,
};
