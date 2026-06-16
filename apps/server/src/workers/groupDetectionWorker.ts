// =====================================================
// GROUP DETECTION WORKER
// Purpose: Continuously scan each user's existing threads and journal entries
//          for group signals, so groups are surfaced even when they were never
//          caught live. Runs a full backfill on startup, then re-checks recent
//          activity on a cycle.
//
// Idempotent: group candidates are keyed by source id (msg:<id> / journal:<id>),
// so re-scanning the same content never inflates occurrence counts.
// =====================================================

import { logger } from '../logger';
import { supabaseAdmin } from '../services/supabaseClient';
import { groupCandidateService } from '../services/groupCandidateService';
import { societyMappingService } from '../services/society/societyMappingService';
import { runForAllActiveUsers } from './workerUtils';

class GroupDetectionWorker {
  private readonly CYCLE_MS = 15 * 60 * 1000; // re-check every 15 minutes
  private readonly STARTUP_DELAY_MS = 90 * 1000; // let the API settle before backfilling
  private readonly INCREMENTAL_DAYS = 3; // each cycle: look back this far
  private readonly BACKFILL_DAYS = 365; // startup: scan ~1 year of history
  private readonly BACKFILL_CAP = 400; // bound backfill work per user
  private readonly INCREMENTAL_CAP = 150; // bound cycle work per user
  private readonly CONCURRENCY = 2; // gentle on the DB connection pool
  private readonly SOCIETY_CYCLE_MS = 6 * 60 * 60 * 1000; // cross-session map every 6h
  private readonly SOCIETY_STARTUP_DELAY_MS = 3 * 60 * 1000; // after the first backfill settles
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;

    // Defer the heavy one-time backfill so it never competes with initial page
    // loads / API requests right after boot.
    setTimeout(() => {
      void this.runBatch(this.BACKFILL_DAYS, this.BACKFILL_CAP, 'backfill').catch(err =>
        logger.error({ err }, 'GroupDetectionWorker: backfill failed')
      );
    }, this.STARTUP_DELAY_MS);

    // Recurring incremental sweep.
    setInterval(() => {
      void this.runBatch(this.INCREMENTAL_DAYS, this.INCREMENTAL_CAP, 'cycle').catch(err =>
        logger.error({ err }, 'GroupDetectionWorker: cycle failed')
      );
    }, this.CYCLE_MS);

    // Cross-session "society mapping": reads each user's WHOLE history to link
    // employers↔people↔workplaces and cluster recurring co-mentions. Heavier, so
    // it runs on a slow cadence after the initial backfill.
    setTimeout(() => {
      void this.runSocietyBatch().catch(err =>
        logger.error({ err }, 'GroupDetectionWorker: society backfill failed')
      );
      setInterval(() => {
        void this.runSocietyBatch().catch(err =>
          logger.error({ err }, 'GroupDetectionWorker: society cycle failed')
        );
      }, this.SOCIETY_CYCLE_MS);
    }, this.STARTUP_DELAY_MS + this.SOCIETY_STARTUP_DELAY_MS);

    logger.info({ cycleMs: this.CYCLE_MS, startupDelayMs: this.STARTUP_DELAY_MS }, 'GroupDetectionWorker started');
  }

  /** Heap usage in MB (diagnostics — watch for growth across runs). */
  private heapMb(): number {
    return Math.round(process.memoryUsage().heapUsed / 1048576);
  }

  /** Run cross-session society mapping for every active user. */
  private async runSocietyBatch(): Promise<void> {
    const before = this.heapMb();
    await runForAllActiveUsers(
      'group-detection:society',
      userId => societyMappingService.mapUser(userId).then(() => undefined),
      this.CONCURRENCY
    );
    logger.info({ label: 'society', heapBeforeMb: before, heapAfterMb: this.heapMb() }, 'GroupDetectionWorker: run heap');
  }

  private async runBatch(sinceDays: number, cap: number, label: string): Promise<void> {
    const before = this.heapMb();
    await runForAllActiveUsers(
      `group-detection:${label}`,
      userId => this.runForUser(userId, sinceDays, cap),
      this.CONCURRENCY
    );
    logger.info({ label, heapBeforeMb: before, heapAfterMb: this.heapMb() }, 'GroupDetectionWorker: run heap');
  }

  /** Scan one user's recent chat messages + journal entries for groups. */
  async runForUser(userId: string, sinceDays: number, cap = this.BACKFILL_CAP): Promise<void> {
    const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

    try {
      const { data: msgs } = await supabaseAdmin
        .from('chat_messages')
        .select('id, session_id, content, created_at')
        .eq('user_id', userId)
        .eq('role', 'user')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(cap);

      // Group user messages by conversation (session) so co-occurrence is
      // detected across the WHOLE conversation — people talked about together
      // in the same conversation get clustered, even across separate turns.
      // Messages come back newest-first; unshift to restore chronological order.
      const bySession = new Map<string, string[]>();
      const sessionless: Array<{ id: string; content: string }> = [];
      for (const m of (msgs ?? []) as Array<{ id: string; session_id: string | null; content: string }>) {
        if (m.session_id) {
          const list = bySession.get(m.session_id) ?? [];
          list.unshift(m.content);
          bySession.set(m.session_id, list);
        } else {
          sessionless.push({ id: m.id, content: m.content });
        }
      }

      for (const [sessionId, texts] of bySession) {
        // Only spend a scan on conversations that actually carry group signal.
        if (!this.shouldScanContent(texts.join('\n'))) continue;
        await groupCandidateService.processConversation(userId, sessionId, texts);
      }

      // Fallback for any legacy messages without a session id.
      for (const m of sessionless) {
        if (this.shouldScanContent(m.content)) {
          await groupCandidateService.processChatMessage(userId, m.content, `msg:${m.id}`);
        }
      }
    } catch (error) {
      logger.debug({ error, userId }, 'GroupDetectionWorker: chat scan failed');
    }

    try {
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('id, content, date')
        .eq('user_id', userId)
        .gte('date', cutoff)
        .order('date', { ascending: false })
        .limit(cap);

      for (const e of (entries ?? []) as Array<{ id: string; content: string }>) {
        if (this.shouldScanContent(e.content)) {
          await groupCandidateService.processChatMessage(userId, e.content, `journal:${e.id}`);
        }
      }
    } catch (error) {
      logger.debug({ error, userId }, 'GroupDetectionWorker: journal scan failed');
    }
  }

  private shouldScanContent(content?: string): boolean {
    const text = content?.trim();
    if (!text) return false;
    if (/\b(group|crew|squad|team|club|band|scene|community|collective|family|with|along with|together with|met up|hung out|we went|we were)\b/i.test(text)) {
      return true;
    }
    const capitalizedMentions = text.match(/\b[A-ZÀ-Ý][a-zÀ-ÿ'-]+(?:\s+[A-ZÀ-Ý][a-zÀ-ÿ'-]+)?\b/g) ?? [];
    return capitalizedMentions.length >= 2 && /\b(and|,)\b/.test(text);
  }
}

export const groupDetectionWorker = new GroupDetectionWorker();
