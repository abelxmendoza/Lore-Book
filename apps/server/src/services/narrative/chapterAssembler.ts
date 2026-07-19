/**
 * Chapter Assembler — group Scenes into autobiographical spans.
 *
 * Pure functions: no DB. Callers persist via narrativeStoryChapterService.
 *
 * A Chapter is one story, not an index of nearby memories. Assembly is
 * identity-first:
 *
 *   1. Dedupe near-identical scenes into beats.
 *   2. Classify each beat into a Narrative Identity (domain + subject):
 *      "what is this beat fundamentally about?"
 *   3. Group beats into threads by identity — a beat joins a chapter only
 *      when it supports that chapter's story (same domain, same subject).
 *   4. Split threads on hard time gaps.
 *   5. A cluster with no clear identity is NOT assembled into a chapter
 *      unless its anchor is independently significant on its own.
 *
 * Similarity never merges across identities: a romance beat about one
 * person never joins a chapter about another, and errands never pad out
 * a breakup story.
 */

import { isPublishableLifeLogTitle } from '../events/lifeLogEligibilityPolicy';
import {
  castOf,
  classifySceneNarrative,
  PERSON_DOMAINS,
  type ChapterSceneInput,
  type NarrativeIdentity,
} from './narrativeIdentity';
import {
  collectEvidence,
  declareOwnership,
  type NarrativeOwnership,
  type SceneNarrativeContribution,
} from './narrativeOwnership';

export type {
  ChapterSceneInput,
  NarrativeDomain,
  NarrativeIdentity,
} from './narrativeIdentity';
export { classifySceneNarrative } from './narrativeIdentity';

/** Hard split when beats of the same story are farther apart than this (45 days). */
export const CHAPTER_HARD_GAP_MS = 45 * 24 * 60 * 60 * 1000;

/** Near-duplicate scenes within this window collapse into one beat (7 days). */
export const CHAPTER_DEDUPE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Identity-less singletons need this much scene significance to stand alone. */
export const CHAPTER_ORPHAN_MIN_SIGNIFICANCE = 60;

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
  narrative: NarrativeIdentity & { anchorSceneId: string | null };
  ownership: NarrativeOwnership;
  contributions: SceneNarrativeContribution[];
};

