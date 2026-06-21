import { useEffect, useRef } from 'react';

export interface VisiblePollingOptions {
  /** Fire the callback immediately on mount/enable (default true). */
  immediate?: boolean;
  /** Also fire once when the tab returns to visible after being hidden (default true). */
  runOnVisible?: boolean;
  /** Turn polling off entirely (e.g. demo mode, or a feature gate). */
  enabled?: boolean;
}

/**
 * Interval polling that respects page visibility.
 *
 * Ticks are SKIPPED while the tab is hidden — background tabs left open are the
 * dominant source of wasted API egress from always-mounted pollers (a 60s poll in
 * a forgotten tab is 1,440 requests/day for data nobody is looking at). When the
 * tab becomes visible again we fire once immediately so the user never sees stale
 * data on return.
 *
 * The callback is held in a ref so changing its identity does NOT tear down and
 * re-create the interval (avoids resubscribe storms when callers pass an inline or
 * useCallback function); only `intervalMs`/`enabled`/option changes restart it.
 */
export function useVisiblePolling(
  callback: () => void,
  intervalMs: number,
  options: VisiblePollingOptions = {},
): void {
  const { immediate = true, runOnVisible = true, enabled = true } = options;
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    if (!enabled) return;

    const isHidden = () =>
      typeof document !== 'undefined' && document.visibilityState === 'hidden';

    const tick = () => {
      if (isHidden()) return;
      savedCallback.current();
    };

    if (immediate) tick();
    const id = window.setInterval(tick, intervalMs);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') savedCallback.current();
    };
    if (runOnVisible && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    return () => {
      window.clearInterval(id);
      if (runOnVisible && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [intervalMs, immediate, runOnVisible, enabled]);
}
