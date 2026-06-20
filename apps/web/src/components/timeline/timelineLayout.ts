/** Minimum horizontal gap between adjacent event card edges (px). */
export const TIMELINE_CARD_GAP_PX = 20;

/** Horizontal padding inside the track (px, each side). */
export function timelineTrackPaddingPx(isMobile: boolean): number {
  return isMobile ? 12 : 24;
}

/** Event card width on the horizontal generated timeline (px). */
export function timelineCardWidthPx(isMobile: boolean): number {
  return isMobile ? 132 : 168;
}

/**
 * Minimum track inner width so n cards can sit side-by-side without overlapping.
 */
export function timelineTrackMinWidthPx(eventCount: number, isMobile: boolean): number {
  const pad = timelineTrackPaddingPx(isMobile) * 2;
  const cardWidth = timelineCardWidthPx(isMobile);
  const base = isMobile ? 280 : 720;

  if (eventCount <= 1) return Math.max(base, cardWidth + pad);

  const minStep = cardWidth + TIMELINE_CARD_GAP_PX;
  const inner = (eventCount - 1) * minStep + cardWidth;
  return Math.max(base, inner + pad);
}

/**
 * Enforce minimum center-to-center spacing so cards never overlap horizontally.
 * Preserves chronological order; compresses toward the left if the track is full.
 */
export function spreadTimelineLeftPercentages(
  timeBasedLeftPct: number[],
  options: {
    trackWidthPx: number;
    cardWidthPx: number;
    edgePadPct: number;
    minGapPx?: number;
    trackPaddingPx?: number;
  },
): number[] {
  if (timeBasedLeftPct.length === 0) return [];

  const {
    trackWidthPx,
    cardWidthPx,
    edgePadPct,
    minGapPx = TIMELINE_CARD_GAP_PX,
    trackPaddingPx: padPx = 24,
  } = options;

  const innerWidthPx = Math.max(1, trackWidthPx - padPx * 2);
  const minStepPct = ((cardWidthPx + minGapPx) / innerWidthPx) * 100;

  const spread = [...timeBasedLeftPct];
  for (let i = 1; i < spread.length; i++) {
    if (spread[i] - spread[i - 1] < minStepPct) {
      spread[i] = spread[i - 1] + minStepPct;
    }
  }

  const maxPct = 100 - edgePadPct;
  const minPct = edgePadPct;
  const overflow = spread[spread.length - 1] - maxPct;

  if (overflow > 0) {
    for (let i = 0; i < spread.length; i++) {
      spread[i] -= overflow;
    }
    if (spread[0] < minPct) {
      const shift = minPct - spread[0];
      for (let i = 0; i < spread.length; i++) {
        spread[i] += shift;
      }
    }
  }

  return spread.map((pct) => Math.max(minPct, Math.min(maxPct, pct)));
}
