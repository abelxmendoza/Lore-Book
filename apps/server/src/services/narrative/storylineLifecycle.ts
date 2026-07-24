/**
 * Storyline Lifecycle — status, momentum and intensity for a Storyline
 * (narrative_story_chapters row), computed live from fields already stored
 * on the row. No new extraction, no persistence — always fresh at read time.
 */

import { CHAPTER_HARD_GAP_MS } from './chapterAssembler';
import { LIFE_CHAPTER_HARD_GAP_MS } from './lifeChapterAssembler';

export type StorylineStatus = 'emerging' | 'active' | 'dormant' | 'completed' | 'abandoned' | 'resurfaced';
export type StorylineMomentum = 'increasing' | 'steady' | 'decreasing';

export type StorylineLifecycleResult = {
  status: StorylineStatus;
  momentum: StorylineMomentum;
  intensityScore: number;
};

export type StorylineLifecycleInput = {
  id: string;
  timeStart: string | null;
  timeEnd: string | null;
  sceneCount: number;
  significanceScore: number;
  confidence: number;
  primaryOutcome: string | null;
  domain: string | null;
  primarySubject: string | null;
};

/** Resolution language: the storyline reached a natural end. */
const COMPLETION_OUTCOME_RE = /\b(no contact|separation|release|left the role)\b/i;

const EMERGING_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function daysSince(iso: string | null, nowMs: number): number | null {
  const t = ms(iso);
  if (t == null) return null;
  return Math.max(0, Math.floor((nowMs - t) / 86_400_000));
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Piecewise recency decay: fresh activity scores near 100, old activity trails to 0. */
function recencyDecay(daysSinceEnd: number | null): number {
  if (daysSinceEnd == null) return 30;
  if (daysSinceEnd <= 7) return 100;
  if (daysSinceEnd <= 14) return 85;
  if (daysSinceEnd <= 30) return 65;
  if (daysSinceEnd <= 45) return 45;
  if (daysSinceEnd <= 90) return 25;
  if (daysSinceEnd <= 270) return 10;
  return 0;
}

function computeMomentum(daysSinceEnd: number | null, sceneCount: number): StorylineMomentum {
  if (daysSinceEnd != null && daysSinceEnd <= 7 && sceneCount >= 2) return 'increasing';
  if (daysSinceEnd != null && daysSinceEnd > 30) return 'decreasing';
  return 'steady';
}

function computeStatus(
  input: StorylineLifecycleInput,
  daysSinceEnd: number | null,
  daysSinceStart: number | null,
): StorylineStatus {
  if (input.primaryOutcome && COMPLETION_OUTCOME_RE.test(input.primaryOutcome)) return 'completed';

  const gapMsSinceEnd = daysSinceEnd != null ? daysSinceEnd * 86_400_000 : null;
  if (gapMsSinceEnd != null && gapMsSinceEnd > LIFE_CHAPTER_HARD_GAP_MS) return 'abandoned';
  if (gapMsSinceEnd != null && gapMsSinceEnd > CHAPTER_HARD_GAP_MS) return 'dormant';
  if (input.sceneCount <= 1 && daysSinceStart != null && daysSinceStart * 86_400_000 <= EMERGING_WINDOW_MS) {
    return 'emerging';
  }
  return 'active';
}

function sameThread(a: StorylineLifecycleInput, b: StorylineLifecycleInput): boolean {
  if (!a.domain || !b.domain || a.domain !== b.domain) return false;
  if (a.primarySubject || b.primarySubject) return a.primarySubject === b.primarySubject;
  return true;
}

/**
 * Compute lifecycle for one storyline. `siblings` (other storylines for the
 * same user) let a domain+subject thread that went dormant/abandoned and
 * later resumed report as 'resurfaced' rather than plain 'active'/'emerging'.
 */
export function computeStorylineLifecycle(
  input: StorylineLifecycleInput,
  siblings: StorylineLifecycleInput[] = [],
  now: number = Date.now(),
): StorylineLifecycleResult {
  const daysSinceEnd = daysSince(input.timeEnd ?? input.timeStart, now);
  const daysSinceStart = daysSince(input.timeStart, now);

  let status = computeStatus(input, daysSinceEnd, daysSinceStart);

  if (status === 'active' || status === 'emerging') {
    const priorEndMs = ms(input.timeStart);
    const hasEarlierDormantSibling = siblings.some((s) => {
      if (s.id === input.id || !sameThread(s, input)) return false;
      const sEnd = ms(s.timeEnd ?? s.timeStart);
      if (sEnd == null || priorEndMs == null) return false;
      return sEnd < priorEndMs && priorEndMs - sEnd > CHAPTER_HARD_GAP_MS;
    });
    if (hasEarlierDormantSibling) status = 'resurfaced';
  }

  const momentum = computeMomentum(daysSinceEnd, input.sceneCount);

  const recency = recencyDecay(daysSinceEnd);
  const frequencyScore = (Math.min(input.sceneCount, 5) / 5) * 100;
  const openLoopScore = input.primaryOutcome ? 0 : 100;

  const intensityScore = Math.round(
    clamp(
      input.significanceScore * 0.35 +
        input.confidence * 100 * 0.2 +
        recency * 0.25 +
        frequencyScore * 0.1 +
        openLoopScore * 0.1,
      0,
      100,
    ),
  );

  return { status, momentum, intensityScore };
}