/** A beat: one distinct experience, possibly backed by several duplicate scene rows. */
type Beat = {
  scenes: ChapterSceneInput[];
  anchor: ChapterSceneInput;
  identity: NarrativeIdentity;
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

function sceneBlob(scene: ChapterSceneInput): string {
  return `${scene.title} ${scene.summary} ${scene.primaryGoal ?? ''} ${(scene.themes ?? []).join(' ')}`.toLowerCase();
}

/**
 * Thread key: the story a beat belongs to. Person domains split per subject —
 * a romance beat about one person can never share a thread with another's.
 * Career and social_scene split per setting so distinct workplaces / venues
 * keep distinct chapters.
 */
function threadKey(identity: NarrativeIdentity, scene: ChapterSceneInput): string {
  if (PERSON_DOMAINS.has(identity.domain)) {
    return `${identity.domain}:${identity.subject ?? ''}`;
  }
  if (identity.domain === 'career' || identity.domain === 'social_scene') {
    return `${identity.domain}:${normalizeToken(scene.location ?? '')}`;
  }
  return identity.domain;
}

// ---------------------------------------------------------------------------
// Dedupe: near-identical scenes collapse into one beat
// ---------------------------------------------------------------------------

const TITLE_NOISE = /^(?:went to|going to|visit to|visited|a visit to|trip to|a night at|night at|at)\s+/;

function coreTitle(scene: ChapterSceneInput): string {
  return normalizeToken(compact(scene.title).toLowerCase().replace(TITLE_NOISE, ''));
}

function isDuplicateScene(a: ChapterSceneInput, b: ChapterSceneInput): boolean {
  const ca = coreTitle(a);
  const cb = coreTitle(b);
  if (!ca || ca !== cb) return false;
  const ta = sceneSortTime(a);
  const tb = sceneSortTime(b);
  if (ta && tb && Math.abs(ta - tb) > CHAPTER_DEDUPE_WINDOW_MS) return false;
  const la = normalizeToken(a.location ?? '');
  const lb = normalizeToken(b.location ?? '');
  return !la || !lb || la === lb;
}

function dedupeIntoBeats(scenes: ChapterSceneInput[]): Beat[] {
  const beats: Beat[] = [];
  for (const scene of scenes) {
    const existing = beats.find((beat) => isDuplicateScene(beat.anchor, scene));
    if (existing) {
      existing.scenes.push(scene);
      if ((scene.significanceScore ?? 0) > (existing.anchor.significanceScore ?? 0)) {
        existing.anchor = scene;
      }
      continue;
    }
    beats.push({ scenes: [scene], anchor: scene, identity: classifySceneNarrative(scene) });
  }
  // Re-classify anchors that changed during merging.
  for (const beat of beats) beat.identity = classifySceneNarrative(beat.anchor);
  return beats;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * Does `next` continue the story `prev` belongs to? True only when both share
 * one narrative identity (domain + subject) and sit within the hard time gap.
 */
export function shouldMergeScenes(prev: ChapterSceneInput, next: ChapterSceneInput): boolean {
  const keyPrev = threadKey(classifySceneNarrative(prev), prev);
  const keyNext = threadKey(classifySceneNarrative(next), next);
  if (keyPrev !== keyNext) return false;
  const tPrev = ms(prev.timeEnd) ?? ms(prev.timeStart);
  const tNext = ms(next.timeStart) ?? ms(next.timeEnd);
  if (tPrev != null && tNext != null && Math.abs(tNext - tPrev) > CHAPTER_HARD_GAP_MS) return false;
  return true;
}

/**
 * Cluster scenes into chapters, one story per chapter.
 */
export function assembleChaptersFromScenes(scenes: ChapterSceneInput[]): AssembledChapter[] {
  if (scenes.length === 0) return [];

  const ordered = [...scenes].sort((a, b) => sceneSortTime(a) - sceneSortTime(b));
  const beats = dedupeIntoBeats(ordered);

  // Group beats into narrative threads.
  const threads = new Map<string, Beat[]>();
  for (const beat of beats) {
    const key = threadKey(beat.identity, beat.anchor);
    const list = threads.get(key);
    if (list) list.push(beat);
    else threads.set(key, [beat]);
  }

  const chapters: AssembledChapter[] = [];
  for (const thread of threads.values()) {
    // Split one story into separate chapters across hard time gaps.
    const clusters: Beat[][] = [];
    let current: Beat[] = [thread[0]];
    for (let i = 1; i < thread.length; i++) {
      const prev = current[current.length - 1];
      const next = thread[i];
      const tPrev = ms(prev.anchor.timeEnd) ?? ms(prev.anchor.timeStart);
      const tNext = ms(next.anchor.timeStart) ?? ms(next.anchor.timeEnd);
      if (tPrev != null && tNext != null && Math.abs(tNext - tPrev) > CHAPTER_HARD_GAP_MS) {
        clusters.push(current);
        current = [next];
      } else {
        current.push(next);
      }
    }
    clusters.push(current);

    for (const cluster of clusters) {
      const chapter = buildChapter(cluster);
      if (chapter) chapters.push(chapter);
    }
  }

  chapters.sort((a, b) => (ms(a.timeStart) ?? 0) - (ms(b.timeStart) ?? 0));
  return chapters;
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

/**
 * Build one chapter from one story's beats.
 *
 * After identity threading, Narrative Ownership decides the contract and
 * Evidence Collection keeps only scenes that strengthen that story.
 * Returns null when ownership cannot be declared or no supporting evidence remains.
 */
function buildChapter(cluster: Beat[]): AssembledChapter | null {
  const anchor = [...cluster].sort(
    (a, b) => (b.anchor.significanceScore ?? 0) - (a.anchor.significanceScore ?? 0),
  )[0];
  const identity = anchor.identity;

  if (identity.domain === 'unknown') {
    const anchorSignificant =
      (anchor.anchor.significanceScore ?? 0) >= CHAPTER_ORPHAN_MIN_SIGNIFICANCE ||
      Boolean(anchor.anchor.promotedEventId);
    if (cluster.length === 1 && !anchorSignificant) return null;
    if (cluster.length > 1) {
      // Multiple identity-less beats are an index, not a story. Keep only a
      // significant anchor as its own single-beat chapter.
      if (!anchorSignificant) return null;
      cluster = [anchor];
    }
  }

  const candidateScenes = cluster.flatMap((b) => b.scenes);
  const ownership = declareOwnership(identity, candidateScenes);
  if (!ownership?.primaryNarrative.trim()) return null;

  const evidence = collectEvidence(ownership, candidateScenes);
  // Chapter defines membership: only supporting scenes become the chapter body.
  const scenes = evidence.supporting.length > 0 ? evidence.supporting : [];
  if (scenes.length === 0) return null;

  const participants = Array.from(new Set(scenes.flatMap((s) => castOf(s))));
  // Subject leads the cast.
  if (identity.subject) {
    const idx = participants.indexOf(identity.subject);
    if (idx > 0) {
      participants.splice(idx, 1);
      participants.unshift(identity.subject);
    }
  }

  const locations = scenes.map((s) => s.location).filter((x): x is string => Boolean(x));
  const location = pickDominant(locations);

  const starts = scenes.map((s) => s.timeStart).filter((x): x is string => Boolean(x));
  const ends = scenes.map((s) => s.timeEnd ?? s.timeStart).filter((x): x is string => Boolean(x));
  const timeStart = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null;
  const timeEnd = ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : null;

  const eventIds = Array.from(
    new Set(scenes.map((s) => s.promotedEventId).filter((x): x is string => Boolean(x))),
  );

  // Themes flow from ownership, never the other way around.
  const themeSet = new Set<string>([ownership.domain]);
  themeSet.delete('unknown');
  const themes = [...themeSet].slice(0, 4);

  const emotions = scenes.map((s) => s.dominantEmotion).filter((x): x is string => Boolean(x));
  const dominantEmotion = pickDominant(emotions);

  const title = deriveChapterTitle({
    identity,
    ownership,
    anchor: anchor.anchor,
    location,
  });
  const summary = scenes
    .map((s) => compact(s.title || s.summary))
    .filter(Boolean)
    .join(' · ')
    .slice(0, 600);
  const thesis = ownership.primaryNarrative;

  const confidence = Math.min(
    0.95,
    0.4 +
      scenes.length * 0.1 +
      (ownership.domain !== 'unknown' ? 0.1 : 0) +
      (ownership.primarySubject ? 0.08 : 0) +
      (ownership.primaryOutcome ? 0.08 : 0) +
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
    narrative: { ...identity, anchorSceneId: anchor.anchor.id },
    ownership,
    contributions: evidence.contributions,
  };
}

export function deriveChapterTitle(input: {
  identity: NarrativeIdentity;
  ownership?: NarrativeOwnership | null;
  anchor: ChapterSceneInput;
  location: string | null;
}): string {
  const { identity, ownership, anchor, location } = input;
  const subject = ownership?.primarySubject ?? identity.subjectLabel;
  const anchorBlob = sceneBlob(anchor);
  const outcome = ownership?.primaryOutcome ?? '';

  const candidates: string[] = [];
  switch (identity.domain) {
    case 'romance':
      if (subject && /no contact|separation/i.test(outcome)) {
        candidates.push(`The end of your relationship with ${subject}`);
      }
      if (subject && /\b(?:blocked|breakup|broke up|ghost|no contact)\b/.test(anchorBlob)) {
        candidates.push(`Falling out with ${subject}`);
      }
      if (subject) candidates.push(`Relationship with ${subject}`);
      candidates.push('A romance chapter');
      break;
    case 'family':
      if (subject) candidates.push(`Time with ${subject}`);
      candidates.push('Family life');
      break;
    case 'friends':
      if (subject) candidates.push(`Hanging out with ${subject}`);
      candidates.push('Time with friends');
      break;
    case 'career':
      candidates.push(location ? `Work life at ${location}` : 'Work life');
      break;
    case 'creative': {
      // Data-driven project name from the anchor, e.g. "Building MemoVault".
      const project = anchor.title.match(/\b(?:building|built|working on|worked on)\s+([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)?)/i);
      if (project?.[1]) candidates.push(`Building ${compact(project[1])}`);
      candidates.push('Creative work');
      break;
    }
    case 'social_scene':
      candidates.push(location ? `Nights out at ${location}` : 'Nights out');
      break;
    case 'health':
      candidates.push('A health chapter');
      break;
    case 'education':
      candidates.push('School days');
      break;
    case 'travel':
      candidates.push(location ? `Trip to ${location}` : 'A trip');
      break;
    case 'finances':
      candidates.push('Money matters');
      break;
    case 'errands':
      candidates.push('Errands and daily life');
      break;
    default:
      break;
  }
  if (anchor.title) candidates.push(compact(anchor.title));

  for (const candidate of candidates) {
    if (candidate && isPublishableLifeLogTitle(candidate)) return candidate;
  }
  return compact(anchor.title).slice(0, 80) || 'Untitled chapter';
}
