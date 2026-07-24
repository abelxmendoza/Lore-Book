/**
 * Life Chapter Assembler — group Storylines (narrative_story_chapters) into
 * domain-level life chapters ("Career", "Family", "Creative Work", ...).
 *
 * Pure functions: no DB. Callers persist via narrativeLifeChapterService.
 *
 * Ladder: Moments → Scenes → Storylines → Life Chapters → Life Eras
 *
 * A Storyline is one ongoing narrative ("Building LoreBook"). A Life Chapter
 * is the domain it belongs to ("Creative Work") and can hold several
 * Storylines from that same domain across a life period. Unlike Storyline
 * threading (which splits per-subject), a Life Chapter groups every
 * Storyline in a domain together — a "Career" chapter can hold both
 * "Getting Hired" and "Learning the Role" as separate Storylines.
 */

import type { NarrativeDomain } from './narrativeIdentity';

/**
 * Hard split for a domain group: long enough that ordinary Storyline-level
 * gaps (45 days) never fragment a Chapter, but a domain that goes fully
 * dormant for the better part of a year and later resurfaces becomes a new
 * Chapter instance (~9 months).
 */
export const LIFE_CHAPTER_HARD_GAP_MS = 270 * 24 * 60 * 60 * 1000;

export const DOMAIN_LABELS: Record<NarrativeDomain, string> = {
  career: 'Career',
  creative: 'Creative Work',
  family: 'Family',
  romance: 'Dating & Romance',
  friends: 'Friendships',
  social_scene: 'Social Life',
  health: 'Health & Fitness',
  education: 'Education',
  travel: 'Travel',
  finances: 'Finances',
  errands: 'Daily Life',
  unknown: 'Life',
};

export type LifeChapterStorylineInput = {
  id: string;
  title: string;
  summary: string;
  domain: NarrativeDomain;
  timeStart: string | null;
  timeEnd: string | null;
  location?: string | null;
  participants?: string[];
  sceneIds?: string[];
  eventIds?: string[];
  themes?: string[];
  significanceScore?: number;
  dominantEmotion?: string | null;
};

export type AssembledLifeChapter = {
  storylineIds: string[];
  storylines: LifeChapterStorylineInput[];
  domain: NarrativeDomain;
  title: string;
  summary: string;
  timeStart: string | null;
  timeEnd: string | null;
  location: string | null;
  participants: string[];
  sceneIds: string[];
  eventIds: string[];
  themes: string[];
  dominantEmotion: string | null;
  confidence: number;
};

