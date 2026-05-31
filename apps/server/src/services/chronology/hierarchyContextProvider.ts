/**
 * Hierarchy Context Provider
 *
 * Feeds era/saga/arc date ranges into ChronologyEngine V1 reasoning,
 * making Allen's interval algebra autobiographically aware.
 *
 * Previously, the AmbiguityResolver resolved missing timestamps via:
 *   1. Embedding similarity → median of similar event timestamps
 *   2. Average of all event timestamps
 *   3. Current time (last resort)
 *
 * This service adds a prior step: constraint anchoring.
 * If an event's metadata declares a chapter_id or arc reference, or if the
 * event can be matched to a hierarchy node by date proximity, constrain
 * its timestamp to that node's date range before the resolver guesses.
 *
 * It also exposes `buildHierarchyConstraints()` — a structure passed to
 * the chronology engine so Allen's algebra can label events as
 * "during College Era" or "within Startup Arc" rather than treating all
 * events as context-free timestamps.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { Event } from './types';

export interface HierarchyPeriod {
  id:         string;
  layer:      'era' | 'saga' | 'arc' | 'chapter';
  title:      string;
  start_date: string;
  end_date:   string | null;   // null = ongoing
}

export interface HierarchyConstraints {
  userId: string;
  periods: HierarchyPeriod[];  // all known periods, sorted start_date ASC
}

// ─── Load all hierarchy periods for a user ────────────────────────────────────

export async function loadHierarchyConstraints(
  userId: string
): Promise<HierarchyConstraints> {
  try {
    const [erasResult, sagasResult, arcsResult, chaptersResult] = await Promise.all([
      supabaseAdmin
        .from('timeline_eras')
        .select('id, title, start_date, end_date')
        .eq('user_id', userId)
        .not('start_date', 'is', null)
        .order('start_date', { ascending: true }),

      supabaseAdmin
        .from('timeline_sagas')
        .select('id, title, start_date, end_date')
        .eq('user_id', userId)
        .not('start_date', 'is', null)
        .order('start_date', { ascending: true }),

      supabaseAdmin
        .from('timeline_arcs')
        .select('id, title, start_date, end_date')
        .eq('user_id', userId)
        .not('start_date', 'is', null)
        .order('start_date', { ascending: true }),

      supabaseAdmin
        .from('chapters')
        .select('id, title, start_date, end_date')
        .eq('user_id', userId)
        .not('start_date', 'is', null)
        .order('start_date', { ascending: true }),
    ]);

    const periods: HierarchyPeriod[] = [
      ...(erasResult.data     ?? []).map(r => ({ ...r, layer: 'era'     as const })),
      ...(sagasResult.data    ?? []).map(r => ({ ...r, layer: 'saga'    as const })),
      ...(arcsResult.data     ?? []).map(r => ({ ...r, layer: 'arc'     as const })),
      ...(chaptersResult.data ?? []).map(r => ({ ...r, layer: 'chapter' as const })),
    ].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

    return { userId, periods };
  } catch (err) {
    logger.debug({ err, userId }, 'hierarchyContextProvider: load failed, returning empty');
    return { userId, periods: [] };
  }
}

// ─── Find which period an event's timestamp falls within ──────────────────────

export function findContainingPeriod(
  timestamp: string,
  constraints: HierarchyConstraints
): HierarchyPeriod | null {
  const t = new Date(timestamp).getTime();
  const ONGOING = new Date('9999-12-31').getTime();

  // Prefer the most specific layer (chapter > arc > saga > era)
  const layerPriority: Record<string, number> = {
    chapter: 4,
    arc:     3,
    saga:    2,
    era:     1,
  };

  let best: HierarchyPeriod | null = null;
  let bestPriority = 0;

  for (const period of constraints.periods) {
    const start = new Date(period.start_date).getTime();
    const end   = period.end_date ? new Date(period.end_date).getTime() : ONGOING;
    if (t >= start && t <= end) {
      const priority = layerPriority[period.layer] ?? 0;
      if (priority > bestPriority) {
        best = period;
        bestPriority = priority;
      }
    }
  }

  return best;
}

// ─── Constrain events using hierarchy anchoring ───────────────────────────────
//
// For events with missing timestamps, finds the nearest hierarchy period
// by metadata context (chapterId, tags) or falls back to mid-point of the
// most recent period that ended before or around the other events' median date.
//
// This runs BEFORE AmbiguityResolver so it produces higher-quality anchors.

export function applyHierarchyConstraints(
  events: Event[],
  constraints: HierarchyConstraints
): Event[] {
  if (constraints.periods.length === 0) return events;

  // Compute median timestamp of events that already have one
  const knownTimestamps = events
    .filter(e => e.timestamp)
    .map(e => new Date(e.timestamp!).getTime())
    .sort((a, b) => a - b);

  const medianTs = knownTimestamps.length > 0
    ? knownTimestamps[Math.floor(knownTimestamps.length / 2)]
    : Date.now();

  return events.map(event => {
    if (event.timestamp) {
      // Event has a timestamp: annotate which period it belongs to (enriches Allen's context)
      const period = findContainingPeriod(event.timestamp, constraints);
      if (period) {
        return {
          ...event,
          metadata: {
            ...event.metadata,
            hierarchy_period_id:    period.id,
            hierarchy_period_title: period.title,
            hierarchy_layer:        period.layer,
          },
        };
      }
      return event;
    }

    // Event has NO timestamp: try hierarchy anchoring
    // Strategy: use metadata.chapterId if present, else find nearest period to median
    const chapterId = event.metadata?.chapterId as string | undefined;
    if (chapterId) {
      const chapter = constraints.periods.find(p => p.id === chapterId && p.layer === 'chapter');
      if (chapter) {
        // Anchor to midpoint of chapter
        const start = new Date(chapter.start_date).getTime();
        const end   = chapter.end_date ? new Date(chapter.end_date).getTime() : Date.now();
        const mid   = new Date((start + end) / 2).toISOString();
        return {
          ...event,
          timestamp: mid,
          metadata: {
            ...event.metadata,
            inferred:               true,
            inferredFrom:           'hierarchy_chapter',
            hierarchy_period_id:    chapter.id,
            hierarchy_period_title: chapter.title,
            hierarchy_layer:        'chapter',
          },
        };
      }
    }

    // No chapter hint: find the period whose midpoint is closest to the median timestamp
    let closestPeriod: HierarchyPeriod | null = null;
    let closestDist = Infinity;

    for (const period of constraints.periods) {
      const start = new Date(period.start_date).getTime();
      const end   = period.end_date ? new Date(period.end_date).getTime() : Date.now();
      const mid   = (start + end) / 2;
      const dist  = Math.abs(mid - medianTs);
      if (dist < closestDist) {
        closestDist   = dist;
        closestPeriod = period;
      }
    }

    if (closestPeriod) {
      const start = new Date(closestPeriod.start_date).getTime();
      const end   = closestPeriod.end_date
        ? new Date(closestPeriod.end_date).getTime()
        : Date.now();
      const mid = new Date((start + end) / 2).toISOString();
      return {
        ...event,
        timestamp: mid,
        metadata: {
          ...event.metadata,
          inferred:               true,
          inferredFrom:           'hierarchy_proximity',
          hierarchy_period_id:    closestPeriod.id,
          hierarchy_period_title: closestPeriod.title,
          hierarchy_layer:        closestPeriod.layer,
        },
      };
    }

    return event;
  });
}
