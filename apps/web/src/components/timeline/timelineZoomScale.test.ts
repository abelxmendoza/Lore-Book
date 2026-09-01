import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ZOOM_SCALE_ID,
  buildAxisTicksForScale,
  getZoomScale,
  scaleFromZoom,
  zoomForScale,
} from './timelineZoomScale';

describe('timelineZoomScale', () => {
  const ctx = {
    clientWidth: 860,
    basePpd: 3,
    minZoom: 0.05,
    maxZoom: 8,
    totalDays: 3650,
  };

  it('resolves named scales', () => {
    expect(getZoomScale('month').windowDays).toBe(31);
    expect(getZoomScale('fit-life').windowDays).toBeUndefined();
    expect(getZoomScale('year').id).toBe(DEFAULT_ZOOM_SCALE_ID);
  });

  it('computes tighter zoom for shorter windows', () => {
    const month = zoomForScale('month', ctx);
    const year = zoomForScale('year', ctx);
    const five = zoomForScale('five-year', ctx);
    expect(month).toBeGreaterThan(year);
    expect(year).toBeGreaterThan(five);
  });

  it('fit-life uses totalDays', () => {
    const fit = zoomForScale('fit-life', ctx);
    const five = zoomForScale('five-year', ctx);
    // 10 years > 5 years → lower zoom
    expect(fit).toBeLessThan(five);
  });

  it('fit-life can go below the old 0.30 floor for multi-decade spans', () => {
    const longLife = zoomForScale('fit-life', {
      ...ctx,
      totalDays: 365 * 20, // ~20 years
    });
    expect(longLife).toBeLessThan(0.3);
    expect(longLife).toBeGreaterThanOrEqual(0.05);
  });

  it('maps raw zoom back to the nearest named scale', () => {
    const yearZoom = zoomForScale('year', ctx);
    expect(scaleFromZoom(yearZoom, ctx)).toBe('year');
    expect(scaleFromZoom(zoomForScale('month', ctx), ctx)).toBe('month');
    expect(scaleFromZoom(zoomForScale('fit-life', ctx), ctx)).toBe('fit-life');
  });

  it('builds week / year / month rulers', () => {
    const start = new Date(2024, 0, 1);
    const end = new Date(2024, 2, 31);
    const xOf = (d: Date) => d.getTime();

    const weeks = buildAxisTicksForScale('month', start, end, xOf);
    expect(weeks.length).toBeGreaterThan(8);
    expect(weeks.some((t) => t.major)).toBe(true);

    const months = buildAxisTicksForScale('season', start, end, xOf);
    expect(months.some((t) => t.label === 'Jan' || t.label.startsWith('Jan'))).toBe(true);

    const years = buildAxisTicksForScale('five-year', new Date(2020, 0, 1), new Date(2026, 0, 1), xOf);
    expect(years.map((t) => t.label)).toContain('2024');
  });
});
