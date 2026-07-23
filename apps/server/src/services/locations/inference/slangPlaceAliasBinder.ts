/**
 * Slang Place Alias Binder.
 *
 * Turns slang-toponym place candidates ("Weeb City") into ALIASES of the lore
 * entity they actually refer to (the "Anime Expo" event, the venue it happens
 * at) instead of standalone Place cards. Also retroactively reconciles slang
 * place cards that were created before this layer existed, and records source
 * provenance (tweet URL, journal entry, chat thread) on the target card every
 * time the alias is referenced.
 *
 * Persistence shapes (all additive, read by the location detail UI):
 *   locations.aliases            — text[] column (canonical alias list)
 *   metadata.aliases             — mirrored for UI display + merge service
 *   metadata.alias_sources[]     — { alias, source, url?, entry_id?, excerpt?, bound_at, signals }
 *   metadata.sources[]           — mention provenance refs (same shape, per mention)
 *   metadata.media[]             — { url, type, alt?, source, source_url?, entry_id?, captured_at? }
 *   resolved_events.metadata     — same aliases/alias_sources/sources/media keys
 */

import { logger } from '../../../logger';
import { normalizeNameKey } from '../../../utils/nameNormalization';
import {
  detectSlangToponym,
  inferSlangToponymReferent,
  type SlangInferenceResult,
  type SlangReferentCandidate,
} from '../../lorebook/quality/slangToponymResolver';

import { supabaseAdmin } from '../../supabaseClient';
import { correctionAuthority } from '../../provenance/CorrectionAuthority';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SourceRef {
  /** Where the mention came from. */
  source: 'x_post' | 'journal' | 'chat';
  url?: string;
  entryId?: string;
  threadId?: string;
  excerpt?: string;
  /** Timestamp of the source mention. */
  at?: string;
}

export interface MediaRef {
  url: string;
  type: 'photo' | 'video' | 'animated_gif';
  alt?: string;
  source: 'x_post' | 'upload';
  sourceUrl?: string;
  entryId?: string;
  capturedAt?: string;
}

interface EventRow {
  id: string;
  title: string;
  summary: string | null;
  tags: string[] | null;
  start_time: string | null;
  metadata: Record<string, unknown> | null;
  updated_at?: string | null;
}

interface LocationRow {
  id: string;
  name: string;
  aliases: string[] | null;
  summary?: string | null;
  metadata: Record<string, unknown> | null;
  updated_at?: string | null;
}

export interface BindResult {
  bound: boolean;
  disposition: SlangInferenceResult['disposition'];
  targetKind?: 'event' | 'place';
  targetId?: string;
  targetName?: string;
  confidence?: number;
  signals?: string[];
}

export interface SlangBinderDeps {
  loadEvents: (userId: string) => Promise<EventRow[]>;
  loadLocations: (userId: string) => Promise<LocationRow[]>;
  updateEventMetadata: (userId: string, id: string, metadata: Record<string, unknown>) => Promise<void>;
  updateLocation: (
    userId: string,
    id: string,
    patch: { aliases?: string[]; metadata: Record<string, unknown> },
  ) => Promise<void>;
  deleteLocation: (userId: string, id: string) => Promise<void>;
}

const defaultDeps: SlangBinderDeps = {
  async loadEvents(userId) {
    const { data } = await supabaseAdmin
      .from('resolved_events')
      .select('id, title, summary, tags, start_time, metadata, updated_at')
      .eq('user_id', userId);
    return (data ?? []) as EventRow[];
  },
  async loadLocations(userId) {
    const { data } = await supabaseAdmin
      .from('locations')
      .select('id, name, aliases, summary, metadata, updated_at')
      .eq('user_id', userId);
    return (data ?? []) as LocationRow[];
  },
  async updateEventMetadata(userId, id, metadata) {
    await supabaseAdmin
      .from('resolved_events')
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('id', id);
  },
  async updateLocation(userId, id, patch) {
    const update: Record<string, unknown> = {
      metadata: patch.metadata,
      updated_at: new Date().toISOString(),
    };
    if (patch.aliases) update.aliases = patch.aliases;
    await supabaseAdmin.from('locations').update(update).eq('user_id', userId).eq('id', id);
  },
  async deleteLocation(userId, id) {
    await supabaseAdmin.from('locations').delete().eq('user_id', userId).eq('id', id);
  },
};

