import { describe, expect, it } from 'vitest';
import {
  PRESENT_VIEWPORT_ANCHOR,
  isNearPresentScroll,
  presentYearZoomLevel,
  scrollLeftForPresent,
  yearAtViewportCenter,
  zoomLevelForWindow,
} from './timelinePresentViewport';

describe('scrollLeftForPresent', () => {
  it('anchors today near the right edge of the viewport', () => {
    const todayX = 10_000;
    const clientWidth = 1_000;
    expect(scrollLeftForPresent(todayX, clientWidth)).toBe(
      todayX - clientWidth * PRESENT_VIEWPORT_ANCHOR,
    );
  });

  it('never scrolls past the start', () => {
    expect(scrollLeftForPresent(100, 1_000)).toBe(0);
  });

  it('returns 0 when the canvas is not laid out yet', () => {
    expect(scrollLeftForPresent(5_000, 0)).toBe(0);
    expect(scrollLeftForPresent(Number.NaN, 800)).toBe(0);
  });
});

describe('isNearPresentScroll', () => {
  it('is true when already framed on today', () => {
    const todayX = 10_000;
    const clientWidth = 1_000;
    const target = scrollLeftForPresent(todayX, clientWidth);
    expect(isNearPresentScroll(target, todayX, clientWidth)).toBe(true);
    expect(isNearPresentScroll(target + 10, todayX, clientWidth)).toBe(true);
  });

  it('is false when scrolled years into the past', () => {
    expect(isNearPresentScroll(200, 10_000, 1_000)).toBe(false);
  });
});

describe('zoomLevelForWindow', () => {
  it('fits the requested window days in the viewport', () => {
    const month = zoomLevelForWindow(860, 3, 0.3, 8, 31);
    const year = zoomLevelForWindow(860, 3, 0.3, 8, 365);
    expect(month).toBeGreaterThan(year);
    expect(year).toBeCloseTo(0.73, 1);
  });

  it('clamps to min/max zoom', () => {
    expect(zoomLevelForWindow(40, 3, 0.3, 8, 365)).toBe(0.3);
    expect(zoomLevelForWindow(20_000, 3, 0.3, 8, 365)).toBe(8);
  });
});

describe('presentYearZoomLevel', () => {
  it('matches zoomLevelForWindow for a year', () => {
    expect(presentYearZoomLevel(860, 3, 0.3, 8)).toBe(
      zoomLevelForWindow(860, 3, 0.3, 8, 365),
    );
  });
});

describe('yearAtViewportCenter', () => {
  const start = new Date(2024, 0, 1); // Jan 1 2024 local
  const ppd = 2; // 2px/day → 730px/year

  it('reports the year under the viewport center', () => {
    // Center at day 100 of 2024
    expect(yearAtViewportCenter(0, 200, start, ppd)).toBe(2024);
  });

  it('flips when the center crosses into the next year', () => {
    // 2024 is leap: day 366 from Jan 1 → Jan 1 2025. x = 366 * 2 = 732
    expect(yearAtViewportCenter(631, 200, start, ppd)).toBe(2024);
    expect(yearAtViewportCenter(632, 200, start, ppd)).toBe(2025);
  });
});
