/**
 * Entity-Scoped Retriever — Phase 2 of the Context Selection Layer
 *
 * When a user message is detected as a query *about* a specific entity
 * (person, location), bypass the generic semantic vector search and instead
 * load the entity's complete autobiographical arc from the DB.
 *
 * This solves the "random diary excerpt" problem:
 *   Before: "Tell me about Sarah" → 5 semantically-similar snippets that may
 *           all be from the same month, missing key events.
 *   After:  "Tell me about Sarah" → chronological arc of all resolved_events
 *           involving Sarah, her attributes, relationship history.
 *
 * Design constraints:
 *   - Three parallel DB queries (events, relationships, attributes) — no serial waits
 *   - Falls back to generic retrieval if entity detection or DB queries fail
 *   - Does NOT replace the system prompt character block — enhances the memory block
 *   - Produces a structured EntityContinuitySummary injected into relatedEntries
 *
 * Trigger detection heuristics (conservative):
 *   - Message matches ENTITY_QUERY_PATTERNS
 *   - AND at least one character/location name appears in the message
 *   - Minimum entity name length: 3 chars (avoid triggering on "I", "me", "he")
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

// ─── Query pattern detection ──────────────────────────────────────────────────

const ENTITY_QUERY_PATTERNS: RegExp[] = [
  /tell me (about|more about)/i,
  /what do you know about/i,
  /what('?s| is) (the story|going on) (with|between)/i,
  /what happened (with|to|between)/i,
  /how is .{2,30} doing/i,
  /remind me (about|who|of)/i,
  /who is /i,
  /everything (you know )?about/i,
  /walk me through .{2,40} and me/i,
  /what do (i|we) know about/i,
  /catch me up on/i,
  /fill me in on/i,
  /summary of .{2,30}/i,
  /update on .{2,30}/i,
];

export function isEntityQuery(message: string): boolean {
  return ENTITY_QUERY_PATTERNS.some(p => p.test(message));
}

/** Common English tokens that must never match as entity aliases via substring. */
const ALIAS_DENYLIST = new Set([
  'had', 'has', 'have', 'was', 'were', 'the', 'and', 'but', 'for', 'not', 'you',
  'she', 'her', 'him', 'his', 'they', 'them', 'last', 'night', 'day', 'week',
  'month', 'year', 'time', 'just', 'like', 'with', 'from', 'this', 'that',
  'what', 'when', 'where', 'who', 'how', 'why', 'about', 'into', 'over',
]);

function mentionsToken(messageLower: string, raw: string): boolean {
  const needle = raw.trim().toLowerCase();
  if (needle.length < 3 || ALIAS_DENYLIST.has(needle)) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, 'iu').test(messageLower);
}

/**
 * Detect entity mentions in the message.
 * Returns entities sorted by match quality (exact name > alias).
 * Only considers entities with name length ≥ 3 to avoid false positives.
 */
export function detectMentionedEntities(
  message: string,
  characters: Array<{ id: string; name: string; alias?: string[] }>,
  locations: Array<{ id: string; name: string }>
): Array<{ id: string; type: 'character' | 'location'; name: string; matchScore: number }> {
  const lower = message.toLowerCase();
  const results: Array<{ id: string; type: 'character' | 'location'; name: string; matchScore: number }> = [];

  for (const char of characters) {
    if (!char.name || char.name.length < 3) continue;
    if (mentionsToken(lower, char.name)) {
      results.push({ id: char.id, type: 'character', name: char.name, matchScore: 1.0 });
      continue;
    }
    const aliasMatch = (char.alias ?? []).find(a => a && mentionsToken(lower, a));
    if (aliasMatch) {
      results.push({ id: char.id, type: 'character', name: char.name, matchScore: 0.8 });
    }
  }

  for (const loc of locations) {
    if (!loc.name || loc.name.length < 3) continue;
    if (mentionsToken(lower, loc.name)) {
      results.push({ id: loc.id, type: 'location', name: loc.name, matchScore: 1.0 });
    }
  }

  // Sort best matches first; dedup by id
  const seen = new Set<string>();
  return results
    .sort((a, b) => b.matchScore - a.matchScore)
    .filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
}

// ─── DB queries ───────────────────────────────────────────────────────────────

interface ResolvedEvent {
  id: string;
  title: string | null;
  summary: string | null;
  start_time: string | null;
  end_time: string | null;
  confidence: number;
  people: string[];
  locations: string[];
}

interface EntityAttribute {
  attribute_type: string;
  attribute_value: string;
  confidence: number;
  is_current: boolean;
  start_time: string | null;
}

interface CharacterRelationship {
  relationship_type: string | null;
  strength: number | null;
  sentiment: string | null;
  notes: string | null;
  updated_at: string | null;
}

export interface EntityContinuitySummary {
  entityId: string;
  entityName: string;
  entityType: 'character' | 'location';
  events: ResolvedEvent[];
  attributes: EntityAttribute[];
  relationships: CharacterRelationship[];
  /** Narrative block formatted for injection into the system prompt */
  narrativeBlock: string;
}

