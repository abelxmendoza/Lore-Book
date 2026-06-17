/**
 * Conversation Recovery Layer (Thread Durability Sprint, Task 7 + 10).
 *
 * Treats `chat_messages` as the canonical record of a conversation and detects
 * + repairs durability failures:
 *   - orphaned messages          (chat_messages whose session no longer exists)
 *   - missing assistant messages (a user turn with no assistant reply)
 *   - ordering conflicts         (session.updated_at older than its last message)
 *   - broken titles              (generic title despite having messages)
 *
 * Repair bumps updated_at and retitles — it does NOT rebuild metadata.messages (P2).
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { countMissingAssistantTurns, hasOrderingConflict } from './threadDurabilityChecks';
import { isGenericThreadTitle, deriveTitleFromMessages } from '../../utils/threadTitleUtils';
import { loadThreadMessages } from './threadContentService';
import { backfillMentionedEntitiesForUser } from '../chat/entityMentionBackfillService';

const ORPHAN_AGE_MS = 60 * 60 * 1000;

interface MsgRow { session_id: string; role: string; content: string | null; created_at: string; }
interface SessionRow { id: string; title: string | null; updated_at: string; created_at: string | null; metadata: Record<string, unknown> | null; }

export interface ThreadHealthReport {
  thread_count: number;
  conversation_count: number;
  orphaned_messages: number;
  missing_assistant_messages: number;
  /** @deprecated P2 — metadata.messages snapshots no longer maintained */
  mismatched_counts: number;
  /** @deprecated P2 — metadata.messages snapshots no longer maintained */
  metadata_drift: number;
  ordering_conflicts: number;
  hydration_failures: number;
  broken_titles: number;
  orphan_threads: number;
  empty_threads: number;
  duplicate_threads: number;
  recovery_actions: number;
}

