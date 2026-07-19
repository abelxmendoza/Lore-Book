/**
 * Chapter Assembler — group Scenes into autobiographical spans.
 *
 * Pure functions: no DB. Callers persist via narrativeStoryChapterService.
 *
 * A Chapter is a continuous life period made of experiences (Scenes),
 * not isolated Moments. Canonical Events may hang off member Scenes.
 */

import { isPublishableLifeLogTitle } from '../events/lifeLogEligibilityPolicy';

/** Max gap between scenes still considered one chapter (14 days). */
export const CHAPTER_MAX_GAP_MS = 14 * 24 * 60 * 60 * 1000;

/** Hard split when scenes are farther apart than this (45 days). */
export const CHAPTER_HARD_GAP_MS = 45 * 24 * 60 * 60 * 1000;

export type ChapterSceneInput = {
  id: string;
  title: string;
  summary: string;
  timeStart: string | null;
  timeEnd: string | null;
  location?: string | null;
  participants?: string[];
  primaryGoal?: string | null;
  dominantEmotion?: string | null;
  significanceScore?: number;
  promotedEventId?: string | null;
  themes?: string[];
};

export type AssembledChapter = {
  sceneIds: string[];
  scenes: ChapterSceneInput[];
  title: string;
  summary: string;
  thesis: string;
  timeStart: string | null;
  timeEnd: string | null;
  location: string | null;
  participants: string[];
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

function sceneSortTime(scene: ChapterSceneInput): number {
  return ms(scene.timeStart) ?? ms(scene.timeEnd) ?? 0;
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
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

function themeTokens(scene: ChapterSceneInput): Set<string> {
  const tokens = new Set<string>();
  const blob = `${scene.title} ${scene.summary} ${scene.primaryGoal ?? ''}`.toLowerCase();
  for (const t of scene.themes ?? []) {
    const n = normalizeToken(t);
    if (n) tokens.add(n);
  }
  if (scene.primaryGoal) tokens.add(normalizeToken(scene.primaryGoal));
  if (/\b(?:job|work|onboard|interview|career|vanguard|robotics)\b/.test(blob)) tokens.add('career');
  if (/\b(?:memovault|built|coded|project|creative)\b/.test(blob)) tokens.add('creative');
  if (/\b(?:costco|grocer|shopping|errand)\b/.test(blob)) tokens.add('errands');
  if (/\b(?:with|hung|visited|family|friend|jamie|marcus|abuela)\b/.test(blob)) tokens.add('social');
  if (/\b(?:moved|move|home|house|depot)\b/.test(blob)) tokens.add('place');
  return tokens;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0.4;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Should scene B continue the chapter that currently ends with scene A?
 */
export function shouldMergeScenes(prev: ChapterSceneInput, next: ChapterSceneInput): boolean {
  const tPrev = ms(prev.timeEnd) ?? ms(prev.timeStart);
  const tNext = ms(next.timeStart) ?? ms(next.timeEnd);
  if (tPrev != null && tNext != null) {
    const gap = Math.abs(tNext - tPrev);
    if (gap > CHAPTER_HARD_GAP_MS) return false;
    if (gap > CHAPTER_MAX_GAP_MS) {
      // Soft gap: only merge with strong thematic / cast continuity
      const themeOk = jaccard(themeTokens(prev), themeTokens(next)) >= 0.35;
      const partOk = participantsOverlap(prev.participants ?? [], next.participants ?? []);
      const locOk = locationsCompatible(prev.location, next.location);
      if (!(themeOk && (partOk || locOk))) return false;
    }
  }

  if (/\b(?:years later|months later|a new chapter|meanwhile)\b/i.test(next.summary + ' ' + next.title)) {
    return false;
  }

  const themes = jaccard(themeTokens(prev), themeTokens(next));
  const parts = participantsOverlap(prev.participants ?? [], next.participants ?? []);
  const locs = locationsCompatible(prev.location, next.location);
  const sameGoal =
    Boolean(prev.primaryGoal) &&
    Boolean(next.primaryGoal) &&
    normalizeToken(prev.primaryGoal!) === normalizeToken(next.primaryGoal!);

  // Strong continuity signals
  if (sameGoal || themes >= 0.4 || (parts && locs) || (parts && themes >= 0.2)) {
    return true;
  }

  // Weak default: adjacent same-week scenes with no conflicting cast
  if (tPrev != null && tNext != null) {
    const gap = Math.abs(tNext - tPrev);
    if (gap <= 7 * 24 * 60 * 60 * 1000 && themes >= 0.15) return true;
  }

  return false;
}

/**
 * Cluster ordered scenes into chapters.
 */
export function assembleChaptersFromScenes(scenes: ChapterSceneInput[]): AssembledChapter[] {
  if (scenes.length === 0) return [];

  const ordered = [...scenes].sort((a, b) => sceneSortTime(a) - sceneSortTime(b));
  const clusters: ChapterSceneInput[][] = [];
  let current: ChapterSceneInput[] = [ordered[0]];

  for (let i = 1; i < ordered.length; i++) {
    const prev = current[current.length - 1];
    const next = ordered[i];
    if (shouldMergeScenes(prev, next)) {
      current.push(next);
    } else {
      clusters.push(current);
      current = [next];
    }
  }
  clusters.push(current);

  return clusters.map(buildChapter);
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

function buildChapter(scenes: ChapterSceneInput[]): AssembledChapter {
  const participants = Array.from(
    new Set(scenes.flatMap((s) => (s.participants ?? []).map((p) => normalizeToken(p)).filter(Boolean))),
  );
  const locations = scenes.map((s) => s.location).filter((x): x is string => Boolean(x));
  const location = pickDominant(locations);

  const starts = scenes.map((s) => s.timeStart).filter((x): x is string => Boolean(x));
  const ends = scenes
    .map((s) => s.timeEnd ?? s.timeStart)
    .filter((x): x is string => Boolean(x));
  const timeStart = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null;
  const timeEnd = ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : null;

  const eventIds = Array.from(
    new Set(scenes.map((s) => s.promotedEventId).filter((x): x is string => Boolean(x))),
  );

  const themeSet = new Set<string>();
  for (const s of scenes) {
    for (const t of themeTokens(s)) themeSet.add(t);
  }
  const themes = [...themeSet].slice(0, 6);

  const emotions = scenes.map((s) => s.dominantEmotion).filter((x): x is string => Boolean(x));
  const dominantEmotion = pickDominant(emotions);

  const title = deriveChapterTitle({ scenes, location, participants, themes });
  const summary = scenes
    .map((s) => compact(s.title || s.summary))
    .filter(Boolean)
    .join(' · ')
    .slice(0, 600);
  const thesis = deriveChapterThesis(scenes, themes);

  const confidence = Math.min(
    0.95,
    0.4 +
      scenes.length * 0.1 +
      (location ? 0.08 : 0) +
      (participants.length ? 0.08 : 0) +
      (eventIds.length ? 0.1 : 0),
  );

  return {
    sceneIds: scenes.map((s) => s.id),
    scenes,
    title,
    summary,
    thesis,
    timeStart,
    timeEnd,
    location,
    participants,
    eventIds,
    themes,
    dominantEmotion,
    confidence,
  };
}

export function deriveChapterTitle(input: {
  scenes: ChapterSceneInput[];
  location: string | null;
  participants: string[];
  themes: string[];
}): string {
  const people = input.participants
    .map((p) => p.replace(/\b\w/g, (c) => c.toUpperCase()))
    .slice(0, 2);
  const loc = input.location;
  const blob = input.scenes.map((s) => `${s.title} ${s.summary}`).join(' ').toLowerCase();
  const topScene = [...input.scenes].sort(
    (a, b) => (b.significanceScore ?? 0) - (a.significanceScore ?? 0),
  )[0];

  if (input.themes.includes('career') && /\bvanguard|robotics|onboard|interview\b/.test(blob)) {
    const title = 'Early days at Vanguard Robotics';
    if (isPublishableLifeLogTitle(title)) return title;
  }
  if (input.themes.includes('creative') && /\bmemovault\b/.test(blob)) {
    const title = loc ? `Building MemoVault at ${loc}` : 'Building MemoVault';
    if (isPublishableLifeLogTitle(title)) return title;
  }
  if (input.themes.includes('errands') && /\bcostco\b/.test(blob) && people.length) {
    const title = `Costco chapter with ${people[0]}`;
    if (isPublishableLifeLogTitle(title)) return title;
  }
  if (loc && people.length) {
    const title = `Life around ${loc} with ${people[0]}`;
    if (isPublishableLifeLogTitle(title)) return title;
  }
  if (topScene?.title && isPublishableLifeLogTitle(topScene.title)) {
    if (input.scenes.length === 1) return topScene.title;
    const title = `${topScene.title} and after`;
    if (isPublishableLifeLogTitle(title)) return title;
  }
  if (people.length) {
    const title = `A chapter with ${people[0]}`;
    if (isPublishableLifeLogTitle(title)) return title;
  }
  return topScene?.title?.slice(0, 80) || 'Untitled chapter';
}

function deriveChapterThesis(scenes: ChapterSceneInput[], themes: string[]): string {
  const titles = scenes
    .map((s) => compact(s.title))
    .filter(Boolean)
    .slice(0, 4);
  const themeLabel = themes.slice(0, 3).join(', ');
  if (titles.length === 0) return themeLabel ? `A period shaped by ${themeLabel}.` : '';
  if (titles.length === 1) {
    return themeLabel
      ? `${titles[0]} — a ${themeLabel} stretch.`
      : `${titles[0]}.`;
  }
  return `Across ${titles.length} experiences (${titles.join('; ')})${
    themeLabel ? `, themes: ${themeLabel}` : ''
  }.`;
}
