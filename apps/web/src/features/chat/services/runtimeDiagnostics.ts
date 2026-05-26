/**
 * RuntimeDiagnosticsService
 *
 * Lightweight lifecycle observability for the conversation runtime.
 * Tracks events with timestamps and durations, warns when thresholds are exceeded,
 * and exposes a snapshot for future debug tooling.
 *
 * Usage:
 *   runtimeDiagnostics.record('hydration_start', { threadId });
 *   runtimeDiagnostics.startTimer('hydration');
 *   runtimeDiagnostics.recordTimed('hydration_complete', 'hydration', { threadId });
 *
 * In dev: events are logged to the console. In prod: silent.
 * window.__lk_runtime is available in dev for live inspection.
 */

export type RuntimePhase =
  | 'hydration_start'
  | 'hydration_complete'
  | 'hydration_skip'         // hydratedByHandlerRef prevented a redundant load
  | 'thread_switch'
  | 'thread_create'
  | 'thread_delete'
  | 'sync_write'
  | 'flush_save'
  | 'title_start'
  | 'title_complete'
  | 'title_error'
  | 'title_skip'             // user-renamed or already titled
  | 'backend_load_start'
  | 'backend_load_complete'
  | 'backend_load_fallback'  // backend unreachable, fell back to localStorage
  | 'backend_load_error'     // backend failed to load threads
  | 'save_error'             // debounced PATCH / flush save failed (often proxy artifact in dev)
  | 'stream_start'
  | 'stream_complete'
  | 'stream_error'
  | 'api_health_ok'
  | 'api_health_fail'
  | 'env_warning'
  | 'env_error';

export interface RuntimeEvent {
  phase: RuntimePhase;
  threadId?: string;
  durationMs?: number;
  meta?: Record<string, unknown>;
  ts: number;
}

// Warn when these phases exceed the threshold (ms)
const WARN_THRESHOLDS: Partial<Record<RuntimePhase, number>> = {
  hydration_complete: 3000,
  thread_switch: 500,
  title_complete: 6000,
  backend_load_complete: 5000,
};

const MAX_EVENTS = 200;

const isDev =
  typeof import.meta !== 'undefined' &&
  (import.meta as unknown as { env?: { DEV?: boolean } }).env !== undefined &&
  (import.meta as unknown as { env: { DEV?: boolean } }).env.DEV === true;

class RuntimeDiagnosticsService {
  private readonly events: RuntimeEvent[] = [];
  private readonly timers = new Map<string, number>();

  /** Record a lifecycle event immediately. */
  record(
    phase: RuntimePhase,
    opts?: { threadId?: string; durationMs?: number; meta?: Record<string, unknown> }
  ): void {
    const event: RuntimeEvent = { phase, ts: Date.now(), ...opts };
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) this.events.shift();
    if (isDev) this.emit(event);
  }

  /** Begin timing a named operation. */
  startTimer(label: string): void {
    this.timers.set(label, performance.now());
  }

  /**
   * Record a lifecycle event and attach the elapsed time for the named timer.
   * Automatically deletes the timer.
   */
  recordTimed(
    phase: RuntimePhase,
    timerLabel: string,
    opts?: { threadId?: string; meta?: Record<string, unknown> }
  ): number {
    const start = this.timers.get(timerLabel);
    const durationMs = start !== undefined ? Math.round(performance.now() - start) : undefined;
    if (start !== undefined) this.timers.delete(timerLabel);
    this.record(phase, { ...opts, durationMs });
    return durationMs ?? 0;
  }

  /** Return a snapshot of all recorded events (newest last). */
  getSnapshot(): RuntimeEvent[] {
    return [...this.events];
  }

  /** Return only the last N events. */
  tail(n = 20): RuntimeEvent[] {
    return this.events.slice(-n);
  }

  /** Expose on window in dev for console inspection: window.__lk_runtime.tail() */
  exposeOnWindow(): void {
    if (typeof window !== 'undefined' && isDev) {
      (window as unknown as Record<string, unknown>).__lk_runtime = this;
    }
  }

  private emit(event: RuntimeEvent): void {
    const threshold = WARN_THRESHOLDS[event.phase];
    const overThreshold =
      threshold !== undefined &&
      event.durationMs !== undefined &&
      event.durationMs > threshold;

    const tid = event.threadId ? ` tid=…${event.threadId.slice(-6)}` : '';
    const dur = event.durationMs !== undefined ? ` (${event.durationMs}ms)` : '';
    const label = `[Runtime] ${event.phase}${tid}${dur}`;

    if (overThreshold) {
      console.warn(label, event.meta ?? '');
    } else if (
      event.phase === 'title_error' ||
      event.phase === 'backend_load_error' ||
      event.phase === 'stream_error' ||
      event.phase === 'env_error' ||
      event.phase === 'api_health_fail'
    ) {
      console.warn(label, event.meta ?? '');
    } else {
      console.debug(label, event.meta ?? '');
    }
  }
}

export const runtimeDiagnostics = new RuntimeDiagnosticsService();

// Expose on window in dev immediately (safe: only runs in browser)
runtimeDiagnostics.exposeOnWindow();
