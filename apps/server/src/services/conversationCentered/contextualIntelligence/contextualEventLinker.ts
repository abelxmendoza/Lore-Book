// =====================================================
// CONTEXTUAL EVENT LINKER (Phase-Safe)
// Purpose: Create continuity links between events when context overlaps
// Rules: NO MERGING, NO OVERWRITING, confidence-scored only
// =====================================================

import { logger } from '../../../logger';
import { supabaseAdmin } from '../../../supabaseClient';
import type { EventContinuityLink, ContextLinkType, ConfidenceScore } from './types';

/**
 * Link contextual events based on overlap
 * Creates links only - never merges or overwrites
 */
export async function linkContextualEvents(
  userId: string,
  newEventId: string
): Promise<EventContinuityLink[]> {
  try {
    // 1. Fetch recent events (last 90 days)
    const { data: pastEvents, error: fetchError } = await supabaseAdmin
      .from('resolved_events')
      .select('*')
      .eq('user_id', userId)
      .neq('id', newEventId) // Exclude self
      .gte('created_at', new Date(Date.now() - 90 * 864e5).toISOString())
      .order('created_at', { ascending: false })
      .limit(50); // Reasonable limit

    if (fetchError || !pastEvents || pastEvents.length === 0) {
      logger.debug({ error: fetchError, userId, newEventId }, 'No past events found for linking');
      return [];
    }

    // 2. Get new event details
    const { data: newEvent, error: newEventError } = await supabaseAdmin
      .from('resolved_events')
      .select('*')
      .eq('id', newEventId)
      .eq('user_id', userId)
      .single();

    if (newEventError || !newEvent) {
      logger.warn({ error: newEventError, newEventId }, 'New event not found for linking');
      return [];
    }

    // 3. Score overlap for each past event
    const links: EventContinuityLink[] = [];

    for (const pastEvent of pastEvents) {
      const overlapScore = scoreEventOverlap(newEvent, pastEvent);

      // Only create link if confidence >= 0.6
      if (overlapScore >= 0.6) {
        const linkType = determineLinkType(newEvent, pastEvent, overlapScore);
        const explanation = generateExplanation(newEvent, pastEvent, linkType);

        const link: EventContinuityLink = {
          from_event_id: pastEvent.id,
          to_event_id: newEventId,
          link_type: linkType,
          confidence: overlapScore,
          explanation,
          created_at: new Date().toISOString(),
          metadata: {
            overlap_score: overlapScore,
            shared_people_count: countOverlap(newEvent.people || [], pastEvent.people || []),
            shared_locations_count: countOverlap(newEvent.locations || [], pastEvent.locations || []),
          },
        };

        // Save link to database (ignore duplicates)
        try {
          await supabaseAdmin
            .from('event_continuity_links')
            .insert({
              user_id: userId,
              current_event_id: newEventId,
              past_event_id: pastEvent.id,
              continuity_type: mapLinkTypeToContinuityType(linkType),
              metadata: {
                link_type: linkType,
                confidence: overlapScore,
                explanation,
                ...link.metadata,
              },
            })
            .onConflict('current_event_id,past_event_id,continuity_type')
            .ignore();

          links.push(link);
        } catch (error) {
          // Ignore duplicate errors
          if (error && typeof error === 'object' && 'message' in error) {
            const errorMessage = (error as any).message;
            if (!errorMessage.includes('duplicate') && !errorMessage.includes('unique')) {
              logger.debug({ error, link }, 'Failed to save continuity link');
            }
          }
        }
      }
    }

    logger.debug(
      { userId, newEventId, linksCreated: links.length },
      'Created contextual event links'
    );

    return links;
  } catch (error) {
    logger.error({ error, userId, newEventId }, 'Failed to link contextual events');
    return [];
  }
}

/**
 * Score overlap between two events
 * Returns confidence score 0.0 - 1.0
 */
