import { useEffect, useRef } from 'react';
import { useMockData } from '../contexts/MockDataContext';
import { useToast } from './ui/toast';
import {
  formatDemoToastMessage,
  type DemoEffectDetail,
} from '../services/demoMutationEffects';

/** Minimum gap between demo toasts so rapid edits do not stack. */
const TOAST_COOLDOWN_MS = 2800;
const TOAST_DURATION_MS = 3200;

/**
 * Surfaces demo mutations as a single, throttled toast (no title + subtitle pairs).
 * Ripples and session activity are handled in demoMutationEffects.ts.
 */
export function DemoMutationEffects() {
  const { runtimeDataMode, useMockData: isPopulated } = useMockData();
  const toast = useToast({ maxVisible: 1 });
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const lastToastAtRef = useRef(0);
  const pendingRef = useRef<DemoEffectDetail | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (runtimeDataMode !== 'DEMO' || !isPopulated) return;

    const flushPending = () => {
      flushTimerRef.current = null;
      const detail = pendingRef.current;
      if (!detail) return;
      pendingRef.current = null;
      lastToastAtRef.current = Date.now();
      toastRef.current.success(formatDemoToastMessage(detail), TOAST_DURATION_MS);
    };

    const onEffect = (event: Event) => {
      const detail = (event as CustomEvent<DemoEffectDetail>).detail;
      if (!detail?.title) return;

      const now = Date.now();
      const elapsed = now - lastToastAtRef.current;

      if (elapsed >= TOAST_COOLDOWN_MS) {
        if (flushTimerRef.current) {
          clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }
        pendingRef.current = null;
        lastToastAtRef.current = now;
        toastRef.current.success(formatDemoToastMessage(detail), TOAST_DURATION_MS);
        return;
      }

      // Coalesce rapid-fire actions: keep the latest message, show once cooldown ends.
      pendingRef.current = detail;
      if (!flushTimerRef.current) {
        flushTimerRef.current = setTimeout(flushPending, TOAST_COOLDOWN_MS - elapsed);
      }
    };

    window.addEventListener('lk:demo-effect', onEffect);
    return () => {
      window.removeEventListener('lk:demo-effect', onEffect);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, [runtimeDataMode, isPopulated]);

  return <toast.ToastContainer placement="demo" />;
}
