/**
 * Thread Roster — the authoritative cast of a conversation.
 *
 * When the user tells a story, the people (and places/organizations) in it form
 * a roster: who is in this scene, how central they are, and where in the thread
 * they first/last appeared. The roster is DERIVED from durable message mention
 * metadata plus entity_conversation_links — never from an LLM — and every entry
 * carries provenance refs built from the thread/turn reference numbers.
 *
 * Consolidation, not a parallel system (same doctrine as threadIntelligence):
 * user edits live in conversation_sessions.metadata.threadMeta.rosterOverrides,
 * and a derived snapshot is cached at threadMeta.roster so the chat hot path
 * can read the cast without scanning messages.
 *
 * The pure helpers (deriveRosterEntries, applyRosterOverrides, rosterRole) are
 * exported and unit-tested; the class is the thin DB wrapper.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { ThreadMessageRow } from './threadContentService';

export type RosterRole = 'main' | 'supporting' | 'mentioned';
export type RosterStatus = 'active' | 'excluded';
export type RosterKind = 'character' | 'location' | 'organization' | 'skill' | 'event' | 'unknown';

export type RosterEntry = {
  /** Linked entity id, or null for a name-only entry (mentioned but never linked). */
  entityId: string | null;
  name: string;
  kind: RosterKind;
  role: RosterRole;
  status: RosterStatus;
  /** 'user' when any override touched this entry; overrides always win. */
  source: 'auto' | 'user';
  mentions: number;
  /** Message reference (e.g. "12.4") of the first appearance — provenance. */
  firstSeenRef: string | null;
  lastSeenRef: string | null;
  pinned: boolean;
};

export type RosterOverride = {
  role?: RosterRole;
  status?: RosterStatus;
  pinned?: boolean;
};

/** Override key: linked entries key by entityId, name-only entries by name. */
export function rosterKey(entry: Pick<RosterEntry, 'entityId' | 'name'>): string {
  return entry.entityId ?? `name:${entry.name.trim().toLowerCase()}`;
}

/** Deterministic centrality from mention counts — no LLM, no guessing. */
export function rosterRole(mentions: number, maxMentions: number): RosterRole {
  if (mentions >= 3 && mentions * 2 >= maxMentions) return 'main';
  if (mentions >= 2) return 'supporting';
  return 'mentioned';
}

type MentionShape = { id?: unknown; name?: unknown; type?: unknown };

function mentionKind(type: unknown): RosterKind {
  const t = String(type ?? '').toLowerCase();
  if (t === 'character' || t === 'person') return 'character';
  if (t === 'location' || t === 'place') return 'location';
  if (t === 'organization' || t === 'org') return 'organization';
  if (t === 'skill') return 'skill';
  if (t === 'event') return 'event';
  return 'unknown';
}

function messageRef(threadNumber: number | null, row: ThreadMessageRow): string | null {
  if (threadNumber == null || row.turn_number == null) return null;
  return row.reply_seq ? `${threadNumber}.${row.turn_number}.${row.reply_seq}` : `${threadNumber}.${row.turn_number}`;
}

export type RosterLinkRow = {
  entity_type: string;
  entity_id: string;
  mention_count?: number | null;
  /** entity_name lives inside the link's metadata JSONB. */
  metadata?: { entity_name?: string | null } | null;
};

/**
 * Fold stored message mention metadata (+ entity links, + legacy name-only
 * threadMeta.people) into roster entries. Pure — no DB, no LLM.
 */
