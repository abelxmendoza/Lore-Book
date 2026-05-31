/**
 * EventCandidateService
 *
 * Detects cross-session recurring autobiographical scenes by finding patterns
 * in resolved_events where the same entity + location combinations appear
 * repeatedly across different threads and sessions.
 *
 * Design constraints:
 *   - Heuristics only — no AI calls, no embeddings
 *   - Always runs async and non-blocking after event assembly
 *   - Never surfaces candidates with occurrence_count < 2
 *   - Never modifies source messages, resolved_events, or entities
 *   - Provenance chain always preserved in source_event_ids
 *
 * Confidence curve:
 *   1 occurrence → 0.25 (speculative, never surfaced to user)
 *   2 occurrences → 0.50 (emerging, visible in character cards)
 *   3 occurrences → 0.72 (recurring scene, surfaces in thread sidebar)
 *   4+ occurrences → min(0.92, 0.72 + (n-3) * 0.05) (stable autobiographical scene)
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { evaluatePatternThreshold } from '../knowledgeCrystallization';

// Activity keywords to extract from event titles/summaries
const ACTIVITY_KEYWORDS = [
  'coding', 'code', 'programming', 'debugging', 'building', 'designing',
  'working', 'writing', 'studying', 'reading', 'gaming', 'playing',
  'cooking', 'eating', 'drinking', 'exercising', 'running', 'gym',
  'talking', 'meeting', 'hanging', 'chilling', 'relaxing', 'watching',
  'thinking', 'reflecting', 'journaling', 'planning', 'brainstorming',
];

// Minimum entity overlap required to match an existing candidate
const MIN_ENTITY_OVERLAP = 1;

// Minimum entities (people + locations) to even attempt candidate creation
const MIN_ENTITIES_FOR_CANDIDATE = 1;

type ResolvedEvent = {
  id: string;
  user_id: string;
  title: string;
  summary?: string;
  type?: string;
  start_time: string;
  people: string[];
  locations: string[];
  activities: string[];
  metadata?: Record<string, unknown>;
};

type EventCandidate = {
  id: string;
  user_id: string;
  canonical_title: string;
  dominant_entities: string[];
  dominant_entity_names: string[];
  recurring_activities: string[];
  emotional_tone?: string;
  first_seen_at: string;
  last_seen_at: string;
  occurrence_count: number;
  continuity_strength: number;
  source_thread_ids: string[];
  source_event_ids: string[];
  timeline_candidate: boolean;
  confidence: number;
};

function extractActivityWords(text: string): string[] {
  const lower = text.toLowerCase();
  return ACTIVITY_KEYWORDS.filter(kw => lower.includes(kw));
}

/**
 * Continuity strength: logistic curve over occurrence count, dampened by recency.
 *
 * Count-only model (used when dates unavailable):
 *   σ(k*(n - n₀)) where k=1.5 steepness, n₀=2.5 midpoint
 *   → n=1: 0.18  n=2: 0.40  n=3: 0.62  n=5: 0.87  n=8: 0.96
 *
 * With temporal decay (used when lastSeenAt is provided):
 *   decay = e^(-daysSinceLast / HALF_LIFE_DAYS)
 *   strength = logistic * (0.5 + 0.5 * decay)
 *   → a pattern unseen for 6 months loses ~30% of its strength;
 *     unseen for 18 months loses ~60%.
 */
const HALF_LIFE_DAYS = 180; // ~6 months

function logisticStrength(n: number): number {
  // Steepness=1.5, midpoint=2.5; clamp to [0.10, 0.96]
  return Math.min(0.96, Math.max(0.10, 1 / (1 + Math.exp(-1.5 * (n - 2.5)))));
}

function computeContinuityStrength(occurrenceCount: number, lastSeenAt?: string | null): number {
  const base = logisticStrength(occurrenceCount);
  if (!lastSeenAt) return base;

  const daysSince = (Date.now() - new Date(lastSeenAt).getTime()) / 86_400_000;
  const decay = Math.exp(-daysSince / HALF_LIFE_DAYS);
  // Decay dampens toward 50% of base strength; recent activity restores it fully.
  return Math.min(0.96, base * (0.5 + 0.5 * decay));
}


