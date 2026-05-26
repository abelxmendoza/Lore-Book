/**
 * ThreadPersistenceTracker
 *
 * Canonical runtime truth for thread persistence state.
 * Answers the question: "where does cognition truth live right now?"
 *
 * This is a module-level singleton (no React state) so it can be updated
 * synchronously inside hook callbacks without triggering render cascades.
 * Components subscribe via usePersistenceState() or read snapshots directly.
 *
 * State machine transitions:
 *
 *   Initial load (authenticated)  → RESTORED_FROM_BACKEND
 *   Initial load (guest/fallback) → RESTORED_FROM_LOCAL
 *   New thread created            → LOCAL_ONLY  (unauthenticated)
 *                                   PERSIST_PENDING (authenticated, POST fires)
 *   Messages change, write queued → PERSIST_PENDING
 *   Debounce timer fires (in-flight PATCH) → PERSISTING
 *   PATCH succeeds                → PERSISTED
 *   PATCH fails                   → SYNC_FAILED
 *   Backend unavailable detected  → OFFLINE_MODE
 *   Backend recovers              → PERSIST_PENDING (re-queued)
 */

export type ThreadPersistenceState =
  | 'LOCAL_ONLY'             // unauthenticated — truth lives only in memory/localStorage
  | 'PERSIST_PENDING'        // write debounce timer running
  | 'PERSISTING'             // PATCH in-flight to backend
  | 'PERSISTED'              // backend acknowledged the last write
  | 'SYNC_FAILED'            // last PATCH rejected or network error
  | 'OFFLINE_MODE'           // backend unavailable — writes queued locally
  | 'RESTORED_FROM_LOCAL'    // hydrated from localStorage this session
  | 'RESTORED_FROM_BACKEND'; // hydrated from backend this session

export type HydrationSource = 'none' | 'local' | 'backend';

export interface ThreadPersistenceRecord {
  threadId: string;
  state: ThreadPersistenceState;
  hydrationSource: HydrationSource;
  /** Epoch ms of last successful backend acknowledge */
  lastPersistedAt: number | null;
  /** Epoch ms of the most recent save attempt (success or failure) */
  lastAttemptAt: number | null;
  /** How many consecutive PATCH failures for this thread */
  failCount: number;
  /** Number of messages written to local state since last PERSISTED */
  pendingMessageCount: number;
  isBackendAvailable: boolean;
}

type Listener = () => void;

const DEFAULT_RECORD: Omit<ThreadPersistenceRecord, 'threadId'> = {
  state: 'LOCAL_ONLY',
  hydrationSource: 'none',
  lastPersistedAt: null,
  lastAttemptAt: null,
  failCount: 0,
  pendingMessageCount: 0,
  isBackendAvailable: true,
};

class ThreadPersistenceTrackerService {
  private readonly records = new Map<string, ThreadPersistenceRecord>();
  private readonly listeners = new Set<Listener>();
  private _backendAvailable = true;
  // Cached snapshot — invalidated in notify(). Required for useSyncExternalStore stability.
  private _cachedSnapshot: ThreadPersistenceRecord[] | null = null;

  // ── Public read API ─────────────────────────────────────────────────────────

  /** Returns null when thread is not tracked (avoids new-object-per-call instability). */
  get(threadId: string): ThreadPersistenceRecord | null {
    return this.records.get(threadId) ?? null;
  }

  /** Snapshot of all tracked threads (newest-save-attempt first). Stable reference between notifies. */
  snapshot(): ThreadPersistenceRecord[] {
    if (!this._cachedSnapshot) {
      this._cachedSnapshot = [...this.records.values()].sort(
        (a, b) => (b.lastAttemptAt ?? 0) - (a.lastAttemptAt ?? 0)
      );
    }
    return this._cachedSnapshot;
  }

  get backendAvailable() {
    return this._backendAvailable;
  }

  // ── Subscription ────────────────────────────────────────────────────────────

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ── State transition API ────────────────────────────────────────────────────