function compact(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function storylineSortTime(storyline: LifeChapterStorylineInput): number {
  return ms(storyline.timeStart) ?? ms(storyline.timeEnd) ?? 0;
}

function pickDominant(values: string[]): string | null {
  if (!values.length) return null;
  const counts = new Map<string, { raw: string; n: number }>();
  for (const v of values) {
    const key = normalizeToken(v);
    if (!key) continue;
    const cur = counts.get(key);
    if (cur) cur.n += 1;
    else counts.set(key, { raw: v, n: 1 });
  }
  let best: { raw: string; n: number } | null = null;
  for (const row of counts.values()) {
    if (!best || row.n > best.n) best = row;
  }
  return best?.raw ?? null;
}

function formatStorylineDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function buildLifeChapter(
  domain: NarrativeDomain,
  storylines: LifeChapterStorylineInput[],
): AssembledLifeChapter {
  const ordered = [...storylines].sort((a, b) => storylineSortTime(a) - storylineSortTime(b));

  const participants = Array.from(
    new Set(ordered.flatMap((s) => (s.participants ?? []).map(normalizeToken).filter(Boolean))),
  );
  const locations = ordered.map((s) => s.location).filter((x): x is string => Boolean(x));
  const location = pickDominant(locations);

  const starts = ordered.map((s) => s.timeStart).filter((x): x is string => Boolean(x));
  const ends = ordered.map((s) => s.timeEnd ?? s.timeStart).filter((x): x is string => Boolean(x));
  const timeStart = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null;
  const timeEnd = ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : null;

  const sceneIds = Array.from(new Set(ordered.flatMap((s) => s.sceneIds ?? [])));
  const eventIds = Array.from(new Set(ordered.flatMap((s) => s.eventIds ?? [])));

  const themeSet = new Set<string>([domain]);
  for (const s of ordered) {
    for (const t of s.themes ?? []) themeSet.add(t);
  }
  themeSet.delete('unknown');
  const themes = [...themeSet].slice(0, 8);

  const emotions = ordered.map((s) => s.dominantEmotion).filter((x): x is string => Boolean(x));
  const dominantEmotion = pickDominant(emotions);

  const title = DOMAIN_LABELS[domain] ?? 'Life';
  const summary = ordered
    .map((s) => {
      const label = compact(s.title || s.summary);
      if (!label) return '';
      const when = formatStorylineDate(s.timeStart ?? s.timeEnd);
      return when ? `${when}: ${label}` : label;
    })
    .filter(Boolean)
    .join(' → ')
    .slice(0, 700);

  const confidence = Math.min(
    0.95,
    0.4 +
      ordered.length * 0.12 +
      (location ? 0.06 : 0) +
      (participants.length ? 0.06 : 0) +
      (eventIds.length ? 0.08 : 0),
  );

  return {
    storylineIds: ordered.map((s) => s.id),
    storylines: ordered,
    domain,
    title,
    summary,
    timeStart,
    timeEnd,
    location,
    participants,
    sceneIds,
    eventIds,
    themes,
    dominantEmotion,
    confidence,
  };
}

/**
 * Group Storylines by domain, splitting a domain group into separate Chapter
 * instances whenever it goes dormant for longer than LIFE_CHAPTER_HARD_GAP_MS
 * (a resurfaced domain becomes a new Chapter rather than one chapter
 * spanning an unrelated multi-year gap).
 */
export function assembleLifeChaptersFromStorylines(
  storylines: LifeChapterStorylineInput[],
): AssembledLifeChapter[] {
  if (storylines.length === 0) return [];

  const byDomain = new Map<NarrativeDomain, LifeChapterStorylineInput[]>();
  for (const storyline of storylines) {
    const list = byDomain.get(storyline.domain);
    if (list) list.push(storyline);
    else byDomain.set(storyline.domain, [storyline]);
  }

  const chapters: AssembledLifeChapter[] = [];
  for (const [domain, group] of byDomain.entries()) {
    const ordered = [...group].sort((a, b) => storylineSortTime(a) - storylineSortTime(b));
    const clusters: LifeChapterStorylineInput[][] = [];
    let current: LifeChapterStorylineInput[] = [ordered[0]];

    for (let i = 1; i < ordered.length; i++) {
      const prev = current[current.length - 1];
      const next = ordered[i];
      const tPrev = ms(prev.timeEnd) ?? ms(prev.timeStart);
      const tNext = ms(next.timeStart) ?? ms(next.timeEnd);
      if (tPrev != null && tNext != null && Math.abs(tNext - tPrev) > LIFE_CHAPTER_HARD_GAP_MS) {
        clusters.push(current);
        current = [next];
      } else {
        current.push(next);
      }
    }
    clusters.push(current);

    for (const cluster of clusters) {
      chapters.push(buildLifeChapter(domain, cluster));
    }
  }

  chapters.sort((a, b) => (ms(a.timeStart) ?? 0) - (ms(b.timeStart) ?? 0));
  return chapters;
}

/** Map a persisted story chapter (Storyline) row into life-chapter assembler input. */
export function storylineRowToLifeChapterInput(row: {
  id: string;
  title: string;
  summary: string;
  time_start: string | null;
  time_end: string | null;
  location?: string | null;
  participants?: string[];
  scene_ids?: string[];
  event_ids?: string[];
  themes?: string[];
  significance_score?: number;
  dominant_emotion?: string | null;
  metadata?: { ownership?: { domain?: NarrativeDomain } } | null;
}): LifeChapterStorylineInput {
  const domain: NarrativeDomain =
    row.metadata?.ownership?.domain ?? (row.themes?.[0] as NarrativeDomain | undefined) ?? 'unknown';
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    domain,
    timeStart: row.time_start,
    timeEnd: row.time_end,
    location: row.location,
    participants: row.participants ?? [],
    sceneIds: row.scene_ids ?? [],
    eventIds: row.event_ids ?? [],
    themes: row.themes ?? [],
    significanceScore: row.significance_score,
    dominantEmotion: row.dominant_emotion,
  };
}