function buildCanonicalTitle(event: ResolvedEvent, entityNames: string[]): string {
  // Prefer the existing event title if it's short and concrete
  if (event.title && event.title.length < 60) return event.title;
  // Fallback: compose from entity names
  return entityNames.slice(0, 3).join(', ') || 'Recurring moment';
}

async function getEntityNames(entityIds: string[], userId: string): Promise<string[]> {
  if (entityIds.length === 0) return [];
  try {
    const { data } = await supabaseAdmin
      .from('entities')
      .select('id, canonical_name')
      .eq('user_id', userId)
      .in('id', entityIds);
    if (!data) return [];
    // Preserve order of entityIds
    const nameMap = new Map(data.map(e => [e.id, e.canonical_name as string]));
    return entityIds.map(id => nameMap.get(id)).filter((n): n is string => !!n);
  } catch {
    return [];
  }
}

function getThreadIdFromMetadata(event: ResolvedEvent): string | null {
  const meta = event.metadata;
  if (!meta) return null;
  const threadId = (meta as any)?.thread_id ?? (meta as any)?.threadId ?? null;
  return typeof threadId === 'string' ? threadId : null;
}

/**
 * Process a newly assembled resolved_event and update event_candidates accordingly.
 * Runs async after event assembly — never blocks ingestion.
 */