// ── Metadata helpers ─────────────────────────────────────────────────────────

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    : [];
}

function recordList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === 'object')
    : [];
}

function metadataCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function addUniqueString(list: string[], value: string): string[] {
  const key = normalizeNameKey(value);
  if (list.some((v) => normalizeNameKey(v) === key)) return list;
  return [...list, value];
}

function sourceRefRecord(ref: SourceRef): Record<string, unknown> {
  return {
    source: ref.source,
    ...(ref.url ? { url: ref.url } : {}),
    ...(ref.entryId ? { entry_id: ref.entryId } : {}),
    ...(ref.threadId ? { thread_id: ref.threadId } : {}),
    ...(ref.excerpt ? { excerpt: ref.excerpt.slice(0, 240) } : {}),
    at: ref.at ?? new Date().toISOString(),
  };
}

function sourceRefKey(rec: Record<string, unknown>): string {
  return [rec.source, rec.url, rec.entry_id, rec.thread_id, normalizeNameKey(String(rec.excerpt ?? ''))].join('|');
}

function appendSourceRef(metadata: Record<string, unknown>, key: 'sources' | 'alias_sources', rec: Record<string, unknown>): boolean {
  const list = recordList(metadata[key]);
  const k = sourceRefKey(rec);
  if (list.some((r) => sourceRefKey(r) === k)) return false;
  metadata[key] = [...list, rec].slice(-50);
  return true;
}

export function appendMediaRefs(metadata: Record<string, unknown>, refs: MediaRef[]): number {
  const list = recordList(metadata.media);
  const seen = new Set(list.map((m) => String(m.url ?? '')));
  let added = 0;
  for (const ref of refs) {
    if (!ref.url || seen.has(ref.url)) continue;
    seen.add(ref.url);
    list.push({
      url: ref.url,
      type: ref.type,
      ...(ref.alt ? { alt: ref.alt } : {}),
      source: ref.source,
      ...(ref.sourceUrl ? { source_url: ref.sourceUrl } : {}),
      ...(ref.entryId ? { entry_id: ref.entryId } : {}),
      ...(ref.capturedAt ? { captured_at: ref.capturedAt } : {}),
      added_at: new Date().toISOString(),
    });
    added += 1;
  }
  if (added > 0) metadata.media = list.slice(-100);
  return added;
}

