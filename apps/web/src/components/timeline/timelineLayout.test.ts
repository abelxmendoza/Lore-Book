import { describe, expect, it } from 'vitest';
import {
  spreadTimelineLeftPercentages,
  timelineCardWidthPx,
  timelineTrackMinWidthPx,
} from './timelineLayout';

describe('timelineLayout', () => {
  it('computes track width that fits many cards', () => {
    const w = timelineTrackMinWidthPx(8, false);
    const card = timelineCardWidthPx(false);
    expect(w).toBeGreaterThanOrEqual(8 * card);
  });

  it('spreads overlapping time-based positions apart', () => {
    const trackWidth = timelineTrackMinWidthPx(5, false);
    const cardWidth = timelineCardWidthPx(false);
    const positions = spreadTimelineLeftPercentages([10, 12, 14, 16, 18], {
      trackWidthPx: trackWidth,
      cardWidthPx: cardWidth,
      edgePadPct: 8,
    });

    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }

    const innerWidth = trackWidth - 48;
    const minStepPct = ((cardWidth + 20) / innerWidth) * 100;
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i] - positions[i - 1]).toBeGreaterThanOrEqual(minStepPct - 0.01);
    }
  });

  it('keeps positions within edge padding', () => {
    const positions = spreadTimelineLeftPercentages([50, 50, 50], {
      trackWidthPx: timelineTrackMinWidthPx(3, true),
      cardWidthPx: timelineCardWidthPx(true),
      edgePadPct: 8,
      trackPaddingPx: 12,
    });

    for (const pct of positions) {
      expect(pct).toBeGreaterThanOrEqual(8);
      expect(pct).toBeLessThanOrEqual(92);
    }
  });
});