async function loadCharacterArc(userId: string, entityId: string): Promise<EntityContinuitySummary | null> {
  try {
    // All three queries fire in parallel — no serial waits
    const [eventsResult, attrsResult, relResult] = await Promise.all([
      supabaseAdmin
        .from('resolved_events')
        .select('id, title, summary, start_time, end_time, confidence, people, locations')
        .eq('user_id', userId)
        .contains('people', [entityId])
        .order('start_time', { ascending: true })
        .limit(50),

      supabaseAdmin
        .from('entity_attributes')
        .select('attribute_type, attribute_value, confidence, is_current, start_time')
        .eq('user_id', userId)
        .eq('entity_id', entityId)
        .order('confidence', { ascending: false }),

      supabaseAdmin
        .from('character_relationships')
        .select('relationship_type, strength, sentiment, notes, updated_at')
        .eq('user_id', userId)
        .or(`source_character_id.eq.${entityId},target_character_id.eq.${entityId}`)
        .order('strength', { ascending: false })
        .limit(10),
    ]);

    return {
      entityId,
      entityName: '', // filled by caller
      entityType: 'character',
      events: (eventsResult.data ?? []) as ResolvedEvent[],
      attributes: (attrsResult.data ?? []) as EntityAttribute[],
      relationships: (relResult.data ?? []) as CharacterRelationship[],
      narrativeBlock: '', // filled below
    };
  } catch (err) {
    logger.warn({ err, userId, entityId }, '[EntityScopedRetriever] Character arc load failed');
    return null;
  }
}

async function loadLocationArc(userId: string, entityId: string): Promise<EntityContinuitySummary | null> {
  try {
    const eventsResult = await supabaseAdmin
      .from('resolved_events')
      .select('id, title, summary, start_time, end_time, confidence, people, locations')
      .eq('user_id', userId)
      .contains('locations', [entityId])
      .order('start_time', { ascending: true })
      .limit(30);

    return {
      entityId,
      entityName: '',
      entityType: 'location',
      events: (eventsResult.data ?? []) as ResolvedEvent[],
      attributes: [],
      relationships: [],
      narrativeBlock: '',
    };
  } catch (err) {
    logger.warn({ err, userId, entityId }, '[EntityScopedRetriever] Location arc load failed');
    return null;
  }
}

// ─── Narrative block formatter ────────────────────────────────────────────────

function formatNarrativeBlock(summary: EntityContinuitySummary): string {
  const { entityName, entityType, events, attributes, relationships } = summary;
  const today = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const lines: string[] = [];

  lines.push(`**Known arc — ${entityName}** (complete through ${today}):`);

  // Date span
  if (events.length > 0) {
    const first = events[0].start_time ? new Date(events[0].start_time).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null;
    const last = events[events.length - 1].start_time ? new Date(events[events.length - 1].start_time!).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null;
    lines.push(`Events on record: ${events.length}${first ? ` (${first}${last && last !== first ? ` – ${last}` : ''})` : ''}`);
  } else {
    lines.push('Events on record: none yet');
  }

  // Confidence-weighted attributes (current ones first)
  if (attributes.length > 0) {
    const currentAttrs = attributes.filter(a => a.is_current).slice(0, 6);
    if (currentAttrs.length > 0) {
      lines.push('Current attributes:');
      for (const attr of currentAttrs) {
        const tentative = attr.confidence < 0.7 ? ' ⚠ tentative' : '';
        lines.push(`  - ${attr.attribute_type.replace(/_/g, ' ')}: ${attr.attribute_value}${tentative}`);
      }
    }
  }

  // Chronological events
  if (events.length > 0) {
    lines.push('Timeline:');
    for (const ev of events.slice(0, 20)) {
      const date = ev.start_time
        ? new Date(ev.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '(no date)';
      const conf = ev.confidence < 0.6 ? ' [tentative]' : '';
      const text = ev.summary?.substring(0, 120) ?? ev.title ?? 'Event';
      lines.push(`  ${date}${conf}: ${text}`);
    }
    if (events.length > 20) {
      lines.push(`  … and ${events.length - 20} earlier events`);
    }
  }

  // Relationship context (characters only)
  if (entityType === 'character' && relationships.length > 0) {
    const rel = relationships[0];
    const relType = rel.relationship_type ?? 'connection';
    const sentiment = rel.sentiment ? ` (${rel.sentiment})` : '';
    lines.push(`Relationship type: ${relType}${sentiment}`);
  }

  return lines.join('\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load a complete entity arc for a single entity.
 * Returns null if the entity has fewer than 2 events (fall back to generic retrieval).
 */
export async function loadEntityArc(
  userId: string,
  entity: { id: string; type: 'character' | 'location'; name: string }
): Promise<EntityContinuitySummary | null> {
  const arc =
    entity.type === 'character'
      ? await loadCharacterArc(userId, entity.id)
      : await loadLocationArc(userId, entity.id);

  if (!arc || arc.events.length < 2) {
    // Too sparse — generic retrieval will do better
    return null;
  }

  arc.entityName = entity.name;
  arc.narrativeBlock = formatNarrativeBlock(arc);
  return arc;
}

/**
 * Convert an EntityContinuitySummary to the ResolvedMemoryEntry shape
 * expected by the rest of the pipeline (sources array, fabric neighbors, etc.).
 * This lets the entity arc slot cleanly into the existing relatedEntries flow.
 */
export function arcToMemoryEntries(
  arc: EntityContinuitySummary
): Array<{ id: string; content: string; date: string; confidence: number }> {
  return arc.events.slice(0, 20).map(ev => ({
    id: ev.id,
    content: ev.summary ?? ev.title ?? '',
    date: ev.start_time ?? new Date().toISOString(),
    confidence: ev.confidence,
  }));
}
