/**
 * Canvas range / default scale from trustworthy chronology only.
 * Low-confidence / year-only / import-fallback outliers must not stretch the axis.
 */

import type { ChronologyEntry } from '../../types/timelineV2';
import type { LifeArc } from '../../hooks/useLifeArcs';
import type { TimelineZoomScaleId } from './timelineZoomScale';

const DAY_MS = 86_400_000;

export type RangeCandidate = {
  date: Date;
  confidence: number;
  precision: string;
  eligible: boolean;
};

export function isReliableChronologyEntry(entry: ChronologyEntry): boolean {
  const conf = entry.time_confidence ?? 0;
  const prec = entry.time_precision ?? 'approximate';
  if (conf < 0.6) return false;
  if (prec === 'year') return false;
  if ((entry.tags ?? []).some((t) => /^(recovered|import|imported)$/i.test(t))) return false;
  const t = new Date(entry.start_time).getTime();
  return Number.isFinite(t);
}

/** Occasions and zero-day pseudo-arcs do not define canvas range. */
export function isReliableArcForRange(arc: LifeArc): boolean {
  if (arc.arc_type === 'occasion') return false;
  if (arc.metadata && (arc.metadata as { omni_draw_bar?: boolean }).omni_draw_bar === false) {
    return false;
  }
  if (!arc.start_date) return false;
  const start = new Date(arc.start_date).getTime();
  const end = new Date(arc.end_date || arc.start_date).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  // Prefer multi-day arcs for range; same-day occasions already excluded
  return end - start >= DAY_MS || arc.arc_type === 'work' || arc.arc_type === 'life_era';
}

export function collectReliableDates(
  entries: ChronologyEntry[],
  arcs: LifeArc[],
): Date[] {
  const dates: Date[] = [];
  for (const e of entries) {
    if (!isReliableChronologyEntry(e)) continue;
    dates.push(new Date(e.start_time));
  }
  for (const a of arcs) {
    if (!isReliableArcForRange(a)) continue;
    dates.push(new Date(a.start_date!));
    if (a.end_date) dates.push(new Date(a.end_date));
  }
  return dates.filter((d) => Number.isFinite(d.getTime()));
}

export function computeReliableTimelineSpan(
  entries: ChronologyEntry[],
  arcs: LifeArc[],
  today = new Date(),
): { start: Date; end: Date; spanDays: number; usedFallback: boolean } {
  const dates = collectReliableDates(entries, arcs);
  if (dates.length === 0) {
    const start = new Date(today);
    start.setDate(start.getDate() - 45);
    return { start, end: today, spanDays: 45, usedFallback: true };
  }
  const min = new Date(Math.min(...dates.map((d) => d.getTime())));
  const max = new Date(Math.max(...dates.map((d) => d.getTime()), today.getTime()));
  // Pad a week on each side
  min.setDate(min.getDate() - 7);
  max.setDate(max.getDate() + 7);
  const spanDays = Math.max(14, Math.round((max.getTime() - min.getTime()) / DAY_MS));
  return { start: min, end: max, spanDays, usedFallback: false };
}

export function defaultScaleForSpanDays(spanDays: number): TimelineZoomScaleId {
  if (spanDays <= 45) return 'month';
  if (spanDays <= 120) return 'season';
  if (spanDays <= 400) return 'year';
  if (spanDays <= 2000) return 'five-year';
  return 'fit-life';
}

/** Whether an arc should be drawn as a swimlane duration bar. */
export function shouldDrawSwimlaneArcBar(arc: LifeArc): boolean {
  if (arc.arc_type === 'occasion') return false;
  if (arc.metadata && (arc.metadata as { omni_draw_bar?: boolean }).omni_draw_bar === false) {
    return false;
  }
  if (!arc.start_date) return false;
  const start = new Date(arc.start_date).getTime();
  const end = new Date(arc.end_date || arc.start_date).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  const days = Math.round((end - start) / DAY_MS);
  return days >= 2;
}
