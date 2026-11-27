/**
 * Named calendar zoom ladder for Omni Timeline swimlanes.
 * Maps semantic scales (Month → Fit life) to zoom, ruler LOD, and render detail.
 */

import type { RulerTick } from './TimelineDateDisplay';
import {
  buildMonthlyAxisTicks,
  buildQuadrennialAxisTicks,
  buildWeeklyAxisTicks,
  buildYearlyAxisTicks,
} from './timelineRulerTicks';
import { presentYearZoomLevel } from './timelinePresentViewport';

export type TimelineZoomScaleId =
  | 'month'
  | 'season'
  | 'year'
  | 'five-year'
  | 'fit-life';

export type TimelineRulerPolicy = 'week' | 'month' | 'year' | 'quadyear';
export type TimelineEntryDetail = 'full' | 'compact' | 'clustered';
export type TimelineArcDetail = 'labelled' | 'summary';

export type TimelineZoomScale = {
  id: TimelineZoomScaleId;
  label: string;
  shortLabel: string;
  /** Omit for fit-life (uses totalDays). */
  windowDays?: number;
  ruler: TimelineRulerPolicy;
  entryDetail: TimelineEntryDetail;
  arcDetail: TimelineArcDetail;
  showEraBands: boolean;
  /** Cluster threshold in px — larger = more aggressive merging. */
  clusterPx: number;
};

export const TIMELINE_ZOOM_SCALES: readonly TimelineZoomScale[] = [
  {
    id: 'month',
    label: 'Month',
    shortLabel: '1M',
    windowDays: 31,
    ruler: 'week',
    entryDetail: 'full',
    arcDetail: 'labelled',
    showEraBands: false,
    clusterPx: 28,
  },
  {
    id: 'season',
    label: 'Season',
    shortLabel: '3M',
    windowDays: 120,
    ruler: 'month',
    entryDetail: 'compact',
    arcDetail: 'labelled',
    showEraBands: false,
    clusterPx: 40,
  },
  {
    id: 'year',
    label: 'Year',
    shortLabel: '1Y',
    windowDays: 365,
    ruler: 'month',
    entryDetail: 'compact',
    arcDetail: 'labelled',
    showEraBands: true,
    clusterPx: 52,
  },
  {
    id: 'five-year',
    label: '5 years',
    shortLabel: '5Y',
    windowDays: 1825,
    ruler: 'year',
    entryDetail: 'clustered',
    arcDetail: 'summary',
    showEraBands: true,
    clusterPx: 72,
  },
  {
    id: 'fit-life',
    label: 'Fit all',
    shortLabel: 'All',
    ruler: 'quadyear',
    entryDetail: 'clustered',
    arcDetail: 'summary',
    showEraBands: true,
    clusterPx: 96,
  },
] as const;

export const DEFAULT_ZOOM_SCALE_ID: TimelineZoomScaleId = 'year';

export function getZoomScale(id: TimelineZoomScaleId): TimelineZoomScale {
  return TIMELINE_ZOOM_SCALES.find((s) => s.id === id) ?? TIMELINE_ZOOM_SCALES[2];
}

export type ZoomForScaleContext = {
  clientWidth: number;
  basePpd: number;
  minZoom: number;
  maxZoom: number;
  totalDays: number;
};

/** Zoom multiplier so `windowDays` (or full life) fills the viewport. */
export function zoomForScale(
  scale: TimelineZoomScale | TimelineZoomScaleId,
  ctx: ZoomForScaleContext,
): number {
  const s = typeof scale === 'string' ? getZoomScale(scale) : scale;
  const windowDays =
    s.id === 'fit-life'
      ? Math.max(30, ctx.totalDays)
      : (s.windowDays ?? 365);
  return presentYearZoomLevel(
    ctx.clientWidth,
    ctx.basePpd,
    ctx.minZoom,
    ctx.maxZoom,
    windowDays,
  );
}

/**
 * Nearest named scale for the current zoom (wheel / +/-).
 * Compares against the zoom each scale would produce at this viewport.
 */
export function scaleFromZoom(
  zoom: number,
  ctx: ZoomForScaleContext,
): TimelineZoomScaleId {
  let bestId: TimelineZoomScaleId = DEFAULT_ZOOM_SCALE_ID;
  let bestDist = Number.POSITIVE_INFINITY;
  let bestWindow = 0;
  for (const scale of TIMELINE_ZOOM_SCALES) {
    const target = zoomForScale(scale, ctx);
    const dist = Math.abs(Math.log(Math.max(0.01, zoom)) - Math.log(Math.max(0.01, target)));
    const windowDays =
      scale.id === 'fit-life' ? Math.max(30, ctx.totalDays) : (scale.windowDays ?? 365);
    // Prefer closer match; on ties (common when multiple scales clamp to minZoom),
    // pick the wider window so Fit life wins over 5yr at the floor.
    if (dist < bestDist - 1e-9 || (Math.abs(dist - bestDist) < 1e-9 && windowDays > bestWindow)) {
      bestDist = dist;
      bestId = scale.id;
      bestWindow = windowDays;
    }
  }
  return bestId;
}

export function buildAxisTicksForScale(
  scale: TimelineZoomScale | TimelineZoomScaleId,
  start: Date,
  end: Date,
  xOf: (d: Date) => number,
): RulerTick[] {
  const s = typeof scale === 'string' ? getZoomScale(scale) : scale;
  switch (s.ruler) {
    case 'week':
      return buildWeeklyAxisTicks(start, end, xOf);
    case 'year':
      return buildYearlyAxisTicks(start, end, xOf);
    case 'quadyear':
      return buildQuadrennialAxisTicks(start, end, xOf);
    case 'month':
    default:
      return buildMonthlyAxisTicks(start, end, xOf);
  }
}

/** Gridline dates for the current ruler policy. */
export function gridlineDatesForScale(
  scale: TimelineZoomScale | TimelineZoomScaleId,
  start: Date,
  end: Date,
): Date[] {
  const s = typeof scale === 'string' ? getZoomScale(scale) : scale;
  switch (s.ruler) {
    case 'week':
      return collectWeeks(start, end);
    case 'year':
      return collectYears(start, end, 1);
    case 'quadyear':
      return collectYears(start, end, 4);
    case 'month':
    default:
      return collectMonths(start, end);
  }
}

function collectMonths(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= endMonth) {
    out.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

function collectYears(start: Date, end: Date, step: number): Date[] {
  const out: Date[] = [];
  let y = start.getFullYear();
  if (start.getMonth() > 0 || start.getDate() > 1) y += 1;
  while (y % step !== 0) y += 1;
  for (; y <= end.getFullYear(); y += step) {
    out.push(new Date(y, 0, 1));
  }
  return out;
}

function collectWeeks(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const day = cur.getDay();
  cur.setDate(cur.getDate() - day); // Sunday
  while (cur <= end) {
    if (cur >= start) out.push(new Date(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return out;
}
