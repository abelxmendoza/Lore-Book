/**
 * Scene significance — Low + Low + Low can equal a very important day.
 *
 * Events promote from Scenes (not individual Moments).
 */

import {
  EVENT_SIGNIFICANCE_THRESHOLD,
  scoreEventSignificance,
  type SignificanceBreakdown,
} from './eventSignificance';
import type { AssembledScene } from './sceneAssembler';

export { EVENT_SIGNIFICANCE_THRESHOLD as SCENE_EVENT_PROMOTION_THRESHOLD };

export type SceneSignificanceResult = {
  allow: boolean;
  score: number;
  breakdown: {
    maxMoment: number;
    meanMoment: number;
    synergy: number;
    diversity: number;
    compositeText: SignificanceBreakdown;
    total: number;
  };
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Score a scene from its member moments + combined narrative text.
 *
 * Synergy: multiple related low-score moments boost above any single moment.
 */
export function scoreSceneSignificance(scene: AssembledScene): SceneSignificanceResult {
  const momentScores = scene.moments.map((m) => m.significanceScore ?? 0);
  const maxMoment = momentScores.length ? Math.max(...momentScores) : 0;
  const meanMoment = momentScores.length
    ? momentScores.reduce((a, b) => a + b, 0) / momentScores.length
    : 0;

  // Diversity of activity cues across moments
  const blob = scene.summary.toLowerCase();
  let diversity = 0;
  if (/\b(?:drove|went|trip|visit)\b/.test(blob)) diversity += 3;
  if (/\b(?:bought|spent|costco|grocer|shop)\b/.test(blob)) diversity += 3;
  if (/\b(?:hung out|with|abuela|grandmother|friend|family)\b/.test(blob)) diversity += 4;
  if (/\b(?:built|worked on|coded|lore\s*book|memovault)\b/.test(blob)) diversity += 3;
  if (/\b(?:home|came home|returned)\b/.test(blob)) diversity += 2;
  diversity = clamp(diversity, 0, 14);

  // Synergy: n moments that individually wouldn't promote can form a day
  const n = scene.moments.length;
  let synergy = 0;
  if (n >= 2) synergy += 8;
  if (n >= 3) synergy += 10;
  if (n >= 4) synergy += 8;
  if (scene.participants.length >= 1 && n >= 2) synergy += 6;
  if (scene.location && n >= 2) synergy += 5;
  // Same-day cluster bonus when mean is modest but count is high
  if (meanMoment < EVENT_SIGNIFICANCE_THRESHOLD && n >= 3) synergy += 12;
  synergy = clamp(synergy, 0, 40);

  const compositeText = scoreEventSignificance({
    text: `${scene.title}. ${scene.summary}`,
    conversationCount: 1,
  });

  // Combine: don't just take max — lift with synergy + diversity + composite.
  const total = clamp(
    Math.round(
      maxMoment * 0.35 +
        meanMoment * 0.2 +
        compositeText.total * 0.25 +
        synergy +
        diversity,
    ),
    0,
    100,
  );

  return {
    allow: total >= EVENT_SIGNIFICANCE_THRESHOLD && Boolean(scene.title.trim()),
    score: total,
    breakdown: {
      maxMoment,
      meanMoment,
      synergy,
      diversity,
      compositeText,
      total,
    },
  };
}

export function mayPromoteSceneToEvent(scene: AssembledScene): SceneSignificanceResult {
  return scoreSceneSignificance(scene);
}
