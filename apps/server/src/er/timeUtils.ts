/**
 * Time utilities for relationship strength, phase, and feature extraction.
 * Phase 3.1
 */

import { differenceInDays, parseISO } from 'date-fns';

/**
 * Exponential decay: e^(-daysSince * ln(2) / halfLifeDays).
 * At halfLifeDays, value is 0.5; at 2*halfLifeDays, 0.25; etc.
 */
export function expDecay(daysSince: number, halfLifeDays: number): number {
  if (halfLifeDays <= 0) return 0;
  return Math.exp(-daysSince * Math.LN2 / halfLifeDays);
}

/**
 * Days from a to b (b - a). Accepts Date or ISO string.
 */
export function daysBetween(a: Date | string, b: Date | string): number {
  const da = typeof a === 'string' ? parseISO(a) : a;
  const db = typeof b === 'string' ? parseISO(b) : b;
  return differenceInDays(db, da);
}
