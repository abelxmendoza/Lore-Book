/**
 * Era significance — Chapters combine into a life period worth keeping.
 */

import type { AssembledEra } from './eraAssembler';

/** Soft floor for single-chapter eras without much evidence. */
export const ERA_MIN_SIGNIFICANCE = 40;

export type EraSignificanceResult = {
  allow: boolean;
  score: number;
  breakdown: {
    maxChapter: number;
    meanChapter: number;
    chapterCount: number;
    eventBonus: number;
    themeBonus: number;
    total: number;
  };
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function scoreEraSignificance(era: AssembledEra): EraSignificanceResult {
  const scores = era.chapters.map((c) => c.significanceScore ?? 0);
  const maxChapter = scores.length ? Math.max(...scores) : 0;
  const meanChapter = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const chapterCount = era.chapters.length;

  let eventBonus = 0;
  if (era.eventIds.length >= 1) eventBonus += 8;
  if (era.eventIds.length >= 3) eventBonus += 8;
  eventBonus = clamp(eventBonus, 0, 18);

  let themeBonus = 0;
  if (era.themes.length >= 2) themeBonus += 6;
  if (era.participants.length >= 1 && chapterCount >= 2) themeBonus += 6;
  if (era.location && chapterCount >= 2) themeBonus += 4;
  themeBonus = clamp(themeBonus, 0, 16);

  const countLift = chapterCount >= 3 ? 14 : chapterCount >= 2 ? 10 : 0;

  const total = clamp(
    Math.round(maxChapter * 0.4 + meanChapter * 0.25 + eventBonus + themeBonus + countLift),
    0,
    100,
  );

  // Multi-scene eras are experiences already — don't require a second chapter.
  const allow =
    Boolean(era.title.trim()) &&
    (chapterCount >= 2 ||
      era.eventIds.length >= 2 ||
      era.sceneIds.length >= 3 ||
      total >= ERA_MIN_SIGNIFICANCE + 10);

  return {
    allow,
    score: total,
    breakdown: {
      maxChapter,
      meanChapter,
      chapterCount,
      eventBonus,
      themeBonus,
      total,
    },
  };
}

export function mayPersistEra(era: AssembledEra): EraSignificanceResult {
  return scoreEraSignificance(era);
}
