/**
 * Sticky suggestion dismissals:
 * - Thread-scoped: dismissed in chat thread T → hidden for T until a new thread mentions it.
 * - Permanent: 5 dismissals for the same name+book → never resurface.
 */

import { logger } from '../logger';
import { normalizeNameKey } from '../utils/nameNormalization';
import { canonicalProjectKey } from './lexical/projects/projectDeduplicationService';
import { normalizeSkillKey } from './skills/skillIdentity';
import { supabaseAdmin } from './supabaseClient';

export const MAX_SUGGESTION_DISMISSALS = 5;

export type SuggestionDismissalDomain =
  | 'projects'
  | 'skills'
  | 'quests'
  | 'locations'
  | 'characters';

export type RecordDismissalInput = {
  name: string;
  threadId?: string | null;
  sourceMessageId?: string | null;
  sourceSuggestionId?: string | null;
};

export type RecordDismissalResult = {
  dismissCount: number;
  isPermanent: boolean;
  threadId: string | null;
  normalizedName: string;
};

export type SuppressionCheck = {
  suppressed: boolean;
  reason?: 'permanent' | 'thread_dismissed';
  dismissCount?: number;
};

type DismissalContext = {
  permanent: Set<string>;
  threadDismissed: Map<string, Set<string>>;
  stats: Map<string, number>;
};

function isTableMissing(error: unknown): boolean {
  return (error as { code?: string })?.code === 'PGRST205';
}

export function normalizeSuggestionDismissalName(
  domain: SuggestionDismissalDomain,
  name: string
): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '';
  switch (domain) {
    case 'projects':
      return canonicalProjectKey(trimmed);
    case 'skills':
      return normalizeSkillKey(trimmed);
    default:
      return normalizeNameKey(trimmed);
  }
}

function contextKey(domain: SuggestionDismissalDomain, normalizedName: string): string {
  return `${domain}:${normalizedName}`;
}

class SuggestionDismissalService {
  private contexts = new Map<string, Promise<DismissalContext>>();

  invalidate(userId: string): void {
    this.contexts.delete(userId);
  }

  async resolveThreadIdFromMessageId(messageId?: string | null): Promise<string | null> {
    const id = (messageId ?? '').trim();
    if (!id || id.length < 8) return null;
    try {
      const { data, error } = await supabaseAdmin
        .from('chat_messages')
        .select('session_id')
        .eq('id', id)
        .maybeSingle();
      if (error || !data?.session_id) return null;
      return String(data.session_id);
    } catch {
      return null;
    }
  }