// ── Recurrence extraction ────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/**
 * Pull an annual recurrence ("every 4th of July", "every July 4", "annual …
 * each July") out of lore text the user gave us. This is how "AX happens every
 * 4th of July" becomes a temporal signal without any schema change.
 */
export function extractAnnualRecurrence(text: string | null | undefined): { month: number; day: number } | null {
  if (!text) return null;
  const t = text.toLowerCase();

  // "every 4th of july" / "each 4th of july"
  let m = t.match(/\b(?:every|each|annual(?:ly)?\s+on)\s+(\d{1,2})(?:st|nd|rd|th)?\s+of\s+([a-z]+)/);
  if (m && MONTH_NAMES[m[2]]) return { month: MONTH_NAMES[m[2]], day: Number(m[1]) };

  // "every july 4" / "every july 4th"
  m = t.match(/\b(?:every|each|annual(?:ly)?\s+on)\s+([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (m && MONTH_NAMES[m[1]]) return { month: MONTH_NAMES[m[1]], day: Number(m[2]) };

  // "takes place every july" — anchor mid-month as a coarse window
  m = t.match(/\b(?:every|each)\s+([a-z]+)\b/);
  if (m && MONTH_NAMES[m[1]]) return { month: MONTH_NAMES[m[1]], day: 15 };

  return null;
}

// ── Candidate assembly ───────────────────────────────────────────────────────

function eventToCandidate(e: EventRow): SlangReferentCandidate {
  const meta = e.metadata ?? {};
  const occurredDates = [
    ...(e.start_time ? [e.start_time] : []),
    ...stringList(meta.occurred_dates),
  ];
  const metaRecurrence = meta.annual_recurrence as { month?: number; day?: number } | undefined;
  const annualRecurrence =
    metaRecurrence && typeof metaRecurrence.month === 'number' && typeof metaRecurrence.day === 'number'
      ? { month: metaRecurrence.month, day: metaRecurrence.day }
      : extractAnnualRecurrence(e.summary) ?? extractAnnualRecurrence(String(meta.recurrence ?? ''));

  return {
    id: e.id,
    kind: 'event',
    name: e.title,
    aliases: stringList(meta.aliases),
    summary: e.summary,
    tags: e.tags ?? [],
    occurredDates,
    annualRecurrence,
    lastMentionedAt: e.updated_at ?? e.start_time ?? null,
  };
}

function locationToCandidate(l: LocationRow): SlangReferentCandidate {
  const meta = l.metadata ?? {};
  return {
    id: l.id,
    kind: 'place',
    name: l.name,
    aliases: [...(l.aliases ?? []), ...stringList(meta.aliases)],
    summary: (l.summary as string | null) ?? (typeof meta.description === 'string' ? meta.description : null),
    tags: stringList(meta.tags),
    lastMentionedAt: l.updated_at ?? null,
  };
}

// ── Binder ───────────────────────────────────────────────────────────────────

export class SlangPlaceAliasBinder {
  constructor(private readonly deps: SlangBinderDeps = defaultDeps) {}

  /** Case-insensitive alias/title lookup across events and places. */
  private findByNameOrAlias(
    key: string,
    events: EventRow[],
    locations: LocationRow[],
  ): { kind: 'event'; row: EventRow } | { kind: 'place'; row: LocationRow } | null {
    for (const e of events) {
      const names = [e.title, ...stringList(e.metadata?.aliases)];
      if (names.some((n) => normalizeNameKey(n) === key)) return { kind: 'event', row: e };
    }
    for (const l of locations) {
      const names = [l.name, ...(l.aliases ?? []), ...stringList(l.metadata?.aliases)];
      if (names.some((n) => normalizeNameKey(n) === key)) return { kind: 'place', row: l };
    }
    return null;
  }

  /**
   * Resolve one slang place candidate against the user's lore. When it binds,
   * the alias + provenance land on the target card and the caller should NOT
   * create/suggest a Place. When the name is already a known alias, only fresh
   * mention provenance is recorded.
   */
  async resolveCandidate(
    userId: string,
    name: string,
    opts: { evidence?: string; sourceDate?: string; sourceRef?: SourceRef; media?: MediaRef[] } = {},
  ): Promise<BindResult> {
    const [events, locations] = await this.loadAll(userId);
    return this.resolveWithData(userId, name, opts, events, locations);
  }

  /** Batch variant: one events/locations load for a whole suggestion list. */
  async resolveMany(
    userId: string,
    items: Array<{ name: string; evidence?: string; sourceDate?: string; sourceRef?: SourceRef; media?: MediaRef[] }>,
  ): Promise<Map<string, BindResult>> {
    const out = new Map<string, BindResult>();
    if (items.length === 0) return out;
    const [events, locations] = await this.loadAll(userId);
    for (const item of items) {
      const key = normalizeNameKey(item.name);
      if (!key || out.has(key)) continue;
      out.set(key, await this.resolveWithData(userId, item.name, item, events, locations));
    }
    return out;
  }

  private async loadAll(userId: string): Promise<[EventRow[], LocationRow[]]> {
    return Promise.all([
      this.deps.loadEvents(userId).catch(() => [] as EventRow[]),
      this.deps.loadLocations(userId).catch(() => [] as LocationRow[]),
    ]);
  }

  private async resolveWithData(
    userId: string,
    name: string,
    opts: { evidence?: string; sourceDate?: string; sourceRef?: SourceRef; media?: MediaRef[] },
    events: EventRow[],
    locations: LocationRow[],
  ): Promise<BindResult> {
    const key = normalizeNameKey(name);
    if (!key) return { bound: false, disposition: 'none' };

    // Already a known alias → record the new mention and swallow the suggestion.
    const known = this.findByNameOrAlias(key, events, locations);
    if (known) {
      await this.recordMention(userId, known, opts);
      return {
        bound: true,
        disposition: 'auto_alias',
        targetKind: known.kind,
        targetId: known.row.id,
        targetName: known.kind === 'event' ? known.row.title : known.row.name,
      };
    }

    if (!detectSlangToponym(name).isSlangToponym) return { bound: false, disposition: 'none' };

    const result = inferSlangToponymReferent({
      name,
      evidence: opts.evidence,
      sourceDate: opts.sourceDate,
      candidates: [...events.map(eventToCandidate), ...locations.map(locationToCandidate)],
    });

    if (result.disposition !== 'auto_alias' || !result.target) {
      return { bound: false, disposition: result.disposition };
    }

    await this.registerAlias(userId, result.target, name, {
      ...opts,
      signals: result.signals,
      events,
      locations,
    });

    return {
      bound: true,
      disposition: 'auto_alias',
      targetKind: result.target.kind,
      targetId: result.target.id,
      targetName: result.target.name,
      confidence: result.confidence,
      signals: result.signals,
    };
  }

  private async registerAlias(
    userId: string,
    target: SlangReferentCandidate,
    alias: string,
    opts: {
      sourceRef?: SourceRef;
      evidence?: string;
      sourceDate?: string;
      media?: MediaRef[];
      signals?: string[];
      events: EventRow[];
      locations: LocationRow[];
    },
  ): Promise<void> {
    const ref = sourceRefRecord(
      opts.sourceRef ?? { source: 'journal', excerpt: opts.evidence, at: opts.sourceDate },
    );
    const aliasRec = { alias, ...ref, ...(opts.signals?.length ? { signals: opts.signals } : {}) };

    if (target.kind === 'event') {
      const row = opts.events.find((e) => e.id === target.id);
      if (!row) return;
      const metadata = { ...(row.metadata ?? {}) };
      metadata.aliases = addUniqueString(stringList(metadata.aliases), alias);
      appendSourceRef(metadata, 'alias_sources', aliasRec);
      appendSourceRef(metadata, 'sources', ref);
      if (opts.media?.length) appendMediaRefs(metadata, opts.media);
      await this.deps.updateEventMetadata(userId, row.id, metadata);
      row.metadata = metadata;
      logger.info({ userId, alias, eventId: row.id, title: row.title, signals: opts.signals }, 'Bound slang toponym as event alias');
      return;
    }

    const row = opts.locations.find((l) => l.id === target.id);
    if (!row) return;
    const metadata = { ...(row.metadata ?? {}) };
    metadata.aliases = addUniqueString(stringList(metadata.aliases), alias);
    appendSourceRef(metadata, 'alias_sources', aliasRec);
    appendSourceRef(metadata, 'sources', ref);
    if (opts.media?.length) appendMediaRefs(metadata, opts.media);
    const aliases = addUniqueString(row.aliases ?? [], alias);
    await this.deps.updateLocation(userId, row.id, { aliases, metadata });
    row.metadata = metadata;
    row.aliases = aliases;
    logger.info({ userId, alias, locationId: row.id, name: row.name, signals: opts.signals }, 'Bound slang toponym as place alias');
  }

  /** Record mention provenance (and any photos) on an already-known target. */
  private async recordMention(
    userId: string,
    target: { kind: 'event'; row: EventRow } | { kind: 'place'; row: LocationRow },
    opts: { evidence?: string; sourceDate?: string; sourceRef?: SourceRef; media?: MediaRef[] },
  ): Promise<void> {
    const ref = sourceRefRecord(
      opts.sourceRef ?? { source: 'journal', excerpt: opts.evidence, at: opts.sourceDate },
    );
    const metadata = { ...(target.row.metadata ?? {}) };
    const addedSource = appendSourceRef(metadata, 'sources', ref);
    const addedMedia = opts.media?.length ? appendMediaRefs(metadata, opts.media) : 0;
    if (!addedSource && addedMedia === 0) return;

    if (target.kind === 'event') {
      await this.deps.updateEventMetadata(userId, target.row.id, metadata);
    } else {
      await this.deps.updateLocation(userId, target.row.id, { metadata });
    }
    target.row.metadata = metadata;
  }

  /**
   * Attach photos carried by source entries (X posts with media) to the lore
   * entities the entry text mentions — event cards and place cards alike —
   * with a provenance ref back to the source. Idempotent by media URL.
   */
  async attachEntryMedia(
    userId: string,
    entries: Array<{ id: string; content: string; date?: string; sourceRef?: SourceRef; media: MediaRef[] }>,
  ): Promise<{ attached: number }> {
    const withMedia = entries.filter((e) => e.media.length > 0 && e.content?.trim());
    if (withMedia.length === 0) return { attached: 0 };

    const [events, locations] = await this.loadAll(userId);
    let attached = 0;

    for (const entry of withMedia) {
      const contentKey = ` ${normalizeNameKey(entry.content)} `;
      const targets: Array<{ kind: 'event'; row: EventRow } | { kind: 'place'; row: LocationRow }> = [];

      for (const e of events) {
        const names = [e.title, ...stringList(e.metadata?.aliases)];
        if (names.some((n) => {
          const k = normalizeNameKey(n);
          return k.length >= 3 && contentKey.includes(` ${k} `);
        })) {
          targets.push({ kind: 'event', row: e });
        }
      }
      for (const l of locations) {
        const names = [l.name, ...(l.aliases ?? []), ...stringList(l.metadata?.aliases)];
        if (names.some((n) => {
          const k = normalizeNameKey(n);
          return k.length >= 3 && contentKey.includes(` ${k} `);
        })) {
          targets.push({ kind: 'place', row: l });
        }
      }

      for (const target of targets) {
        const metadata = { ...(target.row.metadata ?? {}) };
        const added = appendMediaRefs(metadata, entry.media);
        const addedSource = appendSourceRef(
          metadata,
          'sources',
          sourceRefRecord(entry.sourceRef ?? { source: 'journal', entryId: entry.id, excerpt: entry.content, at: entry.date }),
        );
        if (added === 0 && !addedSource) continue;
        if (target.kind === 'event') {
          await this.deps.updateEventMetadata(userId, target.row.id, metadata);
        } else {
          await this.deps.updateLocation(userId, target.row.id, { metadata });
        }
        target.row.metadata = metadata;
        attached += added;
      }
    }

    if (attached > 0) logger.info({ userId, attached }, 'Attached entry media to lore galleries');
    return { attached };
  }

  /**
   * Retroactively reconcile slang place CARDS that were created before this
   * layer existed ("Weeb City" as a standalone Place). When a card's name
   * auto-resolves to another lore entity, the card is folded in as an alias:
   * its provenance/media move to the target, a full snapshot is kept in the
   * target's metadata, and the card is deleted.
   */
  async reconcileExistingSlangPlaceCards(userId: string): Promise<{ reconciled: number; flaggedForReview: number }> {
    const [events, locations] = await Promise.all([
      this.deps.loadEvents(userId).catch(() => [] as EventRow[]),
      this.deps.loadLocations(userId).catch(() => [] as LocationRow[]),
    ]);

    let reconciled = 0;
    let flaggedForReview = 0;

    for (const card of locations) {
      const detection = detectSlangToponym(card.name);
      if (!detection.isSlangToponym) continue;

      const candidates = [
        ...events.map(eventToCandidate),
        ...locations.filter((l) => l.id !== card.id).map(locationToCandidate),
      ];
      const cardMeta = card.metadata ?? {};
      const result = inferSlangToponymReferent({
        name: card.name,
        evidence: typeof cardMeta.context === 'string' ? cardMeta.context : undefined,
        sourceDate: typeof cardMeta.first_seen_at === 'string' ? cardMeta.first_seen_at : card.updated_at ?? undefined,
        candidates,
      });

      if (result.disposition === 'auto_alias' && result.target) {
        await this.foldCardIntoTarget(userId, card, result, events, locations);
        reconciled += 1;
        continue;
      }

      if (result.disposition === 'review' && result.target) {
        const metadata = { ...cardMeta };
        const existing = metadata.suggested_alias_of as Record<string, unknown> | undefined;
        if (existing?.target_id === result.target.id) continue;
        metadata.suggested_alias_of = {
          target_kind: result.target.kind,
          target_id: result.target.id,
          target_name: result.target.name,
          confidence: result.confidence,
          signals: result.signals,
          suggested_at: new Date().toISOString(),
        };
        await this.deps.updateLocation(userId, card.id, { metadata });
        flaggedForReview += 1;
      }
    }

    return { reconciled, flaggedForReview };
  }

  private async foldCardIntoTarget(
    userId: string,
    card: LocationRow,
    result: SlangInferenceResult,
    events: EventRow[],
    locations: LocationRow[],
  ): Promise<void> {
    const target = result.target!;
    const cardMeta = { ...(card.metadata ?? {}) };
    const legacyVisitCount = Math.max(
      metadataCount(cardMeta.visitCount),
      metadataCount(cardMeta.visit_count),
    );
    delete cardMeta.visitCount;
    delete cardMeta.visit_count;
    const carriedSources = recordList(cardMeta.sources);
    const carriedMedia = recordList(cardMeta.media);
    const snapshot = {
      folded_from: 'location_card',
      location_id: card.id,
      name: card.name,
      metadata: cardMeta,
      folded_at: new Date().toISOString(),
      confidence: result.confidence,
      signals: result.signals,
    };

    const apply = (metadata: Record<string, unknown>) => {
      delete metadata.visitCount;
      delete metadata.visit_count;
      metadata.aliases = addUniqueString(stringList(metadata.aliases), card.name);
      appendSourceRef(metadata, 'alias_sources', {
        alias: card.name,
        source: 'journal',
        excerpt: typeof cardMeta.context === 'string' ? cardMeta.context : undefined,
        at: new Date().toISOString(),
        signals: result.signals,
      } as Record<string, unknown>);
      for (const s of carriedSources) appendSourceRef(metadata, 'sources', s);
      if (carriedMedia.length > 0) {
        appendMediaRefs(
          metadata,
          carriedMedia
            .filter((m) => typeof m.url === 'string')
            .map((m) => ({
              url: String(m.url),
              type: (m.type as MediaRef['type']) ?? 'photo',
              alt: typeof m.alt === 'string' ? m.alt : undefined,
              source: (m.source as MediaRef['source']) ?? 'x_post',
              sourceUrl: typeof m.source_url === 'string' ? m.source_url : undefined,
              entryId: typeof m.entry_id === 'string' ? m.entry_id : undefined,
              capturedAt: typeof m.captured_at === 'string' ? m.captured_at : undefined,
            })),
        );
      }
      const folded = recordList(metadata.folded_cards);
      metadata.folded_cards = [...folded, snapshot].slice(-20);
      if (target.kind === 'event') {
        metadata.attendanceCount = Math.max(
          metadataCount(metadata.attendanceCount),
          legacyVisitCount,
        );
        metadata.eventOccurrenceCount = Math.max(
          metadataCount(metadata.eventOccurrenceCount),
          legacyVisitCount,
        );
        metadata.mentionCount = Math.max(
          metadataCount(metadata.mentionCount),
          carriedSources.length,
          legacyVisitCount,
        );
      }
    };

    if (target.kind === 'event') {
      const row = events.find((e) => e.id === target.id);
      if (!row) return;
      const metadata = { ...(row.metadata ?? {}) };
      apply(metadata);
      await this.deps.updateEventMetadata(userId, row.id, metadata);
    } else {
      const row = locations.find((l) => l.id === target.id);
      if (!row) return;
      const metadata = { ...(row.metadata ?? {}) };
      apply(metadata);
      await this.deps.updateLocation(userId, row.id, {
        aliases: addUniqueString(row.aliases ?? [], card.name),
        metadata,
      });
    }

    // This is an ontology correction (a slang place-shaped phrase referring to
    // an event/place), not an identity merge. Record the semantic distinction
    // before the legacy card is removed so the operation is never silent.
    await correctionAuthority.recordSystemMutation({
      userId,
      artifactType: 'entity',
      artifactId: card.id,
      mutationType: 'ENTITY_CLASSIFICATION_CORRECTION',
      beforeState: { kind: 'location', id: card.id, name: card.name, metadata: cardMeta },
      afterState: {
        action: 'ALIAS_BOUND_TO_REFERENT',
        target_kind: target.kind,
        target_id: target.id,
        target_name: target.name,
        derived_state_invalidated: true,
      },
      rationale: `Slang toponym resolved with confidence ${result.confidence}`,
    });
    await this.deps.deleteLocation(userId, card.id);
    logger.info(
      { userId, card: card.name, targetKind: target.kind, targetName: target.name, confidence: result.confidence },
      'Folded slang place card into lore entity as alias',
    );
  }
}

export const slangPlaceAliasBinder = new SlangPlaceAliasBinder();
