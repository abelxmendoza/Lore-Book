/**
 * Chapter significance — Scenes combine into a life period worth keeping.
 *
 * Chapters are always durable once assembled; this score ranks / filters
 * thin single-scene noise when desired by callers.
 */

import type { AssembledChapter } from './chapterAssembler';
import { mayPublishOwnedChapter } from './narrativeValidation';

/** Soft floor: single weak scene chapters below this may be skipped. */
export const CHAPTER_MIN_SIGNIFICANCE = 35;

export type ChapterSignificanceResult = {
  allow: boolean;
  score: number;
  breakdown: {
    maxScene: number;
    meanScene: number;
    sceneCount: number;
    eventBonus: number;
    themeBonus: number;
    total: number;
  };
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function scoreChapterSignificance(chapter: AssembledChapter): ChapterSignificanceResult {
  const scores = chapter.scenes.map((s) => s.significanceScore ?? 0);
  const maxScene = scores.length ? Math.max(...scores) : 0;
  const meanScene = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const sceneCount = chapter.scenes.length;

  let eventBonus = 0;
  if (chapter.eventIds.length >= 1) eventBonus += 10;
  if (chapter.eventIds.length >= 2) eventBonus += 8;
  eventBonus = clamp(eventBonus, 0, 20);

  let themeBonus = 0;
  if (chapter.themes.length >= 2) themeBonus += 6;
  if (chapter.participants.length >= 1 && sceneCount >= 2) themeBonus += 6;
  if (chapter.location && sceneCount >= 2) themeBonus += 4;
  themeBonus = clamp(themeBonus, 0, 16);

  const countLift = sceneCount >= 3 ? 12 : sceneCount >= 2 ? 8 : 0;

  const total = clamp(
    Math.round(maxScene * 0.4 + meanScene * 0.25 + eventBonus + themeBonus + countLift),
    0,
    100,
  );

  // High-stakes owned singles (breakup, shipping work, mood collapses, etc.)
  // are real stories even when only one scene has landed yet.
  const domain = chapter.ownership?.domain;
  const highStakesSingle =
    sceneCount === 1 &&
    ((domain === 'romance' || domain === 'career' || domain === 'creative') &&
      (Boolean(chapter.ownership?.primaryOutcome) || maxScene >= 30) ||
      (domain === 'health' && maxScene >= 18));

  // Persist multi-scene chapters always; single-scene needs weight, an event,
  // or a clear owned high-stakes beat.
  const allow =
    Boolean(chapter.title.trim()) &&
    (sceneCount >= 2 ||
      chapter.eventIds.length > 0 ||
      total >= CHAPTER_MIN_SIGNIFICANCE ||
      highStakesSingle);

  return {
    allow,
    score: total,
    breakdown: {
      maxScene,
      meanScene,
      sceneCount,
      eventBonus,
      themeBonus,
      total,
    },
  };
}

export function mayPersistChapter(chapter: AssembledChapter): ChapterSignificanceResult {
  const scored = scoreChapterSignificance(chapter);
  const ownership = mayPublishOwnedChapter(chapter);
  if (!ownership.allow) {
    return {
      ...scored,
      allow: false,
      breakdown: {
        ...scored.breakdown,
        // Keep numeric breakdown; callers log ownership.reasons separately via metadata.
      },
    };
  }
  return scored;
}
