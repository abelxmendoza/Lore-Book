/**
 * Timeline Foundation Service — Sprint E
 *
 * Memory + Characters + Relationships → Timeline Events
 *
 * Pipeline (two-step write — FK constraint requires this order):
 *   journal_entry
 *   → resolved_events (one per unique meaningful entry)
 *   → character_timeline_events (one per character linked to that entry)
 *
 * Architecture:
 *   character_timeline_events.event_id FK → resolved_events.id
 *   character_timeline_events.character_id FK → characters.id
 *   character_timeline_events.connection_character_id FK → characters.id (optional)
 *
 * Rules:
 *   - One resolved_event per journal entry (keyed on source_entry_id)
 *   - One character_timeline_event per (character_id, event_id) pair
 *   - Bad entries are filtered (empty content, pure meta-questions)
 *   - Duplicate content entries (same contentHash) get one shared resolved_event
 *   - No LLM — classification is rule-based from content + tags
 */

import { v4 as uuid } from 'uuid';
import { logger } from '../logger';
import { ruleBasedTitleGenerationService } from './ruleBasedTitleGeneration';
import { computeSourceInputVersion } from './projectionVersion';
import { supabaseAdmin } from './supabaseClient';

// ── Event type classification ─────────────────────────────────────────────────

type EventType =
  | 'life_context'
  | 'relationship_event'
  | 'relationship_conflict'
  | 'relationship_separation'
  | 'career_event'
  | 'activity'
  | 'living_situation';

// Allowed values from character_timeline_events_timeline_type_check constraint
type TimelineType = 'shared_experience' | 'lore' | 'mentioned_in';
// Allowed values from character_timeline_events_emotional_impact_check constraint
type EmotionalImpact = 'positive' | 'negative' | 'neutral' | 'mixed';

type ClassifiedEvent = {
  eventType: EventType;
  timelineType: TimelineType;
  title: string;
  summary: string;
  confidence: number;
  emotionalImpact: EmotionalImpact | null;
};

function mapMoodToImpact(mood: string | null): EmotionalImpact | null {
  if (!mood) return null;
  const lower = mood.toLowerCase();
  if (['happy', 'excited', 'proud', 'grateful', 'hopeful', 'focused'].includes(lower)) return 'positive';
  if (['hurt', 'sad', 'frustrated', 'angry', 'anxious', 'devastated'].includes(lower)) return 'negative';
  if (['conflicted', 'mixed', 'bittersweet', 'complicated'].includes(lower)) return 'mixed';
  return 'neutral';
}

const BAD_CONTENT_PATTERNS = [
  /^distilled:\s*"?EMPTY"?$/i,
  /^hey so do you remember/i,
  /^what do you remember about me/i,
  /^nah you remember/i,
  /^aww (man|that)/i,
];

function isBadContent(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length < 20) return true;
  return BAD_CONTENT_PATTERNS.some(p => p.test(trimmed));
}

// Title preference: user's own summary → contextual rule-based title from the
// entry content → generic event-type label. Keeps "Untitled"/bare type names
// off the timeline whenever there is any content to name the event from.
function eventTitle(summary: string | null, content: string, fallback: string): string {
  if (summary && summary.trim().length > 0) return summary;
  const generated = ruleBasedTitleGenerationService.generateTitle(content);
  return generated && generated.length >= 8 ? generated : fallback;
}

