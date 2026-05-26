import { useMockData } from '../contexts/MockDataContext';

/**
 * Renders a persistent top-of-page banner when the runtime is in DEMO mode.
 * In REAL or DEGRADED mode this renders nothing — silence is not the same as hiding.
 * Place once near the root of a page layout, not inside individual data components.
 */
export function DemoModeBanner() {
  const { runtimeDataMode } = useMockData();
  if (runtimeDataMode !== 'DEMO') return null;

  return (
    <div
      role="status"
      className="w-full bg-amber-500/15 border-b border-amber-500/30 px-4 py-1.5 flex items-center justify-center gap-2 text-xs text-amber-400/90 font-mono select-none"
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
      Demo Cognition Runtime — data is synthetic and does not reflect real memories
    </div>
  );
}
