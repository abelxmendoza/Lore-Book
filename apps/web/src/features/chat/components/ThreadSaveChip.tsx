/**
 * ThreadSaveChip
 *
 * Subtle inline indicator showing the active thread's persistence state.
 * Answers the user's question: "was this ACTUALLY saved?"
 *
 * Only meaningful states are surfaced to the user (not RESTORED_FROM_* etc.)
 * — those are internal hydration semantics, not save confirmation.
 */

import { useThreadPersistenceState } from '../hooks/usePersistenceState';
import type { ThreadPersistenceState } from '../services/threadPersistenceTracker';

interface Props {
  threadId: string | null | undefined;
}

type VisibleState = Extract<
  ThreadPersistenceState,
  'PERSIST_PENDING' | 'PERSISTING' | 'PERSISTED' | 'SYNC_FAILED' | 'OFFLINE_MODE' | 'LOCAL_ONLY'
>;

const CHIP_CONFIG: Record<VisibleState, { label: string; className: string }> = {
  PERSISTED:       { label: '✓ Saved',    className: 'text-green-500/70' },
  PERSISTING:      { label: '↑ Saving…',  className: 'text-blue-400/80 animate-pulse' },
  PERSIST_PENDING: { label: '· Queued',   className: 'text-blue-400/50' },
  SYNC_FAILED:     { label: '⚠ Not saved',className: 'text-red-400' },
  OFFLINE_MODE:    { label: '○ Offline',  className: 'text-orange-400/80' },
  LOCAL_ONLY:      { label: '○ Local',    className: 'text-yellow-400/60' },
};

const VISIBLE_STATES = new Set<ThreadPersistenceState>([
  'PERSIST_PENDING', 'PERSISTING', 'PERSISTED', 'SYNC_FAILED', 'OFFLINE_MODE', 'LOCAL_ONLY',
]);

export function ThreadSaveChip({ threadId }: Props) {
  const record = useThreadPersistenceState(threadId);
  if (!record || !VISIBLE_STATES.has(record.state)) return null;

  const config = CHIP_CONFIG[record.state as VisibleState];
  if (!config) return null;

  return (
    <span
      className={`text-[10px] font-mono transition-all duration-500 select-none ${config.className}`}
      title={`Persistence: ${record.state} · hydrated from: ${record.hydrationSource}`}
    >
      {config.label}
    </span>
  );
}
