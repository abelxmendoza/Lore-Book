import type { CertaintyLevel } from './responseCompilerTypes';

const UNCERTAIN_MARKERS = /\b(appears?|seems?|likely|maybe|might|could|probably|perhaps|possibly|I think|I guess|sort of|kind of)\b/i;
const LIKELY_MARKERS = /\b(often|usually|generally|tends? to|in many cases)\b/i;

export function detectCertainty(text: string): CertaintyLevel {
  const trimmed = text.trim();
  if (!trimmed) return 'uncertain';
  if (UNCERTAIN_MARKERS.test(trimmed)) return 'uncertain';
  if (LIKELY_MARKERS.test(trimmed)) return 'likely';
  return 'certain';
}

export function hasUncertaintyMarkers(text: string): boolean {
  return UNCERTAIN_MARKERS.test(text);
}

export function aggregateCertaintyScore(levels: CertaintyLevel[]): number {
  if (levels.length === 0) return 1;
  const weights: Record<CertaintyLevel, number> = {
    certain: 1,
    likely: 0.75,
    uncertain: 0.45,
  };
  const sum = levels.reduce((acc, l) => acc + weights[l], 0);
  return Math.round((sum / levels.length) * 100) / 100;
}
