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
  /** Chronological biographical beats (deduped retellings). */
  sceneIds: string[];
  /** All supporting scene rows to attach in the graph (includes collapsed dupes). */
  memberSceneIds: string[];
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
 * Career splits per workplace. Social-scene venues are settings inside one
 * nightlife story — do not split chapters by club name.
 */
function threadKey(identity: NarrativeIdentity, scene: ChapterSceneInput): string {
  if (PERSON_DOMAINS.has(identity.domain)) {
    return `${identity.domain}:${identity.subject ?? ''}`;
  }
  if (identity.domain === 'career') {
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

function coreSummary(scene: ChapterSceneInput): string {
  return normalizeToken(compact(scene.summary).toLowerCase().replace(TITLE_NOISE, '')).slice(0, 80);
}

function isDuplicateScene(a: ChapterSceneInput, b: ChapterSceneInput): boolean {
  const ta = sceneSortTime(a);
  const tb = sceneSortTime(b);
  const gap = ta && tb ? Math.abs(ta - tb) : 0;

  const ca = coreTitle(a);
  const cb = coreTitle(b);
  const titleMatch = Boolean(ca && ca === cb);

  const sa = coreSummary(a);
  const sb = coreSummary(b);
  const summaryMatch = Boolean(sa && sa === sb && sa.length >= 12);
  // Short exact retellings may land weeks apart; distinct nights with the same
  // venue title (different summaries) still use the 7-day window.
  const retellingMatch = summaryMatch && sa.length <= 48;

  if (!titleMatch && !retellingMatch) return false;
  const windowMs = retellingMatch ? CHAPTER_HARD_GAP_MS : CHAPTER_DEDUPE_WINDOW_MS;
  if (ta && tb && gap > windowMs) return false;

  const la = normalizeToken(a.location ?? '');
  const lb = normalizeToken(b.location ?? '');
  return !la || !lb || la === lb;
}

/** One biographical beat → one body scene (keep the strongest telling). */
function collapseBeatsToScenes(
  cluster: Beat[],
  supporting: ChapterSceneInput[],
): ChapterSceneInput[] {
  const supportingIds = new Set(supporting.map((s) => s.id));
  const body: ChapterSceneInput[] = [];
  for (const beat of cluster) {
    const inBeat = beat.scenes.filter((s) => supportingIds.has(s.id));
    if (inBeat.length === 0) continue;
    const best = [...inBeat].sort(
      (a, b) => (b.significanceScore ?? 0) - (a.significanceScore ?? 0),
    )[0];
    body.push(best);
  }
  return body.sort((a, b) => sceneSortTime(a) - sceneSortTime(b));
}

function formatSceneDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function chronologicalSummary(scenes: ChapterSceneInput[]): string {
  return scenes
    .map((s) => {
      const label = compact(s.title || s.summary);
      if (!label) return '';
      const when = formatSceneDate(s.timeStart ?? s.timeEnd);
      return when ? `${when}: ${label}` : label;
    })
    .filter(Boolean)
    .join(' → ')
    .slice(0, 700);
}

/** Only pin a venue when it clearly dominates the chapter body. */
function dominantChapterLocation(scenes: ChapterSceneInput[]): string | null {
  const located = scenes.filter((s) => Boolean(s.location?.trim()));
  if (located.length === 0) return null;
  if (located.length < Math.ceil(scenes.length / 2)) return null;
  const top = pickDominant(located.map((s) => s.location!));
  if (!top) return null;
  const topKey = normalizeToken(top);
  const agree = located.filter((s) => normalizeToken(s.location!) === topKey).length;
  return agree >= Math.ceil(located.length * 0.6) ? top : null;
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
  const subjectFromCluster = cluster.map((b) => b.identity).find((id) => id.subject);
  const ownershipIdentity: NarrativeIdentity =
    !identity.subject && subjectFromCluster?.subject
      ? {
          ...identity,
          subject: subjectFromCluster.subject,
          subjectLabel: subjectFromCluster.subjectLabel,
          statement: identity.statement,
        }
      : identity;

  const ownership = declareOwnership(ownershipIdentity, candidateScenes);
  if (!ownership?.primaryNarrative.trim()) return null;

  const evidence = collectEvidence(ownership, candidateScenes);
  // One scene per beat — retellings collapse so biographies stay chronological, not duplicated.
  const scenes = collapseBeatsToScenes(cluster, evidence.supporting);
  if (scenes.length === 0) return null;

  const participants = Array.from(new Set(scenes.flatMap((s) => castOf(s))));
  const subjectKey = ownershipIdentity.subject ?? ownership.primarySubject;
  if (subjectKey) {
    const normalized = normalizeToken(subjectKey);
    const idx = participants.findIndex((p) => p === normalized || p === subjectKey);
    if (idx > 0) {
      const [row] = participants.splice(idx, 1);
      participants.unshift(row);
    } else if (!participants.includes(normalized)) {
      participants.unshift(normalized);
    }
  }

  const location = dominantChapterLocation(scenes);

  const starts = scenes.map((s) => s.timeStart).filter((x): x is string => Boolean(x));
  const ends = scenes.map((s) => s.timeEnd ?? s.timeStart).filter((x): x is string => Boolean(x));
  const timeStart = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null;
  const timeEnd = ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : null;

  const eventIds = Array.from(
    new Set(scenes.map((s) => s.promotedEventId).filter((x): x is string => Boolean(x))),
  );

  const themeSet = new Set<string>([ownership.domain]);
  themeSet.delete('unknown');
  const themes = [...themeSet].slice(0, 4);

  const emotions = scenes.map((s) => s.dominantEmotion).filter((x): x is string => Boolean(x));
  const dominantEmotion = pickDominant(emotions);

  const title = deriveChapterTitle({
    identity: ownershipIdentity,
    ownership,
    anchor: anchor.anchor,
    location,
  });
  const summary = chronologicalSummary(scenes);
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
    memberSceneIds: evidence.supporting.map((s) => s.id),
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
    narrative: { ...ownershipIdentity, anchorSceneId: anchor.anchor.id },
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
      if (subject && /\b(?:costco|grocery|errand|shopping)\b/.test(anchorBlob)) {
        candidates.push(`Errands with ${subject}`);
      }
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
      const project = `${anchor.title} ${anchor.summary}`.match(
        /\b(?:building|built|build|working on|worked on)\s+([A-Z][\w'-]+)/,
      );
      if (project?.[1]) candidates.push(`Building ${compact(project[1])}`);
      candidates.push('Creative work');
      break;
    }
    case 'social_scene':
      // Venue is a setting, not the story title — one night at a named club
      // must not become the chapter (or era) name for the whole nightlife arc.
      candidates.push('Nights out');
      break;
    case 'health':
      if (/\b(?:depressed|depression)\b/.test(anchorBlob)) {
        candidates.push('A heavier stretch');
      }
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
