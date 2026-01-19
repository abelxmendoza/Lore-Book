/**
 * Timeline Engine Service
 * Main service for managing unified timeline events
 */

import { randomUUID } from 'crypto';

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type { NormalizedTimelineEvent, TimelineEvent } from './normalizers/base';

export interface TimelineFilter {
  tags?: string[];
  sourceTypes?: string[];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class TimelineEngine {
  /**
   * Add events to the timeline
   */
  async addEvents(userId: string, events: NormalizedTimelineEvent[]): Promise<void> {
    if (events.length === 0) return;

    const timelineEvents = events.map(e => ({
      id: randomUUID(),
      user_id: userId,
      title: e.title,
      description: e.description || null,
      event_date: e.eventDate.toISOString(),
      occurred_at: e.eventDate.toISOString(), // For backward compatibility
      end_date: e.endDate?.toISOString() || null,
      tags: e.tags || [],
      metadata: e.metadata || {},
      context: e.metadata || {}, // For backward compatibility
      source_id: e.sourceId || null,
      source_type: e.sourceType,
      confidence: e.confidence ?? 1.0
    }));

    const { error } = await supabaseAdmin
      .from('timeline_events')
      .insert(timelineEvents);

    if (error) {
      logger.error({ err: error, userId, eventCount: events.length }, 'Failed to add timeline events');
      throw new Error(`Failed to add timeline events: ${error.message}`);
    }

    logger.info({ userId, eventCount: events.length }, 'Added timeline events');
  }

  /**
   * Get timeline events with filters
   */
  async getTimeline(userId: string, filter: TimelineFilter = {}): Promise<TimelineEvent[]> {
    let query = supabaseAdmin
      .from('timeline_events')
      .select('*')
      .eq('user_id', userId);

    // Filter by tags
    if (filter.tags && filter.tags.length > 0) {
      query = query.contains('tags', filter.tags);
    }

    // Filter by source types
    if (filter.sourceTypes && filter.sourceTypes.length > 0) {
      query = query.in('source_type', filter.sourceTypes);
    }

    // Filter by date range
    // Note: Migration ensures event_date is populated from occurred_at for existing records
    if (filter.startDate) {
      query = query.gte('event_date', filter.startDate.toISOString());
    }

    if (filter.endDate) {
      query = query.lte('event_date', filter.endDate.toISOString());
    }

    // Order by date (event_date should be populated for all records after migration)
    query = query.order('event_date', { ascending: true });

    // Apply limit and offset
    if (filter.limit) {
      query = query.limit(filter.limit);
    }

    if (filter.offset) {
      query = query.range(filter.offset, filter.offset + (filter.limit || 100) - 1);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ err: error, userId, filter }, 'Failed to get timeline events');
      throw new Error(`Failed to get timeline events: ${error.message}`);
    }

    return (data || []).map(row => ({
      id: row.id,
      userId: row.user_id,
      sourceType: row.source_type || 'custom',
      sourceId: row.source_id,
      title: row.title,
      description: row.description,
      eventDate: new Date(row.event_date || row.occurred_at || row.created_at),
      endDate: row.end_date ? new Date(row.end_date) : undefined,
      tags: row.tags || [],
      metadata: row.metadata || row.context || {},
      confidence: row.confidence || 1.0,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  /**
   * Delete timeline events for a user (used during rebuild)
   */
  async clearUserTimeline(userId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('timeline_events')
      .delete()
      .eq('user_id', userId);

    if (error) {
      logger.error({ err: error, userId }, 'Failed to clear timeline events');
      throw new Error(`Failed to clear timeline events: ${error.message}`);
    }

    logger.info({ userId }, 'Cleared timeline events');
  }

  /**
   * Delete a specific timeline event
   */
  async deleteEvent(eventId: string, userId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('timeline_events')
      .delete()
      .eq('id', eventId)
      .eq('user_id', userId);

    if (error) {
      logger.error({ err: error, eventId, userId }, 'Failed to delete timeline event');
      throw new Error(`Failed to delete timeline event: ${error.message}`);
    }
  }

  /**
   * Update a timeline event
   */
  async updateEvent(eventId: string, userId: string, updates: Partial<NormalizedTimelineEvent>): Promise<void> {
    const updateData: any = {};

    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.eventDate !== undefined) updateData.event_date = updates.eventDate.toISOString();
    if (updates.endDate !== undefined) updateData.end_date = updates.endDate?.toISOString() || null;
    if (updates.tags !== undefined) updateData.tags = updates.tags;
    if (updates.metadata !== undefined) updateData.metadata = updates.metadata;
    if (updates.confidence !== undefined) updateData.confidence = updates.confidence;

    const { error } = await supabaseAdmin
      .from('timeline_events')
      .update(updateData)
      .eq('id', eventId)
      .eq('user_id', userId);

    if (error) {
      logger.error({ err: error, eventId, userId }, 'Failed to update timeline event');
      throw new Error(`Failed to update timeline event: ${error.message}`);
    }
  }
}