  /** Called once when a thread is loaded from backend. */
  markRestoredFromBackend(threadId: string): void {
    this.merge(threadId, {
      state: 'RESTORED_FROM_BACKEND',
      hydrationSource: 'backend',
      isBackendAvailable: true,
    });
  }

  /** Called once when a thread is loaded from localStorage. */
  markRestoredFromLocal(threadId: string): void {
    this.merge(threadId, {
      state: 'RESTORED_FROM_LOCAL',
      hydrationSource: 'local',
    });
  }

  /** Called when a new thread is created locally (not yet written to backend). */
  markLocalOnly(threadId: string): void {
    this.merge(threadId, { state: 'LOCAL_ONLY', hydrationSource: 'none' });
  }

  /**
   * Called when a write is queued (debounce timer started).
   * `pendingMessageCount` = messages in local state not yet confirmed by backend.
   */
  markPersistPending(threadId: string, pendingMessageCount: number): void {
    const current = this.records.get(threadId);
    // Don't downgrade PERSISTING → PERSIST_PENDING (a flush is already in-flight)
    if (current?.state === 'PERSISTING') return;
    this.merge(threadId, { state: 'PERSIST_PENDING', pendingMessageCount });
  }

  /** Called when the debounce timer fires and the PATCH is actually sent. */
  markPersisting(threadId: string): void {
    this.merge(threadId, { state: 'PERSISTING', lastAttemptAt: Date.now() });
  }

  /** Called when the PATCH succeeds. */
  markPersisted(threadId: string): void {
    this.merge(threadId, {
      state: 'PERSISTED',
      lastPersistedAt: Date.now(),
      lastAttemptAt: Date.now(),
      failCount: 0,
      pendingMessageCount: 0,
      isBackendAvailable: true,
    });
  }

  /** Called when the PATCH fails. */
  markSyncFailed(threadId: string, error?: string): void {
    const prev = this.records.get(threadId);
    this.merge(threadId, {
      state: 'SYNC_FAILED',
      lastAttemptAt: Date.now(),
      failCount: (prev?.failCount ?? 0) + 1,
    });
    void error; // available for future telemetry
  }

  /** Called when backend is detected as unavailable. */
  markOffline(threadId?: string): void {
    this._backendAvailable = false;
    if (threadId) {
      this.merge(threadId, { state: 'OFFLINE_MODE', isBackendAvailable: false });
    } else {
      // Mark every tracked thread as offline
      for (const [id, rec] of this.records) {
        if (rec.state !== 'PERSISTED') {
          this.records.set(id, { ...rec, state: 'OFFLINE_MODE', isBackendAvailable: false });
        }
      }
      this.notify();
    }
  }

  /** Called when backend connectivity is restored. */
  markBackendAvailable(): void {
    this._backendAvailable = true;
    for (const [id, rec] of this.records) {
      if (rec.state === 'OFFLINE_MODE') {
        this.records.set(id, { ...rec, state: 'PERSIST_PENDING', isBackendAvailable: true });
      }
    }
    this.notify();
  }

  /** Remove tracking for a deleted thread. */
  remove(threadId: string): void {
    if (this.records.delete(threadId)) this.notify();
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private merge(threadId: string, patch: Partial<Omit<ThreadPersistenceRecord, 'threadId'>>): void {
    const prev = this.records.get(threadId) ?? { threadId, ...DEFAULT_RECORD };
    this.records.set(threadId, { ...prev, ...patch, threadId });
    this.notify();
  }

  private notify(): void {
    this._cachedSnapshot = null;
    for (const fn of this.listeners) fn();
  }
}

export const threadPersistenceTracker = new ThreadPersistenceTrackerService();

// Expose in dev for console inspection: window.__lk_persistence
if (typeof window !== 'undefined') {
  const isDev =
    typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;
  if (isDev) {
    (window as unknown as Record<string, unknown>).__lk_persistence = threadPersistenceTracker;
  }
}
