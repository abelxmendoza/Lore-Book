/**
 * ThreadSaveChip
 *
 * Compact cloud glyph for thread-level persistence (not app-wide backup).
 * Details live in the title tooltip — never wrap multi-line “Not backed up”.
 */

import { Cloud, CloudOff, CloudUpload, HardDrive } from 'lucide-react';
import { useThreadPersistenceState } from '../hooks/usePersistenceState';
import type { ThreadPersistenceState } from '../services/threadPersistenceTracker';
import { cloudGlyphForThreadState } from '../types/messageLifecycle';

interface Props {
  threadId: string | null | undefined;
}

const VISIBLE_STATES = new Set<ThreadPersistenceState>([
  'PERSIST_PENDING',
  'PERSISTING',
  'PERSISTED',
  'SYNC_FAILED',
  'OFFLINE_MODE',
  'LOCAL_ONLY',
]);

const DETAIL: Record<string, string> = {
  synced: 'This thread is synced to the cloud',
  syncing: 'This thread is syncing to the cloud',
  local: 'This thread is saved on this device only',
  failed: 'Cloud sync failed for this thread — retry from a failed message',
};

export function ThreadSaveChip({ threadId }: Props) {
  const record = useThreadPersistenceState(threadId);
  if (!record || !VISIBLE_STATES.has(record.state)) return null;

  const glyph = cloudGlyphForThreadState(record.state);
  if (glyph === 'hidden') return null;

  const Icon =
    glyph === 'synced'
      ? Cloud
      : glyph === 'syncing'
        ? CloudUpload
        : glyph === 'local'
          ? HardDrive
          : CloudOff;

  const className =
    glyph === 'synced'
      ? 'text-white/25'
      : glyph === 'syncing'
        ? 'text-white/40 animate-pulse'
        : glyph === 'local'
          ? 'text-amber-400/70'
          : 'text-red-400/80';

  return (
    <span
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${className}`}
      title={`${DETAIL[glyph]} (${record.state})`}
      aria-label={DETAIL[glyph]}
      data-testid="thread-save-chip"
      data-glyph={glyph}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </span>
  );
}