function scoreEventOverlap(
  event1: any,
  event2: any
): ConfidenceScore {
  let score = 0.0;

  // People overlap (40% weight)
  const people1 = event1.people || [];
  const people2 = event2.people || [];
  const peopleOverlap = countOverlap(people1, people2);
  if (people1.length > 0 && people2.length > 0) {
    const peopleScore = peopleOverlap / Math.max(people1.length, people2.length);
    score += peopleScore * 0.4;
  }

  // Location overlap (30% weight)
  const locations1 = event1.locations || [];
  const locations2 = event2.locations || [];
  const locationOverlap = countOverlap(locations1, locations2);
  if (locations1.length > 0 && locations2.length > 0) {
    const locationScore = locationOverlap / Math.max(locations1.length, locations2.length);
    score += locationScore * 0.3;
  }

  // Temporal proximity (20% weight)
  const time1 = new Date(event1.start_time || event1.created_at).getTime();
  const time2 = new Date(event2.start_time || event2.created_at).getTime();
  const daysDiff = Math.abs(time1 - time2) / (1000 * 60 * 60 * 24);
  const temporalScore = Math.max(0, 1 - daysDiff / 30); // Decay over 30 days
  score += temporalScore * 0.2;

  // Topic similarity (10% weight) - simple keyword matching
  const topicScore = scoreTopicSimilarity(event1, event2);
  score += topicScore * 0.1;

  return Math.min(1.0, Math.max(0.0, score));
}

/**
 * Count overlapping items between two arrays
 */
function countOverlap<T>(arr1: T[], arr2: T[]): number {
  const set2 = new Set(arr2);
  return arr1.filter(item => set2.has(item)).length;
}

/**
 * Score topic similarity using keyword matching
 */
function scoreTopicSimilarity(event1: any, event2: any): number {
  const text1 = `${event1.title || ''} ${event1.summary || ''}`.toLowerCase();
  const text2 = `${event2.title || ''} ${event2.summary || ''}`.toLowerCase();

  // Health/medical keywords
  const healthKeywords = [
    'virus', 'illness', 'sick', 'hospital', 'medical', 'health', 'disease',
    'infection', 'brain', 'damage', 'rot', 'acute', 'center', 'care', 'treatment'
  ];

  const keywords1 = healthKeywords.filter(kw => text1.includes(kw));
  const keywords2 = healthKeywords.filter(kw => text2.includes(kw));

  if (keywords1.length === 0 || keywords2.length === 0) {
    return 0;
  }

  const overlap = keywords1.filter(kw => keywords2.includes(kw)).length;
  return overlap / Math.max(keywords1.length, keywords2.length);
}

/**
 * Determine link type based on overlap
 */
function determineLinkType(
  newEvent: any,
  pastEvent: any,
  overlapScore: number
): ContextLinkType {
  const peopleOverlap = countOverlap(newEvent.people || [], pastEvent.people || []) > 0;
  const locationOverlap = countOverlap(newEvent.locations || [], pastEvent.locations || []) > 0;

  if (peopleOverlap && locationOverlap) {
    return 'contextual_continuation';
  } else if (locationOverlap) {
    return 'shared_location';
  } else if (peopleOverlap) {
    return 'shared_participants';
  } else {
    return 'temporal_overlap';
  }
}

/**
 * Generate human-readable explanation
 */
function generateExplanation(
  newEvent: any,
  pastEvent: any,
  linkType: ContextLinkType
): string {
  const sharedPeople = countOverlap(newEvent.people || [], pastEvent.people || []);
  const sharedLocations = countOverlap(newEvent.locations || [], pastEvent.locations || []);

  switch (linkType) {
    case 'contextual_continuation':
      return `Shared ${sharedPeople} participant(s) and ${sharedLocations} location(s). Likely continuation of related story.`;
    case 'shared_location':
      return `Same location context. May be related to previous events at this location.`;
    case 'shared_participants':
      return `Shared ${sharedPeople} participant(s). May be part of ongoing narrative.`;
    case 'temporal_overlap':
      return `Temporally proximate events. May be related.`;
    default:
      return 'Contextual overlap detected.';
  }
}

/**
 * Map our link type to database continuity type
 */
function mapLinkTypeToContinuityType(linkType: ContextLinkType): string {
  // Map to existing continuity types in database
  switch (linkType) {
    case 'contextual_continuation':
      return 'CONTINUATION';
    case 'shared_location':
    case 'shared_participants':
    case 'temporal_overlap':
      return 'CONTINUATION'; // All map to CONTINUATION for now
    default:
      return 'CONTINUATION';
  }
}
