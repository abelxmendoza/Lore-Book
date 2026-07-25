/**
 * Initial viewport framing for horizontal timelines.
 * Open on the present: “today” sits near the right edge so recent past is in view.
 */

/** Where “today” sits in the viewport (0 = left, 1 = right). */
export const PRESENT_VIEWPORT_ANCHOR = 0.85;

/** ~1 calendar year across the canvas at BASE_PPD. */
export const PRESENT_WINDOW_DAYS = 365;

const DAY_MS = 86_400_000;

export function scrollLeftForPresent(
  todayX: number,
  clientWidth: number,
  anchor: number = PRESENT_VIEWPORT_ANCHOR,
): number {
  if (!Number.isFinite(todayX) || !Number.isFinite(clientWidth) || clientWidth <= 0) {
    return 0;
  }
  const a = Math.min(1, Math.max(0, anchor));
  return Math.max(0, todayX - clientWidth * a);
}

/** True when the viewport is already framed on “today” (within a few px). */
export function isNearPresentScroll(
  scrollLeft: number,
  todayX: number,
  clientWidth: number,
  thresholdPx = 48,
): boolean {
  if (!Number.isFinite(scrollLeft) || clientWidth <= 0) return true;
  const target = scrollLeftForPresent(todayX, clientWidth);
  return Math.abs(scrollLeft - target) <= thresholdPx;
}

/**
 * Fast ease-out scroll to a target scrollLeft.
 * Returns a cancel function. Honors prefers-reduced-motion with an instant jump.
 */
export function animateScrollLeft(
  el: HTMLElement,
  targetScrollLeft: number,
  durationMs = 280,
  onComplete?: () => void,
): () => void {
  const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
  const target = Math.max(0, Math.min(maxScroll, targetScrollLeft));
  const from = el.scrollLeft;
  const finish = () => {
    el.scrollLeft = target;
    onComplete?.();
  };
  if (Math.abs(from - target) < 1) {
    finish();
    return () => {};
  }

  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || durationMs <= 0) {
    const prev = el.style.scrollBehavior;
    el.style.scrollBehavior = 'auto';
    finish();
    el.style.scrollBehavior = prev;
    return () => {};
  }

  let raf = 0;
  let cancelled = false;
  const prevBehavior = el.style.scrollBehavior;
  el.style.scrollBehavior = 'auto';
  const started = performance.now();

  const tick = (now: number) => {
    if (cancelled) return;
    const t = Math.min(1, (now - started) / durationMs);
    // easeOutCubic — snappy finish over long distances
    const eased = 1 - (1 - t) ** 3;
    el.scrollLeft = from + (target - from) * eased;
    if (t < 1) {
      raf = requestAnimationFrame(tick);
    } else {
      el.style.scrollBehavior = prevBehavior;
      onComplete?.();
    }
  };
  raf = requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
    el.style.scrollBehavior = prevBehavior;
  };
}

/** Zoom so `windowDays` fills the viewport (clamped). */
export function zoomLevelForWindow(
  clientWidth: number,
  basePpd: number,
  minZoom: number,
  maxZoom: number,
  windowDays: number,
): number {
  const width = Math.max(120, clientWidth);
  const days = Math.max(1, windowDays);
  const next = (width - 60) / (days * basePpd);
  return Math.min(maxZoom, Math.max(minZoom, +next.toFixed(2)));
}

/** @deprecated Prefer zoomLevelForWindow — kept for call-site compatibility. */
export function presentYearZoomLevel(
  clientWidth: number,
  basePpd: number,
  minZoom: number,
  maxZoom: number,
  windowDays: number = PRESENT_WINDOW_DAYS,
): number {
  return zoomLevelForWindow(clientWidth, basePpd, minZoom, maxZoom, windowDays);
}

/** Calendar date under the horizontal center of the scroll viewport. */
export function dateAtViewportCenter(
  scrollLeft: number,
  clientWidth: number,
  timelineStart: Date,
  ppd: number,
): Date {
  if (!Number.isFinite(scrollLeft) || !Number.isFinite(clientWidth) || clientWidth <= 0 || !(ppd > 0)) {
    return new Date(timelineStart.getTime());
  }
  const centerX = scrollLeft + clientWidth / 2;
  const days = centerX / ppd;
  return new Date(timelineStart.getTime() + days * DAY_MS);
}

/** Year shown above swimlanes — updates when the viewport center crosses a year. */
export function yearAtViewportCenter(
  scrollLeft: number,
  clientWidth: number,
  timelineStart: Date,
  ppd: number,
): number {
  return dateAtViewportCenter(scrollLeft, clientWidth, timelineStart, ppd).getFullYear();
}
