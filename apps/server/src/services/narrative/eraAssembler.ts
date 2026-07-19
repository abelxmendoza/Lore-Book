/**
 * Era Assembler — group Story Chapters into months-to-years life periods.
 *
 * Pure functions: no DB. Callers persist via narrativeLifeEraService.
 *
 * An Era is a life container: career stretch, creative season, relationship
 * period. It holds Chapters (never 1:1 with a single scene).
 */

import { isPublishableLifeLogTitle } from '../events/lifeLogEligibilityPolicy';

/** Soft gap: still one era with thematic continuity (~90 days). */
export const ERA_MAX_GAP_MS = 90 * 24 * 60 * 60 * 1000;

/** Hard split when chapters are farther apart (~6 months). */
export const ERA_HARD_GAP_MS = 180 * 24 * 60 * 60 * 1000;

export type EraChapterInput = {
  id: string;
  title: string;
  summary: string;
  thesis?: string | null;
  timeStart: string | null;
  timeEnd: string | null;
  location?: string | null;
  participants?: string[];
  themes?: string[];
  sceneIds?: string[];
  eventIds?: string[];
  significanceScore?: number;
  dominantEmotion?: string | null;
};

export type AssembledEra = {
  chapterIds: string[];
  chapters: EraChapterInput[];
  title: string;
  summary: string;
  thesis: string;
  timeStart: string | null;
  timeEnd: string | null;
  location: string | null;
  participants: string[];
  sceneIds: string[];
  eventIds: string[];
  themes: string[];
  dominantEmotion: string | null;
  isCurrent: boolean;
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

function chapterSortTime(chapter: EraChapterInput): number {
  return ms(chapter.timeStart) ?? ms(chapter.timeEnd) ?? 0;
}

function participantsOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return true;
  const setA = new Set(a.map(normalizeToken));
  return b.some((p) => setA.has(normalizeToken(p)));
}

function locationsCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return true;
  const na = normalizeToken(a);
  const nb = normalizeToken(b);
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

