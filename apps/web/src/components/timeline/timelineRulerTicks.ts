/**
 * Shared horizontal timeline ruler ticks — months with 'YY every 4 years.
 */

import type { RulerTick } from './TimelineDateDisplay';

export const RULER_QUAD_YEAR = 4;

export function getMonthsBetween(start: Date, end: Date): Date[] {
  const months: Date[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= endMonth) {
    months.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

/** Jan of years divisible by 4 — e.g. 2020, 2024, 2028. */
export function isQuadYearJanuary(d: Date): boolean {
  return d.getMonth() === 0 && d.getFullYear() % RULER_QUAD_YEAR === 0;
}

export function formatRulerMonthWithYear(d: Date): string {
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const yy = String(d.getFullYear()).slice(-2);
  return `${month} '${yy}`;
}

export function formatRulerMonthLabel(d: Date): { label: string; major: boolean } {
  if (isQuadYearJanuary(d)) {
    return { label: formatRulerMonthWithYear(d), major: true };
  }
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  return { label: month, major: d.getMonth() === 0 };
}

function firstQuadYearOnOrAfter(start: Date): number {
  let y = start.getFullYear();
  if (start.getMonth() > 0 || start.getDate() > 1) {
    y += 1;
  }
  while (y % RULER_QUAD_YEAR !== 0) y += 1;
  return y;
}

/** Sparse ruler: Jan '20, Jan '24, … every 4 years. */
export function buildQuadrennialAxisTicks(
  start: Date,
  end: Date,
  xOf: (d: Date) => number,
): RulerTick[] {
  const ticks: RulerTick[] = [];
  const firstYear = firstQuadYearOnOrAfter(start);
  for (let year = firstYear; year <= end.getFullYear() + RULER_QUAD_YEAR; year += RULER_QUAD_YEAR) {
    const d = new Date(year, 0, 1);
    if (d < start || d > end) continue;
    ticks.push({
      x: xOf(d),
      label: formatRulerMonthWithYear(d),
      major: true,
    });
  }
  return ticks;
}

/** Full month ruler; quad-year Jan labels include 'YY. */
export function buildMonthlyAxisTicks(
  start: Date,
  end: Date,
  xOf: (d: Date) => number,
): RulerTick[] {
  return getMonthsBetween(start, end).map((d) => {
    const { label, major } = formatRulerMonthLabel(d);
    return { x: xOf(d), label, major };
  });
}

/** Weekly ruler — Sunday starts; first week of each month marked major. */
export function buildWeeklyAxisTicks(
  start: Date,
  end: Date,
  xOf: (d: Date) => number,
): RulerTick[] {
  const ticks: RulerTick[] = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  cur.setDate(cur.getDate() - cur.getDay());
  while (cur <= end) {
    if (cur >= start) {
      const monthBoundary = cur.getDate() <= 7;
      ticks.push({
        x: xOf(cur),
        label: monthBoundary
          ? cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : String(cur.getDate()),
        major: monthBoundary,
      });
    }
    cur.setDate(cur.getDate() + 7);
  }
  return ticks;
}

/** Yearly ruler — Jan 1 labels as YYYY. */
export function buildYearlyAxisTicks(
  start: Date,
  end: Date,
  xOf: (d: Date) => number,
): RulerTick[] {
  const ticks: RulerTick[] = [];
  let y = start.getFullYear();
  if (start.getMonth() > 0 || start.getDate() > 1) y += 1;
  for (; y <= end.getFullYear(); y += 1) {
    const d = new Date(y, 0, 1);
    if (d < start) continue;
    ticks.push({
      x: xOf(d),
      label: String(y),
      major: true,
    });
  }
  return ticks;
}

export function buildSwimlaneAxisTicks(
  start: Date,
  end: Date,
  xOf: (d: Date) => number,
): RulerTick[] {
  return buildMonthlyAxisTicks(start, end, xOf);
}