function classifyEntry(
  content: string,
  tags: string[],
  mood: string | null,
  summary: string | null
): ClassifiedEvent {
  const lower = content.toLowerCase();
  const tagSet = new Set(tags.map(t => t.toLowerCase()));
  const impact = mapMoodToImpact(mood);

  // ── Relationship separation ────────────────────────────────────────────────
  if (
    tagSet.has('heartbreak') ||
    tagSet.has('no contact') ||
    /blocked.*instagram|instagram.*blocked|no.contact|no contact/i.test(lower)
  ) {
    return {
      eventType: 'relationship_separation',
      timelineType: 'shared_experience',
      title: eventTitle(summary, content, 'Relationship ended — blocked and no contact'),
      summary: content.slice(0, 400),
      confidence: 0.9,
      emotionalImpact: impact,
    };
  }

  // ── Relationship conflict ──────────────────────────────────────────────────
  if (
    (tagSet.has('romance') || tagSet.has('romantic') || tagSet.has('relationships')) &&
    /missed.*birthday|birthday.*missed|left.*on read|disrespect/i.test(lower)
  ) {
    return {
      eventType: 'relationship_conflict',
      timelineType: 'shared_experience',
      title: eventTitle(summary, content, 'Romantic conflict'),
      summary: content.slice(0, 400),
      confidence: 0.85,
      emotionalImpact: impact,
    };
  }

  // ── Relationship event (general) ───────────────────────────────────────────
  if (tagSet.has('romance') || tagSet.has('romantic') || tagSet.has('relationships')) {
    return {
      eventType: 'relationship_event',
      timelineType: 'shared_experience',
      title: eventTitle(summary, content, 'Relationship update'),
      summary: content.slice(0, 400),
      confidence: 0.8,
      emotionalImpact: impact,
    };
  }

  // ── Career event ───────────────────────────────────────────────────────────
  if (tagSet.has('interview') || /interview|epirus|job offer|hired|fired|promoted/i.test(lower)) {
    return {
      eventType: 'career_event',
      timelineType: 'lore',
      title: eventTitle(summary, content, 'Career event'),
      summary: content.slice(0, 400),
      confidence: 0.85,
      emotionalImpact: impact,
    };
  }

  // ── Living situation ───────────────────────────────────────────────────────
  if (
    tagSet.has('living situation') ||
    /live.*with.*family|family members.*crowded|kitchen.*crowded|crowded.*house/i.test(lower)
  ) {
    return {
      eventType: 'living_situation',
      timelineType: 'lore',
      title: eventTitle(summary, content, 'Living situation'),
      summary: content.slice(0, 400),
      confidence: 0.85,
      emotionalImpact: impact,
    };
  }

  // ── Activity ───────────────────────────────────────────────────────────────
  if (
    tagSet.has('costco') || tagSet.has('shopping') ||
    tagSet.has('app development') || tagSet.has('abuelas house') ||
    /went to|shopping|building.*app|costco|visited/i.test(lower)
  ) {
    return {
      eventType: 'activity',
      timelineType: 'lore',
      title: eventTitle(summary, content, 'Activity'),
      summary: content.slice(0, 400),
      confidence: 0.85,
      emotionalImpact: impact,
    };
  }

  // ── Life context (default) ─────────────────────────────────────────────────
  return {
    eventType: 'life_context',
    timelineType: 'lore',
    title: eventTitle(summary, content, 'Life update'),
    summary: content.slice(0, 400),
    confidence: 0.75,
    emotionalImpact: impact,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

class TimelineFoundationService {
  /**
   * Main pipeline: generate timeline events for all characters of a user.
   * Runs over character_memories to find which entries each character is
   * linked to, then creates resolved_events + character_timeline_events.
   */
  async generateTimelines(userId: string): Promise<{
    resolvedEventsCreated: number;
    timelineEventsCreated: number;
    skipped: number;
  }> {
    const stats = { resolvedEventsCreated: 0, timelineEventsCreated: 0, skipped: 0 };

    // ── Load all character→entry links ───────────────────────────────────────
    const { data: memLinks } = await supabaseAdmin
      .from('character_memories')
      .select('character_id, journal_entry_id')
      .eq('user_id', userId);

    if (!memLinks?.length) {
      logger.info({ userId }, 'No character_memories — nothing to generate');
      return stats;
    }

    // Build entry→characters map (one entry can belong to many characters)
    const entryToChars = new Map<string, Set<string>>();
    for (const link of memLinks) {
      if (!entryToChars.has(link.journal_entry_id)) {
        entryToChars.set(link.journal_entry_id, new Set());
      }
      entryToChars.get(link.journal_entry_id)!.add(link.character_id);
    }

    // ── Load journal entries ────────────────────────────────────────────────
    const entryIds = Array.from(entryToChars.keys());
    const { data: entries } = await supabaseAdmin
      .from('journal_entries')
      .select('id, date, content, summary, mood, tags, emotional_intensity, metadata')
      .in('id', entryIds)
      .order('date', { ascending: true });

    // ── Load characters for connection_character_id resolution ──────────────
    const { data: chars } = await supabaseAdmin
      .from('characters')
      .select('id, name')
      .eq('user_id', userId);

    const charByName = new Map((chars ?? []).map(c => [c.name.toLowerCase(), c.id]));

    // ── Track which resolved_events already exist (by source_entry_id) ──────
    // source_entry_id lives in metadata (resolved_events has no direct column for it)
    const { data: existingResolved } = await supabaseAdmin
      .from('resolved_events')
      .select('id, metadata')
      .eq('user_id', userId)
      .eq('metadata->>generated_by', 'timeline_foundation');

    const resolvedByEntry = new Map(
      (existingResolved ?? [])
        .filter(r => (r.metadata as any)?.source_entry_id)
        .map(r => [(r.metadata as any).source_entry_id as string, r.id])
    );

    // ── Track which character_timeline_events already exist ─────────────────
    const { data: existingCTE } = await supabaseAdmin
      .from('character_timeline_events')
      .select('character_id, event_id')
      .eq('user_id', userId);

    const cteExistsKey = new Set(
      (existingCTE ?? []).map(e => `${e.character_id}::${e.event_id}`)
    );

    // ── Process each entry ───────────────────────────────────────────────────
    // Track contentHash deduplification — same hash = same event, reuse resolved_event
    const resolvedByHash = new Map<string, string>(); // contentHash → resolvedEventId

    for (const entry of entries ?? []) {
      if (isBadContent(entry.content)) {
        stats.skipped++;
        continue;
      }

      const contentHash = (entry.metadata as any)?.contentHash as string | undefined;
      const characters = entryToChars.get(entry.id) ?? new Set<string>();

      // Classify before creating resolved_event (title/type needed in the insert)
      const classified = classifyEntry(
        entry.content,
        entry.tags ?? [],
        entry.mood,
        entry.summary
      );

      // ── Step 1: Create or reuse resolved_event ───────────────────────────
      let resolvedEventId = resolvedByEntry.get(entry.id);

      if (!resolvedEventId && contentHash && resolvedByHash.has(contentHash)) {
        // Same content was already resolved via a duplicate entry — reuse that resolved_event
        resolvedEventId = resolvedByHash.get(contentHash)!;
      }

      if (!resolvedEventId) {
        const computedFromVersion = await computeSourceInputVersion(userId, [entry.id]);

        // Create new resolved_event
        const { data: newResolved, error: resolvedErr } = await supabaseAdmin
          .from('resolved_events')
          .insert({
            id: uuid(),
            user_id: userId,
            title: classified.title,
            summary: classified.summary,
            type: classified.eventType,
            start_time: entry.date,
            confidence: classified.confidence,
            tags: entry.tags ?? [],
            people: Array.from(characters),
            metadata: {
              generated_by: 'timeline_foundation',
              source_entry_id: entry.id,
              content_hash: contentHash,
              computed_from_version: computedFromVersion,
              emotional_intensity: entry.emotional_intensity,
            },
          })
          .select('id')
          .single();

        if (resolvedErr || !newResolved) {
          logger.error({ error: resolvedErr, entryId: entry.id }, 'Failed to create resolved_event');
          stats.skipped++;
          continue;
        }

        resolvedEventId = newResolved.id;
        resolvedByEntry.set(entry.id, resolvedEventId);
        if (contentHash) resolvedByHash.set(contentHash, resolvedEventId);
        stats.resolvedEventsCreated++;
      } else if (contentHash) {
        resolvedByHash.set(contentHash, resolvedEventId);
      }

      // ── Step 2: Create character_timeline_events ─────────────────────────

      // Find connection character (for relationship events: the "other" character)
      let connectionCharId: string | null = null;
      if (classified.timelineType === 'shared_experience' && characters.size >= 2) {
        // The connection character is any character other than the first one
        const charList = Array.from(characters);
        connectionCharId = charList[1] ?? null;
      } else if (classified.timelineType === 'shared_experience') {
        // Single character entry — try to infer connection from content
        if (/\bsol\b/i.test(entry.content)) {
          connectionCharId = charByName.get('sol') ?? null;
        } else if (/\babuela\b/i.test(entry.content)) {
          connectionCharId = charByName.get('abuela') ?? null;
        }
      }

      for (const characterId of characters) {
        const cteKey = `${characterId}::${resolvedEventId}`;
        if (cteExistsKey.has(cteKey)) continue;

        const { error: cteErr } = await supabaseAdmin
          .from('character_timeline_events')
          .insert({
            id: uuid(),
            user_id: userId,
            character_id: characterId,
            event_id: resolvedEventId,
            timeline_type: classified.timelineType,
            user_was_present: true,
            event_type: classified.eventType,
            event_title: classified.title,
            event_summary: classified.summary,
            event_date: entry.date,
            emotional_impact: classified.emotionalImpact,
            confidence: classified.confidence,
            connection_character_id:
              connectionCharId && connectionCharId !== characterId
                ? connectionCharId
                : null,
            source_entry_ids: [entry.id],
            metadata: {
              generated_by: 'timeline_foundation',
              content_hash: contentHash,
            },
          });

        if (cteErr) {
          logger.error({ error: cteErr, characterId, eventId: resolvedEventId }, 'Failed to create character_timeline_event');
        } else {
          cteExistsKey.add(cteKey);
          stats.timelineEventsCreated++;
        }
      }
    }

    return stats;
  }

  /**
   * Return the timeline for a single character as a chronological event list.
   */
  async getCharacterTimeline(userId: string, characterId: string): Promise<Array<{
    eventId: string;
    date: string;
    eventType: string;
    timelineType: string;
    title: string;
    summary: string;
    emotionalImpact: string | null;
    confidence: number;
    connectionCharacter: string | null;
    sourceEntryIds: string[];
  }>> {
    const { data, error } = await supabaseAdmin
      .from('character_timeline_events')
      .select(`
        id, event_id, event_date, event_type, timeline_type,
        event_title, event_summary, emotional_impact, confidence,
        connection_character_id, source_entry_ids
      `)
      .eq('user_id', userId)
      .eq('character_id', characterId)
      .order('event_date', { ascending: true });

    if (error) {
      logger.error({ error, characterId }, 'Failed to fetch character timeline');
      return [];
    }

    // Resolve connection character names
    const connectionIds = [...new Set(
      (data ?? []).map(e => e.connection_character_id).filter(Boolean)
    )];

    const { data: connChars } = connectionIds.length
      ? await supabaseAdmin.from('characters').select('id, name').in('id', connectionIds)
      : { data: [] };

    const nameMap = new Map((connChars ?? []).map(c => [c.id, c.name]));

    return (data ?? []).map(e => ({
      eventId: e.event_id,
      date: e.event_date,
      eventType: e.event_type,
      timelineType: e.timeline_type,
      title: e.event_title,
      summary: e.event_summary,
      emotionalImpact: e.emotional_impact,
      confidence: e.confidence,
      connectionCharacter: e.connection_character_id
        ? (nameMap.get(e.connection_character_id) ?? null)
        : null,
      sourceEntryIds: e.source_entry_ids ?? [],
    }));
  }

  /**
   * Re-derive a single resolved_event from its source journal entry.
   * Clears stale metadata after a source memory revision.
   */
  async refreshResolvedEvent(userId: string, resolvedEventId: string): Promise<boolean> {
    const { data: resolved } = await supabaseAdmin
      .from('resolved_events')
      .select('id, metadata')
      .eq('user_id', userId)
      .eq('id', resolvedEventId)
      .maybeSingle();

    if (!resolved) return false;

    const meta = (resolved.metadata ?? {}) as Record<string, unknown>;
    const sourceEntryId = meta.source_entry_id as string | undefined;
    if (!sourceEntryId) return false;

    const { data: entry } = await supabaseAdmin
      .from('journal_entries')
      .select('id, date, content, summary, mood, tags, emotional_intensity, metadata')
      .eq('user_id', userId)
      .eq('id', sourceEntryId)
      .maybeSingle();

    if (!entry || isBadContent(entry.content)) return false;

    const classified = classifyEntry(
      entry.content,
      entry.tags ?? [],
      entry.mood,
      entry.summary
    );
    const contentHash = (entry.metadata as Record<string, unknown> | null)?.contentHash as
      | string
      | undefined;
    const computedFromVersion = await computeSourceInputVersion(userId, [entry.id]);

    const {
      invalidated_at: _invAt,
      invalidation_reason: _invReason,
      invalidated_source_id: _invSrc,
      invalidated_source_type: _invType,
      stale: _stale,
      ...restMeta
    } = meta;

    const newMeta = {
      ...restMeta,
      generated_by: 'timeline_foundation',
      source_entry_id: entry.id,
      content_hash: contentHash,
      computed_from_version: computedFromVersion,
      stale: false,
      refreshed_at: new Date().toISOString(),
    };

    const { error: updateErr } = await supabaseAdmin
      .from('resolved_events')
      .update({
        title: classified.title,
        summary: classified.summary,
        type: classified.eventType,
        start_time: entry.date,
        confidence: classified.confidence,
        tags: entry.tags ?? [],
        metadata: newMeta,
        updated_at: new Date().toISOString(),
      })
      .eq('id', resolvedEventId)
      .eq('user_id', userId);

    if (updateErr) {
      logger.error({ error: updateErr, resolvedEventId }, 'Failed to refresh resolved_event');
      return false;
    }

    await supabaseAdmin
      .from('character_timeline_events')
      .update({
        event_title: classified.title,
        event_summary: classified.summary,
        event_type: classified.eventType,
        event_date: entry.date,
        emotional_impact: classified.emotionalImpact,
        confidence: classified.confidence,
      })
      .eq('user_id', userId)
      .eq('event_id', resolvedEventId);

    return true;
  }
}

export const timelineFoundationService = new TimelineFoundationService();
