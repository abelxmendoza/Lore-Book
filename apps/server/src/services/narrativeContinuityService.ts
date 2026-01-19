// =====================================================
// NARRATIVE CONTINUITY SERVICE
// Purpose: Create human-understandable continuity across events
// using safe, observational connective language
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
  metadata?: {
    theme?: string;
    intensity?: number;
    resolved?: boolean;
    unresolved?: boolean;
  };
}

interface ContinuityLink {
  id: string;
  current_event_id: string;
  past_event_id: string;
  continuity_type: ContinuityType;
  created_at: string;
}

export class NarrativeContinuityService {
  /**
   * Detect continuity between current and past events
   */
  async detectContinuity(
    userId: string,
    currentEvents: Event[],
    pastEvents: Event[]
  ): Promise<ContinuityLink[]> {
    const links: ContinuityLink[] = [];

    for (const event of currentEvents) {
      const similarPast = this.findSimilarEvents(event, pastEvents);

      if (similarPast) {
        const continuityType = this.classifyRelationship(event, similarPast);

        if (continuityType) {
          // Save link to database
          try {
            const { data: link, error } = await supabaseAdmin
              .from('event_continuity_links')
              .insert({
                user_id: userId,
                current_event_id: event.id,
                past_event_id: similarPast.id,
                continuity_type: continuityType,
                metadata: {
                  detected_at: new Date().toISOString(),
                },
              })
              .select('*')
              .single();

            if (error && !error.message.includes('duplicate')) {
              logger.warn({ error, userId, eventId: event.id }, 'Failed to save continuity link');
            } else if (link) {
              links.push({
                id: link.id,
                current_event_id: link.current_event_id,
                past_event_id: link.past_event_id,
                continuity_type: link.continuity_type,
                created_at: link.created_at,
              });
            }
          } catch (error) {
            logger.warn({ error, userId, eventId: event.id }, 'Failed to save continuity link');
          }
        }
      }
    }

    return links;
  }

  /**
   * Find similar past events
   */
  private findSimilarEvents(currentEvent: Event, pastEvents: Event[]): Event | null {
    // Simple similarity: same theme, overlapping entities, or similar activities
    for (const pastEvent of pastEvents) {
      // Check theme match
      if (
        currentEvent.metadata?.theme &&
        pastEvent.metadata?.theme &&
        currentEvent.metadata.theme === pastEvent.metadata.theme
      ) {
        return pastEvent;
      }

      // Check entity overlap (people or locations)
      const peopleOverlap =
        currentEvent.people.length > 0 &&
        pastEvent.people.length > 0 &&
        currentEvent.people.some(p => pastEvent.people.includes(p));

      const locationOverlap =
        currentEvent.locations.length > 0 &&
        pastEvent.locations.length > 0 &&
        currentEvent.locations.some(l => pastEvent.locations.includes(l));

      if (peopleOverlap || locationOverlap) {
        return pastEvent;
      }

      // Check activity overlap
      if (
        currentEvent.activities &&
        pastEvent.activities &&
        currentEvent.activities.length > 0 &&
        pastEvent.activities.length > 0
      ) {
        const activityOverlap = currentEvent.activities.some(a =>
          pastEvent.activities!.includes(a)
        );
        if (activityOverlap) {
          return pastEvent;
        }
      }
    }

    return null;
  }

  /**
   * Classify relationship between events (SAFE, observational only)
   */
  private classifyRelationship(currentEvent: Event, pastEvent: Event): ContinuityType | null {
    const currentTheme = currentEvent.metadata?.theme;
    const pastTheme = pastEvent.metadata?.theme;

    // CONTINUATION: Same theme, confidence maintained or increased
    if (currentTheme && pastTheme && currentTheme === pastTheme) {
      if (currentEvent.confidence >= pastEvent.confidence) {
        return 'CONTINUATION';
      } else {
        // RETURN: Same theme but lower confidence (theme reappears after absence)
        return 'RETURN';
      }
    }

    // CONTRAST: Different theme but overlapping entities
    if (currentTheme && pastTheme && currentTheme !== pastTheme) {
      const peopleOverlap =
        currentEvent.people.length > 0 &&
        pastEvent.people.length > 0 &&
        currentEvent.people.some(p => pastEvent.people.includes(p));
      const locationOverlap =
        currentEvent.locations.length > 0 &&
        pastEvent.locations.length > 0 &&
        currentEvent.locations.some(l => pastEvent.locations.includes(l));

      if (peopleOverlap || locationOverlap) {
        return 'CONTRAST';
      }
    }

    // CLOSURE: Past event was unresolved, current is resolved
    if (pastEvent.metadata?.unresolved && currentEvent.metadata?.resolved) {
      return 'CLOSURE';
    }

    // ESCALATION/DE_ESCALATION: Intensity changes
    const currentIntensity = currentEvent.metadata?.intensity || 0.5;
    const pastIntensity = pastEvent.metadata?.intensity || 0.5;

    if (currentIntensity > pastIntensity + 0.2) {
      return 'ESCALATION';
    }

    if (currentIntensity < pastIntensity - 0.2) {
      return 'DE_ESCALATION';
    }

    return null;
  }

  /**
   * Generate continuity language (observational only)
   */
  generateContinuityLanguage(link: ContinuityLink): string {
    switch (link.continuity_type) {
      case 'CONTINUATION':
        return 'This appears to continue a theme seen earlier.';

      case 'RETURN':
        return 'This resembles an earlier moment after a period of absence.';

      case 'CONTRAST':
        return 'This differs noticeably from a previous period.';

      case 'CLOSURE':
        return 'This seems to bring resolution to something previously open.';

      case 'ESCALATION':
        return 'This appears more intense than similar moments before.';

      case 'DE_ESCALATION':
        return 'This appears calmer than similar moments before.';

      default:
        return '';
    }
  }

  /**
   * Get continuity links for an event
   */
  async getContinuityLinksForEvent(eventId: string, userId: string): Promise<ContinuityLink[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('event_continuity_links')
        .select('*')
        .eq('current_event_id', eventId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return (data || []) as ContinuityLink[];
    } catch (error) {
      logger.error({ error, eventId, userId }, 'Failed to get continuity links');
      return [];
    }
  }

  /**
   * Get continuity links for multiple events
   */
  async getContinuityLinksForEvents(
    eventIds: string[],
    userId: string
  ): Promise<Map<string, ContinuityLink[]>> {
    const linksMap = new Map<string, ContinuityLink[]>();

    try {
      const { data, error } = await supabaseAdmin
        .from('event_continuity_links')
        .select('*')
        .in('current_event_id', eventIds)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      // Group by current_event_id
      (data || []).forEach((link: ContinuityLink) => {
        const existing = linksMap.get(link.current_event_id) || [];
        existing.push(link);
        linksMap.set(link.current_event_id, existing);
      });

      return linksMap;
    } catch (error) {
      logger.error({ error, eventIds, userId }, 'Failed to get continuity links for events');
      return linksMap;
    }
  }
}

export const narrativeContinuityService = new NarrativeContinuityService();