  async recordDismissal(
    userId: string,
    domain: SuggestionDismissalDomain,
    input: RecordDismissalInput
  ): Promise<RecordDismissalResult> {
    const normalizedName = normalizeSuggestionDismissalName(domain, input.name);
    if (!normalizedName) {
      return { dismissCount: 0, isPermanent: false, threadId: null, normalizedName: '' };
    }

    await this.syncLegacyRejections(userId, domain);

    const threadId =
      input.threadId?.trim() ||
      (await this.resolveThreadIdFromMessageId(input.sourceMessageId)) ||
      null;

    const existing = await this.loadStatRow(userId, domain, normalizedName);
    const nextCount = Math.min(MAX_SUGGESTION_DISMISSALS, (existing?.dismiss_count ?? 0) + 1);
    const isPermanent = nextCount >= MAX_SUGGESTION_DISMISSALS;

    const { error: statsError } = await supabaseAdmin.from('suggestion_dismissal_stats').upsert(
      {
        user_id: userId,
        book_domain: domain,
        normalized_name: normalizedName,
        dismiss_count: nextCount,
        is_permanent: isPermanent,
        last_dismissed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,book_domain,normalized_name' }
    );

    if (statsError && !isTableMissing(statsError)) {
      logger.warn({ statsError, userId, domain, normalizedName }, 'Failed to upsert dismissal stats');
    }

    if (threadId) {
      const { error: threadError } = await supabaseAdmin.from('suggestion_thread_dismissals').upsert(
        {
          user_id: userId,
          book_domain: domain,
          normalized_name: normalizedName,
          thread_id: threadId,
          dismissed_at: new Date().toISOString(),
          source_suggestion_id: input.sourceSuggestionId ?? null,
        },
        { onConflict: 'user_id,book_domain,normalized_name,thread_id' }
      );
      if (threadError && !isTableMissing(threadError)) {
        logger.debug({ threadError, userId, domain, normalizedName, threadId }, 'Thread dismissal upsert failed');
      }
    }

    this.invalidate(userId);

    return { dismissCount: nextCount, isPermanent, threadId, normalizedName };
  }

  async shouldSuppress(
    userId: string,
    domain: SuggestionDismissalDomain,
    name: string,
    opts?: { threadId?: string | null; sourceMessageId?: string | null }
  ): Promise<SuppressionCheck> {
    const normalizedName = normalizeSuggestionDismissalName(domain, name);
    if (!normalizedName) return { suppressed: false };

    const ctx = await this.getContext(userId);
    const key = contextKey(domain, normalizedName);

    if (ctx.permanent.has(key)) {
      return { suppressed: true, reason: 'permanent', dismissCount: ctx.stats.get(key) };
    }

    const threadId =
      opts?.threadId?.trim() ||
      (opts?.sourceMessageId ? await this.resolveThreadIdFromMessageId(opts.sourceMessageId) : null) ||
      null;

    if (threadId) {
      const dismissedThreads = ctx.threadDismissed.get(key);
      if (dismissedThreads?.has(threadId)) {
        return { suppressed: true, reason: 'thread_dismissed', dismissCount: ctx.stats.get(key) };
      }
    }

    return { suppressed: false, dismissCount: ctx.stats.get(key) };
  }

  async filterNames<T>(
    userId: string,
    domain: SuggestionDismissalDomain,
    items: T[],
    getName: (item: T) => string,
    getThreadId?: (item: T) => string | null | undefined
  ): Promise<T[]> {
    const ctx = await this.getContext(userId);
    const out: T[] = [];

    for (const item of items) {
      const normalizedName = normalizeSuggestionDismissalName(domain, getName(item));
      if (!normalizedName) continue;
      const key = contextKey(domain, normalizedName);
      if (ctx.permanent.has(key)) continue;

      const threadId = getThreadId?.(item) ?? null;
      if (threadId) {
        const dismissedThreads = ctx.threadDismissed.get(key);
        if (dismissedThreads?.has(threadId)) continue;
      }

      out.push(item);
    }

    return out;
  }

  private async getContext(userId: string): Promise<DismissalContext> {
    let pending = this.contexts.get(userId);
    if (!pending) {
      pending = this.loadContext(userId);
      this.contexts.set(userId, pending);
    }
    return pending;
  }

  private async loadContext(userId: string): Promise<DismissalContext> {
    await this.syncLegacyRejections(userId);

    const permanent = new Set<string>();
    const threadDismissed = new Map<string, Set<string>>();
    const stats = new Map<string, number>();

    try {
      const [{ data: statRows }, { data: threadRows }] = await Promise.all([
        supabaseAdmin
          .from('suggestion_dismissal_stats')
          .select('book_domain, normalized_name, dismiss_count, is_permanent')
          .eq('user_id', userId),
        supabaseAdmin
          .from('suggestion_thread_dismissals')
          .select('book_domain, normalized_name, thread_id')
          .eq('user_id', userId),
      ]);

      for (const row of statRows ?? []) {
        const key = contextKey(row.book_domain as SuggestionDismissalDomain, row.normalized_name);
        stats.set(key, Number(row.dismiss_count ?? 0));
        if (row.is_permanent) permanent.add(key);
      }

      for (const row of threadRows ?? []) {
        const key = contextKey(row.book_domain as SuggestionDismissalDomain, row.normalized_name);
        const set = threadDismissed.get(key) ?? new Set<string>();
        set.add(String(row.thread_id));
        threadDismissed.set(key, set);
      }
    } catch (err) {
      logger.debug({ err, userId }, 'Dismissal context load failed — allowing suggestions');
    }

    return { permanent, threadDismissed, stats };
  }

  private async loadStatRow(
    userId: string,
    domain: SuggestionDismissalDomain,
    normalizedName: string
  ): Promise<{ dismiss_count: number; is_permanent: boolean } | null> {
    try {
      const { data } = await supabaseAdmin
        .from('suggestion_dismissal_stats')
        .select('dismiss_count, is_permanent')
        .eq('user_id', userId)
        .eq('book_domain', domain)
        .eq('normalized_name', normalizedName)
        .maybeSingle();
      return data ?? null;
    } catch {
      return null;
    }
  }

  /** Seed dismissal stats from legacy rejected suggestion rows (once per domain). */
  private async syncLegacyRejections(userId: string, domain?: SuggestionDismissalDomain): Promise<void> {
    const domains: SuggestionDismissalDomain[] = domain
      ? [domain]
      : ['projects', 'skills', 'quests', 'locations', 'characters'];

    for (const book of domains) {
      try {
        const names = await this.loadLegacyRejectedNames(userId, book);
        for (const normalizedName of names) {
          if (!normalizedName) continue;
          const existing = await this.loadStatRow(userId, book, normalizedName);
          if (existing && existing.dismiss_count > 0) continue;

          await supabaseAdmin.from('suggestion_dismissal_stats').upsert(
            {
              user_id: userId,
              book_domain: book,
              normalized_name: normalizedName,
              dismiss_count: Math.max(1, existing?.dismiss_count ?? 1),
              is_permanent: (existing?.dismiss_count ?? 1) >= MAX_SUGGESTION_DISMISSALS,
              last_dismissed_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,book_domain,normalized_name' }
          );
        }
      } catch (err) {
        if (!isTableMissing(err)) {
          logger.debug({ err, userId, book }, 'Legacy rejection sync skipped');
        }
      }
    }
  }

  private async loadLegacyRejectedNames(
    userId: string,
    domain: SuggestionDismissalDomain
  ): Promise<string[]> {
    switch (domain) {
      case 'projects': {
        const { data } = await supabaseAdmin
          .from('project_suggestions')
          .select('normalized_name, name')
          .eq('user_id', userId)
          .eq('status_row', 'rejected');
        return (data ?? []).map(r =>
          normalizeSuggestionDismissalName('projects', r.normalized_name ?? r.name ?? '')
        );
      }
      case 'skills': {
        const { data } = await supabaseAdmin
          .from('skill_suggestions')
          .select('skill_name')
          .eq('user_id', userId)
          .eq('status', 'rejected');
        return (data ?? []).map(r => normalizeSuggestionDismissalName('skills', r.skill_name ?? ''));
      }
      case 'quests': {
        const { data } = await supabaseAdmin
          .from('quest_suggestions')
          .select('title')
          .eq('user_id', userId)
          .eq('status', 'rejected');
        return (data ?? []).map(r => normalizeSuggestionDismissalName('quests', r.title ?? ''));
      }
      default:
        return [];
    }
  }
}

export const suggestionDismissalService = new SuggestionDismissalService();
