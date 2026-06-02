// =====================================================
// NARRATIVE CONTINUITY SERVICE
// Purpose: Detect and describe connections between events using
// data that actually exists — shared people, locations, activities,
// and temporal patterns. Never depends on metadata fields that are
// not populated by the ingestion pipeline.
// =====================================================

import { logger } from '../logger';

import { supabaseAdmin } from './supabaseClient';

export type ContinuityType =
  | 'CONTINUATION'
  | 'CONTRAST'
  | 'RETURN'
  | 'CLOSURE'
  | 'ESCALATION'
  | 'DE_ESCALATION';

interface Event {
  id: string;
  title: string;
  summary?: string | null;
  confidence: number;
  people: string[];
  locations: string[];
  activities?: string[];
  start_time: string;
  end_time?: string | null;
  metadata?: Record<string, unknown>;
}

interface SimilarityContext {
  event: Event;
  sharedPeople: string[];
  sharedLocations: string[];
  sharedActivities: string[];
  daysBetween: number;
}

interface ContinuityLink {
  id: string;
  current_event_id: string;
  past_event_id: string;
  continuity_type: ContinuityType;
  created_at: string;
  metadata?: {
    shared_people?: string[];
    shared_locations?: string[];
    shared_activities?: string[];
    past_event_title?: string;
    days_between?: number;
    occurrence_count?: number;
    detected_at?: string;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function formatDaysAgo(days: number): string {
  if (days <= 0) return 'recently';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'about a week ago';
  if (days < 30) return `${Math.round(days / 7)} weeks ago`;
  if (days < 60) return 'about a month ago';
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return 'over a year ago';
}

function daysBetweenDates(a: string, b: string): number {
  return Math.round(Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class NarrativeContinuityService {

  /**
   * Detect continuity between newly assembled events and their past equivalents.
   * Uses only real, populated data: shared people, locations, activities.
   */
  async detectContinuity(
    userId: string,
    currentEvents: Event[],
    pastEvents: Event[]
  ): Promise<ContinuityLink[]> {
    const links: ContinuityLink[] = [];

    for (const event of currentEvents) {
      const context = this.findSimilarEventsWithContext(event, pastEvents);
      if (!context) continue;

      const continuityType = this.classifyRelationship(context);
      if (!continuityType) continue;

      // Count how many times the shared entities have appeared historically
      const occurrenceCount = this.countOccurrences(event, pastEvents, context);

      const linkMetadata = {
        detected_at: new Date().toISOString(),
        shared_people: context.sharedPeople,
        shared_locations: context.sharedLocations,
        shared_activities: context.sharedActivities,
        past_event_title: context.event.title,
        days_between: context.daysBetween,
        occurrence_count: occurrenceCount,
      };

      try {
        const { data: link, error } = await supabaseAdmin
          .from('event_continuity_links')
          .insert({
            user_id: userId,
            current_event_id: event.id,
            past_event_id: context.event.id,
            continuity_type: continuityType,
            metadata: linkMetadata,
          })
          .select('*')
          .single();

        if (error && !error.message?.includes('duplicate')) {
          logger.warn({ error, userId, eventId: event.id }, 'Failed to save continuity link');
        } else if (link) {
          links.push({
            id: link.id,
            current_event_id: link.current_event_id,
            past_event_id: link.past_event_id,
            continuity_type: link.continuity_type,
            created_at: link.created_at,
            metadata: linkMetadata,
          });

          logger.debug(
            { userId, eventId: event.id, pastEventId: context.event.id, type: continuityType },
            'Saved continuity link'
          );
        }
      } catch (error) {
        logger.warn({ error, userId, eventId: event.id }, 'Failed to save continuity link');
      }
    }

    return links;
  }

  /**
   * Find the most similar past event and return the shared context.
   * Priority: people > locations > activities.
   */
  private findSimilarEventsWithContext(
    current: Event,
    pastEvents: Event[]
  ): SimilarityContext | null {
    // Score each past event and return the best match with context
    let best: { score: number; context: SimilarityContext } | null = null;

    for (const past of pastEvents) {
      const sharedPeople = current.people.filter(p => past.people.includes(p));
      const sharedLocations = current.locations.filter(l => past.locations.includes(l));
      const sharedActivities = (current.activities || []).filter(a =>
        (past.activities || []).includes(a)
      );
      const days = daysBetweenDates(current.start_time, past.start_time);

      const score = sharedPeople.length * 3 + sharedLocations.length * 2 + sharedActivities.length;
      if (score === 0) continue;

      // Prefer more recent connections
      const recencyBonus = Math.max(0, 1 - days / 365);
      const adjustedScore = score + recencyBonus;

      if (!best || adjustedScore > best.score) {
        best = {
          score: adjustedScore,
          context: { event: past, sharedPeople, sharedLocations, sharedActivities, daysBetween: days },
        };
      }
    }

    return best?.context ?? null;
  }

  /**
   * Classify the relationship type.
   * Uses only shared-entity signals — no metadata dependency.
   */
  private classifyRelationship(context: SimilarityContext): ContinuityType | null {
    const { sharedPeople, sharedLocations, sharedActivities, daysBetween } = context;

    // People-based continuity is the strongest signal
    if (sharedPeople.length > 0) {
      // If significant time has passed, this is a RETURN (recurring relationship)
      if (daysBetween > 45) return 'RETURN';
      return 'CONTINUATION';
    }

    // Location-based continuity
    if (sharedLocations.length > 0) {
      if (daysBetween > 60) return 'RETURN';
      return 'CONTINUATION';
    }

    // Activity-based continuity
    if (sharedActivities.length > 0) {
      return 'CONTINUATION';
    }

    return null;
  }

  /**
   * Count how many past events share the primary shared entity.
   * Used to produce "3rd time this quarter" language.
   */
  private countOccurrences(
    current: Event,
    pastEvents: Event[],
    context: SimilarityContext
  ): number {
    if (context.sharedPeople.length > 0) {
      const primaryPerson = context.sharedPeople[0];
      return pastEvents.filter(e => e.people.includes(primaryPerson)).length + 1;
    }
    if (context.sharedLocations.length > 0) {
      const primaryLocation = context.sharedLocations[0];
      return pastEvents.filter(e => e.locations.includes(primaryLocation)).length + 1;
    }
    if (context.sharedActivities.length > 0) {
      const primaryActivity = context.sharedActivities[0];
      return pastEvents.filter(e => (e.activities || []).includes(primaryActivity)).length + 1;
    }
    return 2;
  }

  /**
   * Generate specific, autobiographical continuity language.
   * Reads from the stored metadata to produce entity-named descriptions.
   * No LLM. No filler. Named people and places only.
   */
  generateContinuityLanguage(link: ContinuityLink): string {
    const meta = link.metadata;
    const sharedPeople = meta?.shared_people ?? [];
    const sharedLocations = meta?.shared_locations ?? [];
    const sharedActivities = meta?.shared_activities ?? [];
    const pastTitle = meta?.past_event_title;
    const days = meta?.days_between;
    const count = meta?.occurrence_count;

    // People-first: the most meaningful continuity signal
    if (sharedPeople.length > 0) {
      const names = formatList(sharedPeople.slice(0, 2));
      const timePhrase = days != null ? `, ${formatDaysAgo(days)}` : '';

      if (pastTitle) {
        if (count && count >= 3) {
          const period = days && days < 90 ? 'this quarter' : 'over the past months';
          return `${names} also appeared in "${pastTitle}"${timePhrase} — the ${ordinal(count)} time${count > 1 ? ` ${names} appear${names.includes(' and ') ? '' : 's'}` : ''} in your documented events ${period}.`;
        }
        return `${names} also appeared in "${pastTitle}"${timePhrase}.`;
      }
      return `${names} appears in an earlier event${timePhrase}.`;
    }

    // Location-based
    if (sharedLocations.length > 0) {
      const location = sharedLocations[0];
      const timePhrase = days != null ? `, ${formatDaysAgo(days)}` : '';

      if (pastTitle) {
        if (count && count >= 3) {
          return `${location} also featured in "${pastTitle}"${timePhrase} — a recurring location in your story.`;
        }
        return `${location} also appeared in "${pastTitle}"${timePhrase}.`;
      }
      return `${location} appears in an earlier event${timePhrase}.`;
    }

    // Activity-based
    if (sharedActivities.length > 0) {
      const activity = sharedActivities[0];
      if (pastTitle) {
        return `"${activity}" was also part of "${pastTitle}"${days != null ? `, ${formatDaysAgo(days)}` : ''}.`;
      }
      return `"${activity}" appears in an earlier event.`;
    }

    // Fallback with past event title if available
    if (pastTitle) {
      return `This shares elements with "${pastTitle}"${days != null ? `, ${formatDaysAgo(days)}` : ''}.`;
    }

    return '';
  }

  /**
   * Get continuity links for a single event (with metadata for language generation).
   */
  async getContinuityLinksForEvent(eventId: string, userId: string): Promise<ContinuityLink[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('event_continuity_links')
        .select('id, current_event_id, past_event_id, continuity_type, created_at, metadata')
        .eq('current_event_id', eventId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []) as ContinuityLink[];
    } catch (error) {
      logger.error({ error, eventId, userId }, 'Failed to get continuity links');
      return [];
    }
  }

  /**
   * Get continuity links for multiple events (bulk).
   */
  async getContinuityLinksForEvents(
    eventIds: string[],
    userId: string
  ): Promise<Map<string, ContinuityLink[]>> {
    const linksMap = new Map<string, ContinuityLink[]>();
    if (eventIds.length === 0) return linksMap;

    try {
      const { data, error } = await supabaseAdmin
        .from('event_continuity_links')
        .select('id, current_event_id, past_event_id, continuity_type, created_at, metadata')
        .in('current_event_id', eventIds)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      (data || []).forEach((link: ContinuityLink) => {
        const existing = linksMap.get(link.current_event_id) || [];
        existing.push(link);
        linksMap.set(link.current_event_id, existing);
      });
    } catch (error) {
      logger.error({ error, eventIds, userId }, 'Failed to get continuity links for events');
    }

    return linksMap;
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export const narrativeContinuityService = new NarrativeContinuityService();
