/**
 * Graph Recovery Trigger (Integration Sprint — Step 1).
 *
 * Connects the two already-built, idempotent recovery services
 * (`relationshipFoundationService`, `eventRecoveryService`) to the LIVE chat
 * ingestion path. Previously they only ran via batch scripts, so the
 * relationship/event graph the reconstruction score depends on decayed between
 * manual runs. This makes them first-class runtime systems.
 *
 * No new graph/memory architecture. This is a per-user throttle that calls the
 * existing service methods.
 *
 * ── Supabase efficiency (this is the expensive part to get right) ───────────
 * Each recovery run scans a large corpus (up to 800 chat_messages + all session
 * metadata + up to 2000 entity_facts). Running that per chat turn would generate
 * enormous Database Egress for zero benefit on already-recovered users. So the
 * live path is aggressively throttled:
 *   1. Hard per-user cooldown — at most one run per GRAPH_RECOVERY_MIN_INTERVAL_MS
 *      (default 30 min), regardless of message volume.
 *   2. Pending gate — only run if ≥1 new message arrived since the last run.
 *   3. Conditional diagnostics — only write a pipeline_runs row when the graph
 *      actually changed (avoids per-run row/WAL growth + future read egress).
 *   4. No before/after count(*) probes — "changed" is derived from the recovery
 *      stats the services already return (saves 4 round-trips per run).
 *
 * Shared logic: `runNow(userId)` is the single recovery path (used by the live
 * throttle, the manual diagnostics endpoint, and batch callers). The throttle
 * lives in `schedule()`.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { relationshipFoundationService } from '../relationshipFoundationService';
import { eventRecoveryService } from '../eventRecoveryService';

const DEBOUNCE_MS = Number(process.env.GRAPH_RECOVERY_DEBOUNCE_MS ?? 15_000);
const MIN_INTERVAL_MS = Number(process.env.GRAPH_RECOVERY_MIN_INTERVAL_MS ?? 30 * 60_000);
const LIVE_ENABLED = process.env.GRAPH_RECOVERY_LIVE !== '0';

export interface GraphRecoveryResult {
  userId: string;
  ranAt: string;
  durationMs: number;
  /** Counts derived from the recovery services — no extra DB probes. */
  relationships: { created: number; updated: number; stats: unknown };
  events: { created: number; stats: unknown };
  changed: boolean;
  status: 'completed' | 'partial' | 'failed';
  error?: string;
}

interface UserState {
  timer: NodeJS.Timeout | null;
  lastRunAt: number; // epoch ms, 0 = never
  pending: number; // new messages since last run
  inFlight: boolean;
}

class GraphRecoveryTrigger {
  private state = new Map<string, UserState>();
  private lastRun = new Map<string, GraphRecoveryResult>();

  private getState(userId: string): UserState {
    let s = this.state.get(userId);
    if (!s) {
      s = { timer: null, lastRunAt: 0, pending: 0, inFlight: false };
      this.state.set(userId, s);
    }
    return s;
  }

  /**
   * Live entry point. Called once per ingested chat message. Coalesced into at
   * most one run per cooldown window per user — cheap and egress-safe.
   */
  schedule(userId: string): void {
    if (!LIVE_ENABLED || !userId) return;
    const s = this.getState(userId);
    s.pending += 1;
    if (s.timer) return; // already scheduled — coalesce

    s.timer = setTimeout(() => this.onTimer(userId), DEBOUNCE_MS);
    if (typeof s.timer.unref === 'function') s.timer.unref();
  }

  /** Decide whether the cooldown/pending gates allow a run; reschedule if not. */
  private onTimer(userId: string): void {
    const s = this.getState(userId);
    s.timer = null;

    if (s.pending === 0 || s.inFlight) return; // nothing new / already running

    const sinceLast = Date.now() - s.lastRunAt;
    if (s.lastRunAt > 0 && sinceLast < MIN_INTERVAL_MS) {
      // Cooldown active — defer to exactly when it expires (one timer, no spin).
      const wait = MIN_INTERVAL_MS - sinceLast;
      s.timer = setTimeout(() => this.onTimer(userId), wait);
      if (typeof s.timer.unref === 'function') s.timer.unref();
      return;
    }

    void this.runNow(userId).catch((err) =>
      logger.warn({ err, userId }, 'graph_recovery: scheduled run failed (non-blocking)')
    );
  }