export interface RepairResult {
  sessionId: string;
  rebuiltSnapshot: boolean;
  bumpedOrdering: boolean;
  retitled?: string;
  messageCount: number;
}

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

  async getThreadHealth(userId: string, recoveryActions = 0): Promise<ThreadHealthReport> {
    const { sessions, messages } = await this.loadAll(userId);
    const sessionIds = new Set(sessions.map((s) => s.id));
    const bySession = this.groupBySession(messages);

    let orphaned = 0, missingAssistant = 0, orderingConflicts = 0, hydrationFailures = 0;
    let conversationCount = 0, brokenTitles = 0, orphanThreads = 0, emptyThreads = 0;
    const now = Date.now();
    const firstMessageFingerprints = new Map<string, number>();

    for (const [sid, msgs] of bySession) {
      if (!sessionIds.has(sid)) orphaned += msgs.length;
    }

    for (const s of sessions) {
      const msgs = bySession.get(s.id) ?? [];
      if (msgs.length > 0) conversationCount += 1;

      missingAssistant += countMissingAssistantTurns(msgs);

      if (msgs.length > 0) {
        const last = msgs[msgs.length - 1].created_at;
        if (hasOrderingConflict(s.updated_at, last)) orderingConflicts += 1;
        if (isGenericThreadTitle(s.title)) brokenTitles += 1;
        const fp = this.firstUserFingerprint(msgs);
        if (fp) firstMessageFingerprints.set(fp, (firstMessageFingerprints.get(fp) ?? 0) + 1);
      } else {
        emptyThreads += 1;
        const age = now - new Date(s.created_at ?? s.updated_at).getTime();
        if (age > ORPHAN_AGE_MS) orphanThreads += 1;
        hydrationFailures += 1;
      }
    }

    let duplicateThreads = 0;
    for (const count of firstMessageFingerprints.values()) if (count > 1) duplicateThreads += count - 1;

    return {
      thread_count: sessions.length,
      conversation_count: conversationCount,
      orphaned_messages: orphaned,
      missing_assistant_messages: missingAssistant,
      mismatched_counts: 0,
      metadata_drift: 0,
      ordering_conflicts: orderingConflicts,
      hydration_failures: hydrationFailures,
      broken_titles: brokenTitles,
      orphan_threads: orphanThreads,
      empty_threads: emptyThreads,
      duplicate_threads: duplicateThreads,
      recovery_actions: recoveryActions,
    };
  }

  private firstUserFingerprint(msgs: MsgRow[]): string | null {
    const firstUser = msgs.find((m) => m.role === 'user' && (m.content ?? '').trim());
    if (!firstUser) return null;
    return (firstUser.content ?? '').trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 120);
  }

  /** Insert assistant rows that exist only in legacy/metadata sources into chat_messages. */
  private async backfillMissingAssistants(userId: string, sessionId: string): Promise<number> {
    const { data: chatOnly } = await supabaseAdmin
      .from('chat_messages')
      .select('role, content')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    const chatRows = (chatOnly ?? []) as Array<{ role: string; content: string | null }>;
    if (countMissingAssistantTurns(chatRows) === 0) return 0;

    const merged = await loadThreadMessages(userId, sessionId);
    const norm = (role: string, content: string) =>
      `${role}:${(content ?? '').trim().replace(/\s+/g, ' ').toLowerCase()}`;
    const existing = new Set(chatRows.map((m) => norm(m.role, m.content ?? '')));

    let inserted = 0;
    for (const row of merged) {
      if (row.role !== 'assistant' || !row.content.trim()) continue;
      const fp = norm(row.role, row.content);
      if (existing.has(fp)) continue;
      const { error } = await supabaseAdmin.from('chat_messages').insert({
        user_id: userId,
        session_id: sessionId,
        role: 'assistant',
        content: row.content,
        created_at: row.created_at,
        metadata: { ...(row.metadata ?? {}), recovered_from_legacy: true },
      });
      if (!error) {
        existing.add(fp);
        inserted += 1;
      }
    }
    return inserted;
  }

  /** Fix ordering and broken titles from chat_messages — no metadata snapshot rebuild. */
  async repairThread(userId: string, sessionId: string): Promise<RepairResult> {
    const { data: msgs } = await supabaseAdmin
      .from('chat_messages').select('id, role, content, created_at')
      .eq('user_id', userId).eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    const rows = (msgs ?? []) as Array<{ id: string; role: string; content: string | null; created_at: string }>;
    if (rows.length === 0) return { sessionId, rebuiltSnapshot: false, bumpedOrdering: false, messageCount: 0 };

    const lastActivity = rows[rows.length - 1].created_at;

    const { data: session } = await supabaseAdmin
      .from('conversation_sessions').select('title, metadata, updated_at').eq('id', sessionId).eq('user_id', userId).maybeSingle();
    const existingMeta = (session?.metadata as Record<string, unknown> | null) ?? {};

    let retitled: string | null = null;
    const userRenamed = existingMeta.titleSource === 'user';
    if (!userRenamed && isGenericThreadTitle(session?.title as string | null)) {
      retitled = deriveTitleFromMessages(rows.map((m) => ({ role: m.role, content: m.content ?? '' })));
    }

    const update: Record<string, unknown> = { updated_at: lastActivity };
    if (retitled) update.title = retitled;

    const { error } = await supabaseAdmin.from('conversation_sessions')
      .update(update).eq('id', sessionId).eq('user_id', userId);
    if (error) { logger.warn({ err: error, sessionId }, 'repairThread: ordering/title repair failed'); }

    return {
      sessionId,
      rebuiltSnapshot: false,
      bumpedOrdering: !error,
      retitled: retitled ?? undefined,
      messageCount: rows.length,
    };
  }

  async repairUser(userId: string): Promise<{ repaired: number; results: RepairResult[]; entityBackfilled: number }> {
    const { sessions, messages } = await this.loadAll(userId);
    const bySession = this.groupBySession(messages);
    const results: RepairResult[] = [];

    for (const s of sessions) {
      const msgs = bySession.get(s.id) ?? [];
      if (msgs.length === 0) continue;
      const backfilled = await this.backfillMissingAssistants(userId, s.id);
      if (backfilled > 0) {
        results.push({
          sessionId: s.id,
          rebuiltSnapshot: true,
          bumpedOrdering: false,
          messageCount: msgs.length + backfilled,
        });
      }
      const last = msgs[msgs.length - 1]?.created_at ?? s.updated_at;
      const orderingOff = msgs.length > 0 && hasOrderingConflict(s.updated_at, last);
      const titleBroken = s.metadata?.titleSource !== 'user' && isGenericThreadTitle(s.title);
      if (orderingOff || titleBroken) {
        results.push(await this.repairThread(userId, s.id));
      }
    }
    const entityBackfilled = await backfillMentionedEntitiesForUser(userId);
    logger.info({ userId, repaired: results.length, entityBackfilled }, 'threadRecovery: repairUser complete');
    return { repaired: results.length, results, entityBackfilled };
  }
}

export const threadRecoveryService = new ThreadRecoveryService();
