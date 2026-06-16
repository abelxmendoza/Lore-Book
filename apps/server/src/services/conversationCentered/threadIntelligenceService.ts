/**
 * Thread Intelligence (Phases 2 + 3) — ONE metadata + continuity engine.
 *
 * Consolidation, not a parallel system: thread metadata lives in
 * conversation_sessions.metadata.threadMeta (no new table), is updated
 * INCREMENTALLY per turn (no full thread scans), and the continuity card is
 * rendered deterministically from that metadata (no message rescans, no LLM,
 * no hallucination). Open loops reuse the durability check.
 *
 * The pure helpers (mergeThreadMetadata, buildContinuityCard) are exported and
 * unit-tested; the class is the thin DB wrapper.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { countMissingAssistantTurns } from './threadDurabilityChecks';

export interface ThreadMetadata {
  title: string | null;
  people: string[];
  places: string[];
  projects: string[];
  themes: string[];
  episodes: string[];
  open_loops: string[];
  first_activity: string | null;
  last_activity: string | null;
  message_count: number;
  // Phase 1 — living summaries (filled incrementally by threadSummaryService).
  summary_short: string | null;
  summary_medium: string | null;
  summary_long: string | null;
  summary_version: number;
  // message_count the summaries were last built from (staleness detection).
  summary_message_count: number;
}

export interface ThreadTurn {
  title?: string | null;
  people?: string[];
  places?: string[];
  projects?: string[];
  themes?: string[];
  episodeId?: string | null;
  openLoop?: string | null;
  at: string;            // message timestamp
  addedMessages?: number; // how many messages this turn added (default 1)
}

export function emptyThreadMetadata(): ThreadMetadata {
  return {
    title: null,
    people: [], places: [], projects: [], themes: [], episodes: [], open_loops: [],
    first_activity: null, last_activity: null, message_count: 0,
    summary_short: null, summary_medium: null, summary_long: null,
    summary_version: 0, summary_message_count: 0,
  };
}

const unionCap = (existing: string[], add: string[] | undefined, cap = 50): string[] => {
  if (!add || add.length === 0) return existing;
  const set = new Set(existing);
  for (const x of add) if (x && x.trim()) set.add(x.trim());
  return [...set].slice(-cap);
};

/**
 * Incrementally fold one turn into the thread metadata. Pure, O(turn), no scans.
 * Set-union of entities/places/projects/themes; append episode; bump counters.
 */
export function mergeThreadMetadata(existing: ThreadMetadata, turn: ThreadTurn): ThreadMetadata {
  const next: ThreadMetadata = {
    title: turn.title?.trim() ? turn.title.trim() : existing.title,
    people: unionCap(existing.people, turn.people),
    places: unionCap(existing.places, turn.places),
    projects: unionCap(existing.projects, turn.projects),
    themes: unionCap(existing.themes, turn.themes),
    episodes: turn.episodeId ? unionCap(existing.episodes, [turn.episodeId]) : existing.episodes,
    open_loops: turn.openLoop ? unionCap(existing.open_loops, [turn.openLoop], 20) : existing.open_loops,
    first_activity: existing.first_activity ?? turn.at,
    last_activity: !existing.last_activity || turn.at > existing.last_activity ? turn.at : existing.last_activity,
    message_count: existing.message_count + (turn.addedMessages ?? 1),
    // Summaries are owned by threadSummaryService; merge never touches them
    // (folding a turn only marks them potentially stale via message_count).
    summary_short: existing.summary_short,
    summary_medium: existing.summary_medium,
    summary_long: existing.summary_long,
    summary_version: existing.summary_version,
    summary_message_count: existing.summary_message_count,
  };
  return next;
}

