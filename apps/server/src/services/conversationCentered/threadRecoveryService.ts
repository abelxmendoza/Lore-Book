/**
 * Conversation Recovery Layer (Thread Durability Sprint, Task 7 + 10).
 *
 * Treats `chat_messages` as the canonical record of a conversation and detects
 * + repairs the durability failures the audit found:
 *   - orphaned messages          (chat_messages whose session no longer exists)
 *   - missing assistant messages (a user turn with no assistant reply)
 *   - mismatched counts          (metadata.messages snapshot vs chat_messages)
 *   - metadata drift             (stale conversation_sessions.metadata.messages)
 *   - ordering conflicts         (session.updated_at older than its last message)
 *
 * Repair is deterministic: rebuild the metadata snapshot from chat_messages and
 * bump updated_at to the last message time. Never deletes messages.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { countMissingAssistantTurns, hasOrderingConflict } from './threadDurabilityChecks';
import { isGenericThreadTitle, deriveTitleFromMessages } from '../../utils/threadTitleUtils';

const ORPHAN_AGE_MS = 60 * 60 * 1000; // an empty thread older than this is an orphan

interface MsgRow { session_id: string; role: string; content: string | null; created_at: string; }
interface SessionRow { id: string; title: string | null; updated_at: string; created_at: string | null; metadata: Record<string, unknown> | null; }

export interface ThreadHealthReport {
  thread_count: number;
  conversation_count: number;        // threads with ≥1 message
  orphaned_messages: number;         // messages whose session row is gone
  missing_assistant_messages: number;// user turns with no assistant reply
  mismatched_counts: number;         // threads whose snapshot count ≠ real count
  metadata_drift: number;            // threads whose metadata snapshot is stale
  ordering_conflicts: number;        // threads whose updated_at < last message time
  hydration_failures: number;        // threads that would hydrate empty despite having messages
  broken_titles: number;             // threads with messages but a generic/empty title
  orphan_threads: number;            // empty threads older than the orphan cutoff
  empty_threads: number;             // threads with zero messages
  duplicate_threads: number;         // threads sharing an identical first user message
  recovery_actions: number;          // repairs applied in the last repairUser() call
}

export interface RepairResult { sessionId: string; rebuiltSnapshot: boolean; bumpedOrdering: boolean; retitled?: string; messageCount: number; }

class ThreadRecoveryService {
  private async loadAll(userId: string): Promise<{ sessions: SessionRow[]; messages: MsgRow[] }> {
    const [{ data: sessions }, { data: messages }] = await Promise.all([
      supabaseAdmin.from('conversation_sessions').select('id, title, updated_at, created_at, metadata').eq('user_id', userId),
      supabaseAdmin.from('chat_messages').select('session_id, role, content, created_at')
        .eq('user_id', userId).order('created_at', { ascending: true }),
    ]);
    return { sessions: (sessions ?? []) as SessionRow[], messages: (messages ?? []) as MsgRow[] };
  }

  private groupBySession(messages: MsgRow[]): Map<string, MsgRow[]> {
    const map = new Map<string, MsgRow[]>();
    for (const m of messages) {
      if (!m.session_id) continue;
      const list = map.get(m.session_id) ?? [];
      list.push(m);
      map.set(m.session_id, list);
    }
    return map;
  }

  private snapshotCount(metadata: Record<string, unknown> | null): number {
    const m = metadata?.messages;
    return Array.isArray(m) ? m.length : 0;
  }

  /** Task 10 — the diagnostics report. Pure read, no mutation. */
  async getThreadHealth(userId: string, recoveryActions = 0): Promise<ThreadHealthReport> {
    const { sessions, messages } = await this.loadAll(userId);
    const sessionIds = new Set(sessions.map((s) => s.id));
    const bySession = this.groupBySession(messages);

    let orphaned = 0, missingAssistant = 0, mismatched = 0, drift = 0, orderingConflicts = 0, hydrationFailures = 0;
    let conversationCount = 0, brokenTitles = 0, orphanThreads = 0, emptyThreads = 0;
    const now = Date.now();
    const firstMessageFingerprints = new Map<string, number>();

    // Orphaned: messages whose session row no longer exists.
    for (const [sid, msgs] of bySession) {
      if (!sessionIds.has(sid)) orphaned += msgs.length;
    }

    for (const s of sessions) {
      const msgs = bySession.get(s.id) ?? [];
      if (msgs.length > 0) conversationCount += 1;

      missingAssistant += countMissingAssistantTurns(msgs);

      const snap = this.snapshotCount(s.metadata);
      if (snap !== msgs.length) mismatched += 1;
      if (snap < msgs.length) drift += 1; // snapshot is behind the canonical log

      if (msgs.length > 0) {
        const last = msgs[msgs.length - 1].created_at;
        if (hasOrderingConflict(s.updated_at, last)) orderingConflicts += 1;
        // A thread with real messages but a generic title is "broken".
        if (isGenericThreadTitle(s.title)) brokenTitles += 1;
        // Duplicate detection: identical first user message.
        const fp = this.firstUserFingerprint(msgs);
        if (fp) firstMessageFingerprints.set(fp, (firstMessageFingerprints.get(fp) ?? 0) + 1);
      } else {
        emptyThreads += 1;
        const age = now - new Date(s.created_at ?? s.updated_at).getTime();
        if (age > ORPHAN_AGE_MS) orphanThreads += 1;
      }

      if (msgs.length === 0 && snap === 0) hydrationFailures += 1;
    }

    let duplicateThreads = 0;
    for (const count of firstMessageFingerprints.values()) if (count > 1) duplicateThreads += count - 1;

    return {
      thread_count: sessions.length,
      conversation_count: conversationCount,
      orphaned_messages: orphaned,
      missing_assistant_messages: missingAssistant,
      mismatched_counts: mismatched,
      metadata_drift: drift,
      ordering_conflicts: orderingConflicts,
      hydration_failures: hydrationFailures,
      broken_titles: brokenTitles,
      orphan_threads: orphanThreads,
      empty_threads: emptyThreads,
      duplicate_threads: duplicateThreads,
      recovery_actions: recoveryActions,
    };
  }

  /** Fingerprint a thread by its first user message (duplicate-thread detection). */
  private firstUserFingerprint(msgs: MsgRow[]): string | null {
    const firstUser = msgs.find((m) => m.role === 'user' && (m.content ?? '').trim());
    if (!firstUser) return null;
    return (firstUser.content ?? '').trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 120);
  }

  /** Rebuild a thread's metadata snapshot from chat_messages and fix its ordering. */
  async repairThread(userId: string, sessionId: string): Promise<RepairResult> {
    const { data: msgs } = await supabaseAdmin
      .from('chat_messages').select('id, role, content, created_at')
      .eq('user_id', userId).eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    const rows = (msgs ?? []) as Array<{ id: string; role: string; content: string | null; created_at: string }>;
    if (rows.length === 0) return { sessionId, rebuiltSnapshot: false, bumpedOrdering: false, messageCount: 0 };

    const snapshot = rows.map((m) => ({ id: m.id, role: m.role, content: m.content ?? '', timestamp: m.created_at }));
    const lastActivity = rows[rows.length - 1].created_at;

    const { data: session } = await supabaseAdmin
      .from('conversation_sessions').select('title, metadata, updated_at').eq('id', sessionId).eq('user_id', userId).maybeSingle();
    const existingMeta = (session?.metadata as Record<string, unknown> | null) ?? {};

    // Repair a broken/generic title deterministically (never "New Conversation").
    // Don't overwrite a user-renamed title.
    let retitled: string | null = null;
    const userRenamed = existingMeta.titleSource === 'user';
    if (!userRenamed && isGenericThreadTitle(session?.title as string | null)) {
      retitled = deriveTitleFromMessages(rows.map((m) => ({ role: m.role, content: m.content ?? '' })));
    }

    const update: Record<string, unknown> = {
      metadata: { ...existingMeta, messages: snapshot },
      updated_at: lastActivity,
    };
    if (retitled) update.title = retitled;

    const { error } = await supabaseAdmin.from('conversation_sessions')
      .update(update).eq('id', sessionId).eq('user_id', userId);
    if (error) { logger.warn({ err: error, sessionId }, 'repairThread: snapshot rebuild failed'); }

    return { sessionId, rebuiltSnapshot: !error, bumpedOrdering: !error, retitled: retitled ?? undefined, messageCount: rows.length };
  }

  /** Repair every thread whose snapshot/ordering drifted. Returns repairs applied. */
  async repairUser(userId: string): Promise<{ repaired: number; results: RepairResult[] }> {
    const { sessions, messages } = await this.loadAll(userId);
    const bySession = this.groupBySession(messages);
    const results: RepairResult[] = [];

    for (const s of sessions) {
      const msgs = bySession.get(s.id) ?? [];
      if (msgs.length === 0) continue;
      const snap = this.snapshotCount(s.metadata);
      const last = msgs[msgs.length - 1].created_at;
      const orderingOff = hasOrderingConflict(s.updated_at, last);
      const titleBroken = s.metadata?.titleSource !== 'user' && isGenericThreadTitle(s.title);
      if (snap !== msgs.length || orderingOff || titleBroken) {
        results.push(await this.repairThread(userId, s.id));
      }
    }
    logger.info({ userId, repaired: results.length }, 'threadRecovery: repairUser complete');
    return { repaired: results.length, results };
  }
}

export const threadRecoveryService = new ThreadRecoveryService();
