import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type { ResolvedEvent, TemporalSignal, EventMention } from './types';

/**
 * Storage layer for resolved events and mentions
 */
export class EventStorage {
  /**
   * Load all resolved events for a user
   */
  async loadAll(userId: string): Promise<ResolvedEvent[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('resolved_events')
        .select('*')
        .eq('user_id', userId)
        .order('start_time', { ascending: false });

      if (error) {
        logger.error({ error }, 'Failed to load resolved events');
        return [];
      }

      return (data || []).map(e => ({
        id: e.id,
        title: e.title,
        summary: e.summary,
        type: e.type,
        startTime: e.start_time,
        endTime: e.end_time,
        confidence: e.confidence,
        people: e.people || [],
        locations: e.locations || [],
        activities: e.activities || [],
        embedding: e.embedding,
        metadata: e.metadata || {},
        user_id: e.user_id,
        created_at: e.created_at,
        updated_at: e.updated_at,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to load resolved events');
      return [];
    }
  }

  /**
   * Create a new resolved event
   */
  async createEvent(
    userId: string,
    event: ResolvedEvent,
    signals: TemporalSignal[]
  ): Promise<ResolvedEvent> {
    try {
      const { data, error } = await supabaseAdmin
        .from('resolved_events')
        .insert({
          user_id: userId,
          title: event.title,
          summary: event.summary,
          type: event.type,
          start_time: event.startTime,
          end_time: event.endTime,
          confidence: event.confidence,
          embedding: event.embedding || null,
          people: event.people || [],
          locations: event.locations || [],
          activities: event.activities || [],
          metadata: event.metadata || {},
        })
        .select()
        .single();

      if (error) {
        logger.error({ error }, 'Failed to create resolved event');
        throw error;
      }

      // Save mentions
      await this.saveMentions(data.id, signals);

      return {
        id: data.id,
        title: data.title,
        summary: data.summary,
        type: data.type,
        startTime: data.start_time,
        endTime: data.end_time,
        confidence: data.confidence,
        people: data.people || [],
        locations: data.locations || [],
        activities: data.activities || [],
        embedding: data.embedding,
        metadata: data.metadata || {},
        user_id: data.user_id,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to create resolved event');
      throw error;
    }
  }

  /**
   * Link signals to existing event
   */
  async linkToExisting(
    existing: ResolvedEvent,
    signals: TemporalSignal[],
    candidate: ResolvedEvent
  ): Promise<ResolvedEvent> {
    try {
      // Merge people, locations, activities
      const mergedPeople = Array.from(new Set([...existing.people, ...candidate.people]));
      const mergedLocations = Array.from(new Set([...existing.locations, ...candidate.locations]));
      const mergedActivities = Array.from(new Set([...existing.activities, ...candidate.activities]));

      // Update end time if candidate is later
      const existingEnd = existing.endTime ? new Date(existing.endTime).getTime() : 0;
      const candidateEnd = candidate.endTime ? new Date(candidate.endTime).getTime() : 0;
      const newEndTime = candidateEnd > existingEnd ? candidate.endTime : existing.endTime;

      const { error } = await supabaseAdmin
        .from('resolved_events')
        .update({
          end_time: newEndTime,
          people: mergedPeople,
          locations: mergedLocations,
          activities: mergedActivities,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (error) {
        logger.error({ error }, 'Failed to update existing event');
        throw error;
      }

      // Save mentions
      await this.saveMentions(existing.id!, signals);

      return {
        ...existing,
        endTime: newEndTime,
        people: mergedPeople,
        locations: mergedLocations,
        activities: mergedActivities,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to link to existing event');
      throw error;
    }
  }

  /**
   * Save event mentions
   */
  async saveMentions(eventId: string, signals: TemporalSignal[]): Promise<void> {
    if (signals.length === 0) return;

    try {
      const mentions = signals.map(s => ({
        event_id: eventId,
        memory_id: s.memoryId,
        signal: {
          timestamp: s.timestamp,
          people: s.people,
          locations: s.locations,
          activities: s.activities,
          text: s.text,
        },
      }));

      const { error } = await supabaseAdmin
        .from('event_mentions')
        .insert(mentions);

      if (error) {
        logger.error({ error }, 'Failed to save event mentions');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to save event mentions');
    }
  }
}