export function deriveRosterEntries(
  messages: ThreadMessageRow[],
  threadNumber: number | null,
  links: RosterLinkRow[] = [],
  legacyPeople: string[] = [],
): RosterEntry[] {
  const byKey = new Map<string, RosterEntry>();

  for (const row of messages) {
    const mentions = (row.metadata?.mentionedEntities ?? null) as MentionShape[] | null;
    if (!Array.isArray(mentions)) continue;
    const ref = messageRef(threadNumber, row);
    for (const m of mentions) {
      if (!m || typeof m !== 'object') continue;
      const name = typeof m.name === 'string' ? m.name.trim() : '';
      if (!name) continue;
      const entityId = typeof m.id === 'string' && m.id.trim() ? m.id : null;
      const key = rosterKey({ entityId, name });
      const existing = byKey.get(key);
      if (existing) {
        existing.mentions += 1;
        existing.lastSeenRef = ref ?? existing.lastSeenRef;
        existing.name = name;
      } else {
        byKey.set(key, {
          entityId,
          name,
          kind: mentionKind(m.type),
          role: 'mentioned',
          status: 'active',
          source: 'auto',
          mentions: 1,
          firstSeenRef: ref,
          lastSeenRef: ref,
          pinned: false,
        });
      }
    }
  }

  // Entities linked to this thread that never made it into message metadata
  // (older threads, ingestion-created links) still belong on the roster.
  for (const link of links) {
    const key = link.entity_id;
    if (byKey.has(key)) continue;
    const name = link.metadata?.entity_name?.trim();
    if (!name) continue;
    byKey.set(key, {
      entityId: link.entity_id,
      name,
      kind: mentionKind(link.entity_type),
      role: 'mentioned',
      status: 'active',
      source: 'auto',
      mentions: Math.max(1, link.mention_count ?? 1),
      firstSeenRef: null,
      lastSeenRef: null,
      pinned: false,
    });
  }

  // Legacy threadMeta.people are name-only strings; keep them visible so old
  // threads have a cast too, but never invent an entity id for them.
  for (const person of legacyPeople) {
    const name = person?.trim();
    if (!name) continue;
    const key = rosterKey({ entityId: null, name });
    const linkedAlready = [...byKey.values()].some(
      (e) => e.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (linkedAlready || byKey.has(key)) continue;
    byKey.set(key, {
      entityId: null,
      name,
      kind: 'character',
      role: 'mentioned',
      status: 'active',
      source: 'auto',
      mentions: 1,
      firstSeenRef: null,
      lastSeenRef: null,
      pinned: false,
    });
  }

  const entries = [...byKey.values()];
  const maxMentions = entries.reduce((max, e) => Math.max(max, e.mentions), 0);
  for (const entry of entries) entry.role = rosterRole(entry.mentions, maxMentions);
  return entries.sort(
    (a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name),
  );
}

/** Apply user overrides — a user decision always beats the derivation. Pure. */
export function applyRosterOverrides(
  entries: RosterEntry[],
  overrides: Record<string, RosterOverride> | null | undefined,
): RosterEntry[] {
  if (!overrides) return entries;
  return entries
    .map((entry) => {
      const override = overrides[rosterKey(entry)];
      if (!override) return entry;
      return {
        ...entry,
        role: override.role ?? entry.role,
        status: override.status ?? entry.status,
        pinned: override.pinned ?? entry.pinned,
        source: 'user' as const,
      };
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.mentions - a.mentions || a.name.localeCompare(b.name);
    });
}

/** Cast members the chat should treat as "in scene" — excluded entries are out. */
export function activeRoster(entries: RosterEntry[]): RosterEntry[] {
  return entries.filter((e) => e.status === 'active');
}

export type ThreadRoster = {
  threadNumber: number | null;
  entries: RosterEntry[];
};

const ROSTER_SNAPSHOT_CAP = 60;

class ThreadRosterService {
  private async readThreadRow(userId: string, sessionId: string) {
    const withRefs = await supabaseAdmin
      .from('conversation_sessions')
      .select('id, metadata, thread_number')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!withRefs.error) return withRefs.data as { id: string; metadata: Record<string, unknown> | null; thread_number?: number | null } | null;
    const legacy = await supabaseAdmin
      .from('conversation_sessions')
      .select('id, metadata')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();
    return legacy.data as { id: string; metadata: Record<string, unknown> | null; thread_number?: number | null } | null;
  }

  /** Full derivation: messages + links + legacy people, overrides applied, snapshot cached. */
  async getRoster(userId: string, sessionId: string): Promise<ThreadRoster | null> {
    const row = await this.readThreadRow(userId, sessionId);
    if (!row) return null;
    const metadata = row.metadata ?? {};
    const threadMeta = (metadata.threadMeta ?? {}) as Record<string, unknown>;
    const overrides = (threadMeta.rosterOverrides ?? null) as Record<string, RosterOverride> | null;

    const { loadThreadMessages } = await import('./threadContentService');
    const [messages, { data: linkRows }] = await Promise.all([
      loadThreadMessages(userId, sessionId),
      supabaseAdmin
        .from('entity_conversation_links')
        .select('entity_type, entity_id, mention_count, metadata')
        .eq('user_id', userId)
        .eq('session_id', sessionId)
        .limit(200),
    ]);

    const legacyPeople = Array.isArray(threadMeta.people) ? (threadMeta.people as string[]) : [];
    const derived = deriveRosterEntries(
      messages,
      row.thread_number ?? null,
      (linkRows ?? []) as RosterLinkRow[],
      legacyPeople,
    );
    const entries = applyRosterOverrides(derived, overrides);

    // Cache a bounded snapshot so the chat hot path reads the cast without a
    // message scan. Best-effort: a failed cache write never fails the read.
    const snapshot = entries.slice(0, ROSTER_SNAPSHOT_CAP);
    void supabaseAdmin
      .from('conversation_sessions')
      .update({ metadata: { ...metadata, threadMeta: { ...threadMeta, roster: snapshot } } })
      .eq('id', sessionId)
      .eq('user_id', userId)
      .then(({ error }) => {
        if (error) logger.warn({ err: error, sessionId }, 'threadRoster: snapshot cache write failed');
      });

    return { threadNumber: row.thread_number ?? null, entries };
  }

  /** Persist a user override and return the refreshed roster. */
  async setOverride(
    userId: string,
    sessionId: string,
    key: string,
    override: RosterOverride,
  ): Promise<ThreadRoster | null> {
    const row = await this.readThreadRow(userId, sessionId);
    if (!row) return null;
    const metadata = row.metadata ?? {};
    const threadMeta = (metadata.threadMeta ?? {}) as Record<string, unknown>;
    const overrides = { ...((threadMeta.rosterOverrides ?? {}) as Record<string, RosterOverride>) };
    overrides[key] = { ...overrides[key], ...override };

    const { error } = await supabaseAdmin
      .from('conversation_sessions')
      .update({ metadata: { ...metadata, threadMeta: { ...threadMeta, rosterOverrides: overrides } } })
      .eq('id', sessionId)
      .eq('user_id', userId);
    if (error) {
      logger.warn({ err: error, sessionId, key }, 'threadRoster: override write failed');
      return null;
    }
    return this.getRoster(userId, sessionId);
  }

  /**
   * Cheap cast context for the chat hot path: cached snapshot + overrides only,
   * no message scan. Returns linked active cast plus ids the user excluded.
   */
  async getChatRosterContext(
    userId: string,
    sessionId: string,
  ): Promise<{ cast: Array<{ id: string; name: string; type: string }>; excludedIds: Set<string> }> {
    const empty = { cast: [], excludedIds: new Set<string>() };
    try {
      const row = await this.readThreadRow(userId, sessionId);
      const threadMeta = ((row?.metadata ?? {}).threadMeta ?? {}) as Record<string, unknown>;
      const snapshot = Array.isArray(threadMeta.roster) ? (threadMeta.roster as RosterEntry[]) : [];
      const overrides = (threadMeta.rosterOverrides ?? null) as Record<string, RosterOverride> | null;
      const entries = applyRosterOverrides(snapshot, overrides);
      const excludedIds = new Set(
        entries.filter((e) => e.status === 'excluded' && e.entityId).map((e) => e.entityId!),
      );
      const cast = activeRoster(entries)
        .filter((e): e is RosterEntry & { entityId: string } => !!e.entityId)
        .map((e) => ({ id: e.entityId, name: e.name, type: e.kind }));
      return { cast, excludedIds };
    } catch (err) {
      logger.warn({ err, sessionId }, 'threadRoster: chat context read failed');
      return empty;
    }
  }
}

export const threadRosterService = new ThreadRosterService();