function relativeAgo(iso: string | null, now: number): string {
  if (!iso) return '';
  const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? '' : 's'} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${days < 60 ? '' : 's'} ago`;
  return `${Math.floor(days / 365)} year${days < 730 ? '' : 's'} ago`;
}

/**
 * Render "Last time in this thread:" deterministically from metadata. Pure.
 * Omits empty sections — never fabricates. This is the ChatGPT-style continuity card.
 */
export function buildContinuityCard(meta: ThreadMetadata, opts: { now?: number; openLoops?: string[] } = {}): string {
  const now = opts.now ?? Date.now();
  const lines: string[] = [];
  const ago = relativeAgo(meta.last_activity, now);
  const titlePart = meta.title ? ` — ${meta.title}` : '';
  lines.push(`Last time in this thread${ago ? ` (${ago})` : ''}${titlePart}:`);
  // One-paragraph recap (Phase 1 summary) when available — deterministic, stored.
  if (meta.summary_medium) lines.push(`  ${meta.summary_medium}`);
  const list = (label: string, items: string[], max = 6) => {
    if (items.length === 0) return;
    const shown = items.slice(0, max).join(', ');
    lines.push(`  ${label}: ${shown}${items.length > max ? `, +${items.length - max} more` : ''}`);
  };
  list('People', meta.people);
  list('Projects', meta.projects);
  list('Places', meta.places);
  list('Recent events', meta.episodes, 4);
  const loops = opts.openLoops ?? meta.open_loops;
  list('Open loops', loops, 4);
  // If literally nothing is known, say so honestly rather than render an empty card.
  if (lines.length === 1) return '';
  return lines.join('\n');
}

class ThreadIntelligenceService {
  private async readMeta(userId: string, sessionId: string): Promise<{ meta: ThreadMetadata; otherMeta: Record<string, unknown> }> {
    const { data } = await supabaseAdmin
      .from('conversation_sessions').select('metadata').eq('id', sessionId).eq('user_id', userId).maybeSingle();
    const all = (data?.metadata as Record<string, unknown> | null) ?? {};
    const meta = { ...emptyThreadMetadata(), ...((all.threadMeta as Partial<ThreadMetadata>) ?? {}) };
    return { meta, otherMeta: all };
  }

  /** Public read of the canonical thread metadata (used by threadSummaryService). */
  async getThreadMeta(userId: string, sessionId: string): Promise<ThreadMetadata> {
    return (await this.readMeta(userId, sessionId)).meta;
  }

  /**
   * Persist regenerated summaries back into the SAME threadMeta blob. Owned by
   * threadSummaryService — keeps summaries in one store, no parallel table.
   */
  async writeSummaries(
    userId: string,
    sessionId: string,
    summaries: { short: string | null; medium: string | null; long: string | null; builtFromMessageCount: number },
  ): Promise<ThreadMetadata> {
    const { meta, otherMeta } = await this.readMeta(userId, sessionId);
    const next: ThreadMetadata = {
      ...meta,
      summary_short: summaries.short,
      summary_medium: summaries.medium,
      summary_long: summaries.long,
      summary_version: meta.summary_version + 1,
      summary_message_count: summaries.builtFromMessageCount,
    };
    const { error } = await supabaseAdmin.from('conversation_sessions')
      .update({ metadata: { ...otherMeta, threadMeta: next } })
      .eq('id', sessionId).eq('user_id', userId);
    if (error) logger.warn({ err: error, sessionId }, 'threadIntelligence: summary write failed');
    return next;
  }

  /** Incremental per-turn update (Phase 2). No full thread scan. */
  async updateOnMessage(userId: string, sessionId: string, turn: ThreadTurn): Promise<ThreadMetadata> {
    const { meta, otherMeta } = await this.readMeta(userId, sessionId);
    const next = mergeThreadMetadata(meta, turn);
    const { error } = await supabaseAdmin.from('conversation_sessions')
      .update({ metadata: { ...otherMeta, threadMeta: next } })
      .eq('id', sessionId).eq('user_id', userId);
    if (error) logger.warn({ err: error, sessionId }, 'threadIntelligence: metadata update failed');
    return next;
  }

  /** Continuity card from metadata (Phase 3). Open loops computed from chat_messages. */
  async getContinuity(userId: string, sessionId: string): Promise<{ card: string; metadata: ThreadMetadata; openLoopCount: number }> {
    const { meta } = await this.readMeta(userId, sessionId);
    const { data: msgs } = await supabaseAdmin
      .from('chat_messages').select('role').eq('user_id', userId).eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    const openLoopCount = countMissingAssistantTurns((msgs ?? []) as Array<{ role: string }>);
    const openLoops = openLoopCount > 0 ? [`${openLoopCount} message${openLoopCount > 1 ? 's' : ''} awaiting a reply`] : meta.open_loops;
    return { card: buildContinuityCard(meta, { openLoops }), metadata: meta, openLoopCount };
  }
}

export const threadIntelligenceService = new ThreadIntelligenceService();