  /**
   * Shared recovery logic (live throttle + manual + batch). Idempotent: the
   * underlying services skip existing rows. Derives "changed" from stats — no
   * before/after count probes. Writes a diagnostics row only when the graph
   * actually changed.
   */
  async runNow(userId: string): Promise<GraphRecoveryResult> {
    const s = this.getState(userId);
    if (s.inFlight) {
      return this.lastRun.get(userId) ?? this.emptyResult(userId);
    }
    s.inFlight = true;
    s.pending = 0; // claim the pending work now
    const startedAt = Date.now();

    let relStats: any = null;
    let evtStats: any = null;
    let status: GraphRecoveryResult['status'] = 'completed';
    let error: string | undefined;

    try {
      relStats = await relationshipFoundationService.recoverRelationshipGraph(userId);
    } catch (err) {
      status = 'partial';
      error = `relationship_recovery: ${(err as Error)?.message ?? 'failed'}`;
      logger.warn({ err, userId }, 'graph_recovery: relationship recovery failed');
    }

    try {
      evtStats = await eventRecoveryService.recoverMissingEvents(userId);
    } catch (err) {
      status = status === 'partial' ? 'failed' : 'partial';
      error = [error, `event_recovery: ${(err as Error)?.message ?? 'failed'}`].filter(Boolean).join('; ');
      logger.warn({ err, userId }, 'graph_recovery: event recovery failed');
    }

    const relCreated = Number(relStats?.created ?? 0);
    const relUpdated = Number(relStats?.updated ?? 0) + Number(relStats?.repaired ?? 0);
    const evtCreated = Number(evtStats?.created ?? 0);
    // "changed" gates the diagnostics write and means the graph GREW (new rows).
    // `updated` is excluded on purpose: the relationship service re-touches
    // existing rows every run (~57 UPDATEs even when idle), which does not change
    // graph coverage or the score. Counting it would write a useless pipeline_runs
    // row on every cooldown tick → needless disk/WAL/egress. New rows only.
    const changed = relCreated + evtCreated > 0;

    const result: GraphRecoveryResult = {
      userId,
      ranAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      relationships: { created: relCreated, updated: relUpdated, stats: relStats },
      events: { created: evtCreated, stats: evtStats },
      changed,
      status,
      error,
    };

    s.lastRunAt = Date.now();
    s.inFlight = false;
    this.lastRun.set(userId, result);

    // Only persist diagnostics when something actually changed (or failed) —
    // avoids growing pipeline_runs (disk + WAL + future read egress) on the
    // common no-op run.
    if (changed || status !== 'completed') {
      await this.recordDiagnostics(result);
    }

    logger.info(
      { userId, relCreated, relUpdated, evtCreated, changed, durationMs: result.durationMs, status },
      'graph_recovery: live graph update complete'
    );
    return result;
  }

  getLastRun(userId: string): GraphRecoveryResult | null {
    return this.lastRun.get(userId) ?? null;
  }

  private async recordDiagnostics(result: GraphRecoveryResult): Promise<void> {
    try {
      await supabaseAdmin.from('pipeline_runs').insert({
        job_id: `graph-recovery:${result.userId}`,
        user_id: result.userId,
        status: result.status === 'failed' ? 'failed' : 'completed',
        started_at: new Date(Date.now() - result.durationMs).toISOString(),
        completed_at: result.ranAt,
        duration_ms: result.durationMs,
        total_steps: 2,
        completed_steps: result.status === 'failed' ? 0 : 2,
        error: result.error ?? null,
        step_results: [
          { step: 'relationship_recovery', success: result.status !== 'failed', created: result.relationships.created, updated: result.relationships.updated },
          { step: 'event_recovery', success: result.status === 'completed', created: result.events.created },
        ],
      });
    } catch (err) {
      logger.debug({ err, userId: result.userId }, 'graph_recovery: diagnostics record failed (non-blocking)');
    }
  }

  private emptyResult(userId: string): GraphRecoveryResult {
    return {
      userId,
      ranAt: new Date().toISOString(),
      durationMs: 0,
      relationships: { created: 0, updated: 0, stats: null },
      events: { created: 0, stats: null },
      changed: false,
      status: 'completed',
    };
  }
}

export const graphRecoveryTrigger = new GraphRecoveryTrigger();
