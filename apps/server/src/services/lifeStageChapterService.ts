/**
 * Life-stage chapter candidates.
 *
 * The existing chapterInsightsService.detectCandidates clusters memories by 21-day
 * gaps + tag overlap → fine-grained, recent-activity chapters. It has no concept of
 * life ERAS and never used a birth year. This complements it: coarse, biography-shaped
 * chapters ("Childhood", "Twenties") derived from the user's birth-year anchor
 * (see temporalAnchorProfileService) and populated with the resolved events whose
 * occurrence falls in each era — now that life-stage/age phrases resolve to absolute
 * years, those events land in the right bucket.
 *
 * Reuses the existing ChapterCandidate type and /api/chapters candidate surface, so
 * the UI renders these with zero new plumbing. Pure bucketing logic is split out for
 * deterministic testing; the service is the thin DB wrapper.
 */
import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';
import { temporalAnchorProfileService } from './temporal/temporalAnchorProfileService';
import type { ChapterCandidate } from '../types';

export interface LifeEra {
  label: string;
  minAge: number;
  maxAge: number;
}

// Assumption-free life eras (decade-of-life). Avoids "college"/"high school"
// assumptions that don't hold for every user; maps cleanly to birthYear + age.
export const LIFE_ERAS: LifeEra[] = [
  { label: 'Childhood', minAge: 0, maxAge: 12 },
  { label: 'Teenage Years', minAge: 13, maxAge: 19 },
  { label: 'Twenties', minAge: 20, maxAge: 29 },
  { label: 'Thirties', minAge: 30, maxAge: 39 },
  { label: 'Forties', minAge: 40, maxAge: 49 },
  { label: 'Fifties', minAge: 50, maxAge: 59 },
  { label: 'Sixties', minAge: 60, maxAge: 69 },
  { label: 'Seventies', minAge: 70, maxAge: 79 },
];

export interface EraEventRow {
  id: string;
  title?: string | null;
  start_time: string;
  activities?: string[] | null;
}

/**
 * Pure: bucket resolved events into life-era chapter candidates by occurrence year.
 * Only eras the user has reached AND that contain ≥1 dated event are emitted.
 */
export function buildLifeStageChapters(
  events: EraEventRow[],
  birthYear: number,
  now: Date = new Date(),
): ChapterCandidate[] {
  if (!Number.isFinite(birthYear)) return [];
  const currentYear = now.getFullYear();

  const candidates: ChapterCandidate[] = [];
  for (const era of LIFE_ERAS) {
    const startYear = birthYear + era.minAge;
    if (startYear > currentYear) break; // era not reached yet
    const endYear = Math.min(birthYear + era.maxAge, currentYear);

    const inEra = events.filter((e) => {
      const y = new Date(e.start_time).getFullYear();
      return Number.isFinite(y) && y >= startYear && y <= endYear;
    });
    if (inEra.length === 0) continue;

    candidates.push(toCandidate(era, startYear, endYear, inEra));
  }
  return candidates;
}

function toCandidate(
  era: LifeEra,
  startYear: number,
  endYear: number,
  events: EraEventRow[],
): ChapterCandidate {
  const sorted = [...events].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  );

  // Top activities become traits; a couple of event titles seed the summary.
  const activityCounts = new Map<string, number>();
  for (const e of events) {
    for (const a of e.activities ?? []) {
      if (a?.trim()) activityCounts.set(a, (activityCounts.get(a) ?? 0) + 1);
    }
  }
  const traits = [...activityCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([a]) => a);

  const sampleTitles = sorted
    .map((e) => e.title?.trim())
    .filter((t): t is string => !!t)
    .slice(0, 3);

  const yearRange = startYear === endYear ? `${startYear}` : `${startYear}–${endYear}`;
  const summary =
    `Your ${era.label.toLowerCase()} (${yearRange}) — ${events.length} ` +
    `${events.length === 1 ? 'memory' : 'memories'}` +
    (sampleTitles.length ? `, including ${sampleTitles.map((t) => `“${t}”`).join(', ')}.` : '.');

  return {
    id: `lifestage-${era.label.toLowerCase().replace(/\s+/g, '-')}`,
    chapter_title: era.label,
    start_date: new Date(startYear, 0, 1).toISOString(),
    end_date: new Date(endYear, 11, 31, 23, 59, 59, 999).toISOString(),
    summary,
    chapter_traits: traits,
    entry_ids: sorted.map((e) => e.id),
    // Era chapters are inherently approximate; confidence grows with how much
    // resolved evidence the era actually contains.
    confidence: Math.min(0.9, 0.4 + Math.min(events.length, 10) * 0.05),
  };
}

class LifeStageChapterService {
  /**
   * Generate life-era chapter candidates for a user. Empty when no birth year is
   * known (we can't anchor eras without it).
   */
  async generateLifeStageChapters(userId: string, now: Date = new Date()): Promise<ChapterCandidate[]> {
    try {
      const { birthYear } = await temporalAnchorProfileService.getProfile(userId);
      if (!birthYear) return [];

      // One query, bucket in memory. Only events on/after birth year matter.
      const fromISO = new Date(birthYear, 0, 1).toISOString();
      const { data: events, error } = await supabaseAdmin
        .from('resolved_events')
        .select('id, title, start_time, activities')
        .eq('user_id', userId)
        .gte('start_time', fromISO)
        .order('start_time', { ascending: true })
        .limit(2000);

      if (error || !events) return [];
      return buildLifeStageChapters(events as EraEventRow[], birthYear, now);
    } catch (err) {
      logger.debug({ err, userId }, 'life-stage chapter generation failed');
      return [];
    }
  }
}

export const lifeStageChapterService = new LifeStageChapterService();