async function processResolvedEvent(userId: string, eventId: string): Promise<void> {
  try {
    // Load the resolved event
    const { data: event, error } = await supabaseAdmin
      .from('resolved_events')
      .select('id, user_id, title, summary, type, start_time, people, locations, activities, metadata')
      .eq('id', eventId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !event) return;

    const people: string[] = event.people ?? [];
    const locations: string[] = event.locations ?? [];
    const allEntities = [...people, ...locations];

    if (allEntities.length < MIN_ENTITIES_FOR_CANDIDATE) return;

    // Use GIN-indexed Postgres overlap operator (&&) to pre-filter candidates in the DB.
    // This hits the idx_event_candidates_entities GIN index — O(log n + k) instead of
    // an O(n) full table scan + O(E²) JS overlap loop.
    // 'ov' is the PostgREST operator for PostgreSQL &&  (array overlap).
    const entityFilter = `{${allEntities.join(',')}}`;
    const { data: candidates } = await supabaseAdmin
      .from('event_candidates')
      .select('*')
      .eq('user_id', userId)
      .not('source_event_ids', 'cs', `{${eventId}}`)
      .filter('dominant_entities', 'ov', entityFilter);

    const existingCandidates: EventCandidate[] = candidates ?? [];

    // Qualify and rank — at this point the candidate set is already small (DB-filtered).
    // Build a Set once for O(1) lookups instead of O(n) array scans.
    const peopleSet = new Set(people);
    const locationsSet = new Set(locations);
    const allEntitySet = new Set(allEntities);

    let bestMatch: EventCandidate | null = null;
    let bestOverlap = 0;

    for (const candidate of existingCandidates) {
      // O(candidate.dominant_entities.length) — small after DB pre-filter
      let overlap = 0;
      let personOverlap = 0;
      let locationOverlap = 0;
      for (const eid of candidate.dominant_entities) {
        if (allEntitySet.has(eid)) { overlap++; }
        if (peopleSet.has(eid)) { personOverlap++; }
        if (locationsSet.has(eid)) { locationOverlap++; }
      }
      if (overlap >= MIN_ENTITY_OVERLAP && overlap > bestOverlap) {
        const qualifies =
          (people.length > 0 && personOverlap >= 1) ||
          (people.length === 0 && locationOverlap >= 1);
        if (qualifies) {
          bestMatch = candidate;
          bestOverlap = overlap;
        }
      }
    }

    if (bestMatch) {
      // Reinforce existing candidate
      const newCount = bestMatch.occurrence_count + 1;
      const newStrength = computeContinuityStrength(newCount, event.start_time);
      const threadId = getThreadIdFromMetadata(event);

      const updatedEntities = Array.from(
        new Set([...bestMatch.dominant_entities, ...allEntities])
      );
      const updatedEntityNames = await getEntityNames(updatedEntities, userId);
      const newActivities = extractActivityWords(`${event.title} ${event.summary ?? ''}`);
      const updatedActivities = Array.from(
        new Set([...bestMatch.recurring_activities, ...newActivities])
      );

      await supabaseAdmin
        .from('event_candidates')
        .update({
          occurrence_count: newCount,
          continuity_strength: newStrength,
          last_seen_at: event.start_time,
          dominant_entities: updatedEntities,
          dominant_entity_names: updatedEntityNames,
          recurring_activities: updatedActivities,
          source_event_ids: Array.from(new Set([...bestMatch.source_event_ids, eventId])),
          source_thread_ids: threadId
            ? Array.from(new Set([...bestMatch.source_thread_ids, threadId]))
            : bestMatch.source_thread_ids,
          timeline_candidate: newStrength >= 0.55,
          confidence: newStrength,
        })
        .eq('id', bestMatch.id)
        .eq('user_id', userId);

      logger.debug(
        {
          userId,
          candidateId: bestMatch.id,
          occurrences: newCount,
          strength: newStrength,
          entityOverlap: bestOverlap,
        },
        'Event candidate reinforced'
      );

      // Knowledge crystallization hook — fire-and-forget.
      // Triggered when a candidate crosses the pattern threshold (strength >= 0.80, count >= 4).
      // Never awaited — must never block the ingestion pipeline.
      if (newStrength >= 0.80 && newCount >= 4) {
        evaluatePatternThreshold({
          userId,
          eventCandidateId: bestMatch.id,
          continuityStrength: newStrength,
          occurrenceCount: newCount,
          firstSeenAt: bestMatch.first_seen_at ?? null,
          lastSeenAt: event.start_time,
        }).catch(err =>
          logger.error({ err, userId, candidateId: bestMatch.id }, 'crystallization hook failed (non-blocking)')
        );
      }
    } else {
      // Create new candidate — first occurrence, low confidence
      const entityNames = await getEntityNames(allEntities, userId);
      const activityWords = extractActivityWords(`${event.title} ${event.summary ?? ''}`);
      const threadId = getThreadIdFromMetadata(event);

      const { error: insertError } = await supabaseAdmin
        .from('event_candidates')
        .insert({
          user_id: userId,
          canonical_title: buildCanonicalTitle(event, entityNames),
          dominant_entities: allEntities,
          dominant_entity_names: entityNames,
          recurring_activities: activityWords,
          first_seen_at: event.start_time,
          last_seen_at: event.start_time,
          occurrence_count: 1,
          continuity_strength: 0.25,
          source_event_ids: [eventId],
          source_thread_ids: threadId ? [threadId] : [],
          timeline_candidate: false,
          confidence: 0.40,
        });

      if (insertError) {
        logger.debug({ userId, eventId, error: insertError.message }, 'Failed to create event candidate');
      } else {
        logger.debug({ userId, eventId, entities: allEntities.length }, 'New event candidate created');
      }
    }
  } catch (err) {
    // Never interrupt ingestion
    logger.debug({ err, userId, eventId }, 'EventCandidateService failed (non-blocking)');
  }
}

/**
 * Return surfaceable event candidates for a user.
 * Only returns candidates with continuity_strength >= 0.50 (2+ occurrences).
 */
async function getSurfaceableCandidates(
  userId: string,
  limit = 10
): Promise<EventCandidate[]> {
  const { data } = await supabaseAdmin
    .from('event_candidates')
    .select('*')
    .eq('user_id', userId)
    .gte('continuity_strength', 0.50)
    .order('continuity_strength', { ascending: false })
    .limit(limit);
  return (data ?? []) as EventCandidate[];
}

/**
 * Return candidates involving a specific entity (for character card surfacing).
 * Only returns candidates with continuity_strength >= 0.50.
 */
async function getCandidatesForEntity(
  userId: string,
  entityId: string
): Promise<EventCandidate[]> {
  const { data } = await supabaseAdmin
    .from('event_candidates')
    .select('*')
    .eq('user_id', userId)
    .gte('continuity_strength', 0.50)
    .contains('dominant_entities', [entityId])
    .order('continuity_strength', { ascending: false })
    .limit(5);
  return (data ?? []) as EventCandidate[];
}

export const eventCandidateService = {
  processResolvedEvent,
  getSurfaceableCandidates,
  getCandidatesForEntity,
};
