// =====================================================
// CHARACTER TIMELINE BUILDER
// Purpose: Build shared experiences and lore timelines for characters
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import { eventImpactDetector } from './eventImpactDetector';

export type TimelineType = 'shared_experience' | 'lore' | 'mentioned_in';

export interface TimelineEvent {
  id: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  recordedAt?: string | null;
  occurrenceStatus?: 'confirmed' | 'range' | 'unresolved';
  eventSummary?: string;
  eventType?: string;
  timelineType: TimelineType;
  characterRole?: string;
  userWasPresent: boolean;
  impactType?: string;
  connectionCharacter?: string;
  emotionalImpact?: string;
  confidence: number;
}

export class CharacterTimelineBuilder {
  /**
   * Build timelines for a character
   */
  async buildTimelines(
    userId: string,
    characterId: string
  ): Promise<{
    sharedExperiences: TimelineEvent[];
    lore: TimelineEvent[];
  }> {
    try {
      // Get all timeline events for this character
      const { data: timelineEvents, error } = await supabaseAdmin
        .from('character_timeline_events')
        .select('*')
        .eq('user_id', userId)
        .eq('character_id', characterId)
        .order('event_date', { ascending: true });

      if (error) {
        throw error;
      }

      const sharedExperiences: TimelineEvent[] = [];
      const lore: TimelineEvent[] = [];

      for (const event of timelineEvents || []) {
        const timelineEvent: TimelineEvent = {
          id: event.id,
          eventId: event.event_id,
          eventTitle: event.event_title || 'Untitled Event',
          eventDate: event.event_date || '',
          recordedAt: event.created_at ?? null,
          occurrenceStatus: event.event_date ? 'confirmed' : 'unresolved',
          eventSummary: event.event_summary,
          eventType: event.event_type,
          timelineType: event.timeline_type as TimelineType,
          characterRole: event.character_role,
          userWasPresent: event.user_was_present,
          impactType: event.impact_type,
          emotionalImpact: event.emotional_impact,
          confidence: event.confidence,
        };

        // Get connection character name if exists
        if (event.connection_character_id) {
          const { data: character } = await supabaseAdmin
            .from('characters')
            .select('name')
            .eq('id', event.connection_character_id)
            .eq('user_id', userId)
            .single();
          timelineEvent.connectionCharacter = character?.name;
        }

        if (event.timeline_type === 'shared_experience') {
          sharedExperiences.push(timelineEvent);
        } else {
          lore.push(timelineEvent);
        }
      }

      return {
        sharedExperiences: sharedExperiences.sort((a, b) =>
          new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
        ),
        lore: lore.sort((a, b) =>
          new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
        ),
      };
    } catch (error) {
      logger.error({ error, userId, characterId }, 'Failed to build character timelines');
      return {
        sharedExperiences: [],
        lore: [],
      };
    }
  }

  /**
   * Process event and add to character timelines
   */
  async processEventForCharacters(
    userId: string,
    eventId: string,
    event: {
      title: string;
      summary?: string;
      type?: string;
      start_time: string;
      people: string[];
    },
    impactType?: string,
    connectionCharacterId?: string
  ): Promise<void> {
    try {
      // Get event impacts if not provided
      let actualImpactType = impactType;
      let actualConnectionCharacterId = connectionCharacterId;

      if (!actualImpactType) {
        const impacts = await eventImpactDetector.getEventImpacts(userId, eventId);
        const primaryImpact = impacts[0];
        if (primaryImpact) {
          actualImpactType = primaryImpact.impactType;
          actualConnectionCharacterId = primaryImpact.connectionCharacterId;
        }
      }

      // Determine if user was present
      const userWasPresent = actualImpactType === 'direct_participant';

      // Get user's character ID to check if they're in the people array
      const { data: userCharacter } = await supabaseAdmin
        .from('characters')
        .select('id')
        .eq('user_id', userId)
        .eq('name', 'You')
        .or('name.ilike.%you%')
        .limit(1)
        .single();

      const userInEvent = userCharacter && event.people.includes(userCharacter.id);

      // Process each character in the event
      for (const characterId of event.people) {
        // Skip if this is the user's character
        if (userCharacter && characterId === userCharacter.id) {
          continue;
        }

        // Determine timeline type
        let timelineType: TimelineType = 'lore';
        let characterRole: string = 'participant';

        if (userWasPresent || userInEvent) {
          timelineType = 'shared_experience';
          characterRole = 'participant';
        } else if (actualImpactType === 'related_person_affected') {
          timelineType = 'lore';
          characterRole = 'subject';
        } else if (actualImpactType === 'observer') {
          timelineType = 'lore';
          characterRole = 'mentioned';
        } else {
          timelineType = 'lore';
          characterRole = 'affected';
        }

        // Get emotional impact from event impacts
        const impacts = await eventImpactDetector.getEventImpacts(userId, eventId);
        const primaryImpact = impacts[0];
        const emotionalImpact = primaryImpact?.emotionalImpact;

        // Save timeline event
        await supabaseAdmin
          .from('character_timeline_events')
          .upsert({
            user_id: userId,
            character_id: characterId,
            event_id: eventId,
            timeline_type: timelineType,
            user_was_present: userWasPresent || userInEvent,
            character_role: characterRole,
            event_title: event.title,
            event_date: event.start_time,
            event_summary: event.summary,
            event_type: event.type,
            impact_type: actualImpactType,
            connection_character_id: actualConnectionCharacterId,
            emotional_impact: emotionalImpact,
            confidence: 0.7,
            metadata: {
              processed_at: new Date().toISOString(),
            },
          })
          .eq('user_id', userId)
          .eq('character_id', characterId)
          .eq('event_id', eventId)
          .eq('timeline_type', timelineType);
      }
    } catch (error) {
      logger.error({ error, userId, eventId }, 'Failed to process event for character timelines');
    }
  }

