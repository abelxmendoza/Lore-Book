/**
 * ConversationPersistenceInspector
 *
 * Dev-only runtime panel answering: "where does cognition truth live right now?"
 *
 * Shows per-thread persistence state, hydration source, sync lag,
 * pending message count, backend availability, and unsynced mutations.
 *
 * Only rendered when import.meta.env.DEV is true.
 * Toggle with Shift+P or the floating button.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { usePersistenceSnapshot, useBackendAvailability } from '../hooks/usePersistenceState';
import type { ThreadPersistenceRecord, ThreadPersistenceState } from '../services/threadPersistenceTracker';

const STATE_COLORS: Record<ThreadPersistenceState, string> = {
  LOCAL_ONLY:             'text-yellow-400',
  PERSIST_PENDING:        'text-blue-400',
  PERSISTING:             'text-blue-300 animate-pulse',
  PERSISTED:              'text-green-400',
  SYNC_FAILED:            'text-red-400',
  OFFLINE_MODE:           'text-orange-400',
  RESTORED_FROM_LOCAL:    'text-purple-400',
  RESTORED_FROM_BACKEND:  'text-cyan-400',
};

const STATE_LABELS: Record<ThreadPersistenceState, string> = {
  LOCAL_ONLY:             'LOCAL ONLY',
  PERSIST_PENDING:        'PENDING',
  PERSISTING:             'PERSISTING…',
  PERSISTED:              'PERSISTED ✓',
  SYNC_FAILED:            'SYNC FAILED ✗',
  OFFLINE_MODE:           'OFFLINE',
  RESTORED_FROM_LOCAL:    'FROM LOCAL',
  RESTORED_FROM_BACKEND:  'FROM BACKEND',
};

function relativeTime(ts: number | null): string {
  if (!ts) return '—';
  const diff = Math.round((Date.now() - ts) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return `${Math.round(diff / 3600)}h ago`;
}

function ThreadRow({ record, isActive }: { record: ThreadPersistenceRecord; isActive: boolean }) {
  const colorClass = STATE_COLORS[record.state] ?? 'text-white';
  const lag = record.lastPersistedAt && record.lastAttemptAt
    ? Math.max(0, record.lastAttemptAt - record.lastPersistedAt)
    : null;

  return (
    <div className={`border-b border-white/10 pb-2 mb-2 ${isActive ? 'bg-white/5 rounded px-1' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-white/50 text-[10px]">
          {isActive && <span className="text-primary mr-1">▶</span>}
          …{record.threadId.slice(-8)}
        </span>
        <span className={`text-[10px] font-semibold ${colorClass}`}>
          {STATE_LABELS[record.state]}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 mt-1 text-[10px] text-white/40">
        <span>source: <span className="text-white/70">{record.hydrationSource}</span></span>
        <span>pending: <span className="text-white/70">{record.pendingMessageCount}msg</span></span>
        <span>persisted: <span className="text-white/70">{relativeTime(record.lastPersistedAt)}</span></span>
        <span>attempt: <span className="text-white/70">{relativeTime(record.lastAttemptAt)}</span></span>
        {record.failCount > 0 && (
          <span className="text-red-400 col-span-2">fails: {record.failCount}</span>
        )}
        {lag !== null && lag > 0 && (
          <span className="text-white/40 col-span-2">sync lag: {lag}ms</span>
        )}
      </div>
    </div>
  );
}

export function ConversationPersistenceInspector() {
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const { threadId: activeThreadId } = useParams<{ threadId?: string }>();
  const records = usePersistenceSnapshot();
  const backendAvailable = useBackendAvailability();

  // Refresh relative times every 5 seconds
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  void tick; // referenced to suppress lint; forces re-render for time updates

  const toggle = useCallback(() => setOpen((o) => !o), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'P') toggle();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);

  const activeRecord = activeThreadId
    ? records.find((r) => r.threadId === activeThreadId) ?? null
    : null;

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={toggle}
        title="Persistence Inspector (Shift+P)"
        className={`fixed bottom-4 right-4 z-50 w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center shadow-lg transition-colors ${
          backendAvailable
            ? 'bg-green-900/80 text-green-300 border border-green-700'
            : 'bg-orange-900/80 text-orange-300 border border-orange-700 animate-pulse'
        }`}
      >
        P
      </button>

      {open && (
        <div className="fixed bottom-14 right-4 z-50 w-80 max-h-[80vh] overflow-y-auto rounded-lg border border-white/20 bg-black/90 backdrop-blur-sm shadow-2xl p-3 font-mono text-xs">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-white/70 font-semibold">Persistence Inspector</span>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] ${backendAvailable ? 'text-green-400' : 'text-orange-400'}`}>
                {backendAvailable ? '● backend online' : '● backend offline'}
              </span>
              <button
                onClick={toggle}
                className="text-white/40 hover:text-white ml-1"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Active thread highlight */}
          {activeRecord && (
            <div className="mb-3 p-2 rounded border border-primary/30 bg-primary/5">
              <div className="text-primary text-[10px] font-semibold mb-1">ACTIVE THREAD</div>
              <ThreadRow record={activeRecord} isActive={true} />
            </div>
          )}

          {/* Memory layer legend */}
          <div className="mb-3 p-2 rounded border border-white/10 bg-white/5">
            <div className="text-white/50 text-[10px] font-semibold mb-1">MEMORY LAYERS</div>
            <div className="text-[10px] text-white/40 space-y-0.5">
              <div><span className="text-yellow-400">LOCAL_ONLY</span> — runtime + localStorage only</div>
              <div><span className="text-purple-400">FROM_LOCAL</span> — restored from localStorage</div>
              <div><span className="text-cyan-400">FROM_BACKEND</span> — canonical backend truth</div>
              <div><span className="text-green-400">PERSISTED</span> — backend acknowledged</div>
              <div><span className="text-orange-400">OFFLINE</span> — queued, awaiting reconnect</div>
            </div>
          </div>

          {/* All threads */}
          <div className="text-white/50 text-[10px] font-semibold mb-2">
            ALL THREADS ({records.length})
          </div>
          {records.length === 0 && (
            <div className="text-white/30 text-[10px]">No threads tracked yet.</div>
          )}
          {records.map((r) => (
            <ThreadRow
              key={r.threadId}
              record={r}
              isActive={r.threadId === activeThreadId}
            />
          ))}

          <div className="mt-2 pt-2 border-t border-white/10 text-white/20 text-[9px]">
            Shift+P to toggle · window.__lk_persistence for console access
          </div>
        </div>
      )}
    </>
  );
}