function themeTokens(chapter: EraChapterInput): Set<string> {
  const tokens = new Set<string>();
  const blob = `${chapter.title} ${chapter.summary} ${chapter.thesis ?? ''}`.toLowerCase();
  for (const t of chapter.themes ?? []) {
    const n = normalizeToken(t);
    if (n) tokens.add(n);
  }
  if (/\b(?:job|work|onboard|interview|career|vanguard|robotics)\b/.test(blob)) tokens.add('career');
  if (/\b(?:memovault|built|coded|project|creative)\b/.test(blob)) tokens.add('creative');
  if (/\b(?:costco|grocer|shopping|errand)\b/.test(blob)) tokens.add('errands');
  if (/\b(?:with|hung|visited|family|friend|jamie|marcus|abuela)\b/.test(blob)) tokens.add('social');
  if (/\b(?:moved|move|home|house|depot)\b/.test(blob)) tokens.add('place');
  return tokens;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0.35;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Should chapter B continue the era that currently ends with chapter A?
 */
export function shouldMergeChapters(prev: EraChapterInput, next: EraChapterInput): boolean {
  const tPrev = ms(prev.timeEnd) ?? ms(prev.timeStart);
  const tNext = ms(next.timeStart) ?? ms(next.timeEnd);
  if (tPrev != null && tNext != null) {
    const gap = Math.abs(tNext - tPrev);
    if (gap > ERA_HARD_GAP_MS) return false;
    if (gap > ERA_MAX_GAP_MS) {
      const themeOk = jaccard(themeTokens(prev), themeTokens(next)) >= 0.4;
      const partOk = participantsOverlap(prev.participants ?? [], next.participants ?? []);
      const locOk = locationsCompatible(prev.location, next.location);
      if (!(themeOk && (partOk || locOk))) return false;
    }
  }

  if (/\b(?:years later|a new era|new chapter of life|meanwhile)\b/i.test(
    `${next.summary} ${next.title} ${next.thesis ?? ''}`,
  )) {
    return false;
  }

  const themes = jaccard(themeTokens(prev), themeTokens(next));
  const parts = participantsOverlap(prev.participants ?? [], next.participants ?? []);
  const locs = locationsCompatible(prev.location, next.location);

  if (themes >= 0.35 || (parts && themes >= 0.2) || (locs && themes >= 0.2) || (parts && locs)) {
    return true;
  }

  if (tPrev != null && tNext != null) {
    const gap = Math.abs(tNext - tPrev);
    if (gap <= 45 * 24 * 60 * 60 * 1000 && themes >= 0.15) return true;
  }

  return false;
}

export function assembleErasFromChapters(chapters: EraChapterInput[]): AssembledEra[] {
  if (chapters.length === 0) return [];

  const ordered = [...chapters].sort((a, b) => chapterSortTime(a) - chapterSortTime(b));
  const clusters: EraChapterInput[][] = [];
  let current: EraChapterInput[] = [ordered[0]];

  for (let i = 1; i < ordered.length; i++) {
    const prev = current[current.length - 1];
    const next = ordered[i];
    if (shouldMergeChapters(prev, next)) {
      current.push(next);
    } else {
      clusters.push(current);
      current = [next];
    }
  }
  clusters.push(current);

  const now = Date.now();
  return clusters.map((cluster) => buildEra(cluster, now));
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

function buildEra(chapters: EraChapterInput[], nowMs: number): AssembledEra {
  const participants = Array.from(
    new Set(
      chapters.flatMap((c) => (c.participants ?? []).map((p) => normalizeToken(p)).filter(Boolean)),
    ),
  );
  const locations = chapters.map((c) => c.location).filter((x): x is string => Boolean(x));
  const location = pickDominant(locations);

  const starts = chapters.map((c) => c.timeStart).filter((x): x is string => Boolean(x));
  const ends = chapters
    .map((c) => c.timeEnd ?? c.timeStart)
    .filter((x): x is string => Boolean(x));
  const timeStart = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null;
  const timeEnd = ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : null;

  const sceneIds = Array.from(new Set(chapters.flatMap((c) => c.sceneIds ?? [])));
  const eventIds = Array.from(new Set(chapters.flatMap((c) => c.eventIds ?? [])));

  const themeSet = new Set<string>();
  for (const c of chapters) {
    for (const t of themeTokens(c)) themeSet.add(t);
  }
  const themes = [...themeSet].slice(0, 8);

  const emotions = chapters.map((c) => c.dominantEmotion).filter((x): x is string => Boolean(x));
  const dominantEmotion = pickDominant(emotions);

  const title = deriveEraTitle({ chapters, location, participants, themes });
  const summary = chapters
    .map((c) => compact(c.title || c.summary))
    .filter(Boolean)
    .join(' · ')
    .slice(0, 700);
  const thesis = deriveEraThesis(chapters, themes);

  const endMs = ms(timeEnd) ?? ms(timeStart);
  const isCurrent = endMs != null && nowMs - endMs <= 60 * 24 * 60 * 60 * 1000;

  const confidence = Math.min(
    0.95,
    0.35 +
      chapters.length * 0.12 +
      (location ? 0.08 : 0) +
      (participants.length ? 0.08 : 0) +
      (eventIds.length ? 0.08 : 0),
  );

  return {
    chapterIds: chapters.map((c) => c.id),
    chapters,
    title,
    summary,
    thesis,
    timeStart,
    timeEnd,
    location,
    participants,
    sceneIds,
    eventIds,
    themes,
    dominantEmotion,
    isCurrent,
    confidence,
  };
}

export function deriveEraTitle(input: {
  chapters: EraChapterInput[];
  location: string | null;
  participants: string[];
  themes: string[];
}): string {
  const people = input.participants
    .map((p) => p.replace(/\b\w/g, (c) => c.toUpperCase()))
    .slice(0, 2);
  const loc = input.location;
  const blob = input.chapters.map((c) => `${c.title} ${c.summary}`).join(' ').toLowerCase();
  const top = [...input.chapters].sort(
    (a, b) => (b.significanceScore ?? 0) - (a.significanceScore ?? 0),
  )[0];

  if (input.themes.includes('career') && /\bvanguard|robotics|onboard|interview\b/.test(blob)) {
    const title = 'Vanguard Robotics Era';
    if (isPublishableLifeLogTitle(title)) return title;
  }
  if (input.themes.includes('creative') && /\bmemovault\b/.test(blob)) {
    const title = loc ? `MemoVault Era at ${loc}` : 'MemoVault Era';
    if (isPublishableLifeLogTitle(title)) return title;
  }
  if (loc && people.length) {
    const title = `${loc} years with ${people[0]}`;
    if (isPublishableLifeLogTitle(title)) return title;
  }
  if (people.length && input.themes.includes('social')) {
    const title = `Life with ${people[0]}`;
    if (isPublishableLifeLogTitle(title)) return title;
  }
  if (top?.title && isPublishableLifeLogTitle(top.title)) {
    const title = input.chapters.length === 1 ? `${top.title} Era` : `${top.title} period`;
    if (isPublishableLifeLogTitle(title)) return title;
  }
  return top?.title?.slice(0, 80) || 'Untitled era';
}

function deriveEraThesis(chapters: EraChapterInput[], themes: string[]): string {
  const titles = chapters
    .map((c) => compact(c.title))
    .filter(Boolean)
    .slice(0, 5);
  const themeLabel = themes.slice(0, 4).join(', ');
  if (titles.length === 0) {
    return themeLabel ? `A life period shaped by ${themeLabel}.` : '';
  }
  if (titles.length === 1) {
    return themeLabel
      ? `${titles[0]} — an era of ${themeLabel}.`
      : `${titles[0]}.`;
  }
  return `An era spanning ${titles.length} chapters (${titles.join('; ')})${
    themeLabel ? `, themes: ${themeLabel}` : ''
  }.`;
}

/** Map a persisted story chapter row into era assembler input. */
export function chapterRowToEraInput(row: {
  id: string;
  title: string;
  summary: string;
  thesis?: string | null;
  time_start: string | null;
  time_end: string | null;
  location?: string | null;
  participants?: string[];
  themes?: string[];
  scene_ids?: string[];
  event_ids?: string[];
  significance_score?: number;
  dominant_emotion?: string | null;
}): EraChapterInput {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    thesis: row.thesis,
    timeStart: row.time_start,
    timeEnd: row.time_end,
    location: row.location,
    participants: row.participants ?? [],
    themes: row.themes ?? [],
    sceneIds: row.scene_ids ?? [],
    eventIds: row.event_ids ?? [],
    significanceScore: row.significance_score,
    dominantEmotion: row.dominant_emotion,
  };
}