  /**
   * Fold a segmented episode where this character was the primary entity
   * into their timeline as a lore entry — the character-timeline equivalent
   * of entityTimelineBuilder's processThreadForEntity, but keyed to a single
   * episode (source_episode_id) rather than a whole thread, since a thread
   * can contain distinct scenes for different characters and each needs its
   * own entry rather than one collapsing into the other on upsert.
   */
  async processEpisodeForCharacter(
    userId: string,
    characterId: string,
    episode: { id: string; title: string; start_at: string; source_message_ids?: string[] }
  ): Promise<void> {
    try {
      const { error } = await supabaseAdmin.from('character_timeline_events').upsert(
        {
          user_id: userId,
          character_id: characterId,
          event_id: null,
          source_episode_id: episode.id,
          timeline_type: 'lore',
          user_was_present: true,
          character_role: 'mentioned',
          event_title: episode.title || 'Conversation',
          event_date: episode.start_at,
          event_type: 'conversation',
          source_message_ids: episode.source_message_ids ?? [],
          confidence: 0.6,
          metadata: { processed_at: new Date().toISOString() },
        },
        { onConflict: 'user_id,character_id,source_episode_id,timeline_type' }
      );

      if (error) {
        logger.warn(
          { error, userId, characterId, episodeId: episode.id },
          'Failed to upsert episode-sourced character timeline event'
        );
      }
    } catch (error) {
      logger.error({ error, userId, characterId, episodeId: episode.id }, 'Failed to process episode for character timeline');
    }
  }

  /**
   * Rebuild timelines for a character (useful after event updates)
   */
  async rebuildTimelinesForCharacter(
    userId: string,
    characterId: string
  ): Promise<void> {
    try {
      // Get all events involving this character
      const { data: character } = await supabaseAdmin
        .from('characters')
        .select('name')
        .eq('id', characterId)
        .eq('user_id', userId)
        .single();

      if (!character) {
        return;
      }

      // Get all events where this character is mentioned
      const { data: events } = await supabaseAdmin
        .from('resolved_events')
        .select('*')
        .eq('user_id', userId)
        .contains('people', [characterId]);

      // Process each event
      for (const event of events || []) {
        const impacts = await eventImpactDetector.getEventImpacts(userId, event.id);
        const primaryImpact = impacts[0];

        await this.processEventForCharacters(
          userId,
          event.id,
          {
            title: event.title,
            summary: event.summary,
            type: event.type,
            start_time: event.start_time,
            people: event.people || [],
          },
          primaryImpact?.impactType,
          primaryImpact?.connectionCharacterId
        );
      }

      // Fold episodes where this character was the primary entity
      const { data: episodes } = await supabaseAdmin
        .from('episodes')
        .select('id, title, start_at, source_message_ids')
        .eq('user_id', userId)
        .eq('primary_entity_type', 'character')
        .eq('primary_entity_id', characterId);

      for (const episode of episodes || []) {
        await this.processEpisodeForCharacter(userId, characterId, episode);
      }
    } catch (error) {
      logger.error({ error, userId, characterId }, 'Failed to rebuild timelines for character');
    }
  }
}

export const characterTimelineBuilder = new CharacterTimelineBuilder();
