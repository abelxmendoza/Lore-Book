/**
 * Timeline Sync Service
 * Rebuilds the unified timeline from all data sources
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import {
  normalizeJournalEntry,
  normalizeFightEvent,
  normalizeJobEvent,
  normalizeProjectEvent,
  normalizeIdentityEvent,
  normalizeParacosm,
  normalizeArc,
  normalizeRelationshipEvent,
  normalizeEmotionEvent,
  normalizeHabitEvent,
  type NormalizedTimelineEvent
} from './normalizers';
import type { ArcEvent } from './normalizers/arcNormalizer';
import type { EmotionEvent } from './normalizers/emotionNormalizer';
import type { FightRecord } from './normalizers/fightNormalizer';
import type { HabitEvent } from './normalizers/habitNormalizer';
import type { IdentityChange } from './normalizers/identityNormalizer';
import type { JobRecord } from './normalizers/jobNormalizer';
import type { JournalEntry } from './normalizers/journalNormalizer';
import type { ParacosmEvent } from './normalizers/paracosmNormalizer';
import type { ProjectEvent } from './normalizers/projectNormalizer';
import type { RelationshipEvent } from './normalizers/relationshipNormalizer';
import { TimelineEngine } from './timelineEngine';

export class TimelineSyncService {
  constructor(private timelineEngine: TimelineEngine) {}

  /**
   * Rebuild timeline for a user from all available data sources
   */
  async rebuildForUser(userId: string): Promise<void> {
    logger.info({ userId }, 'Starting timeline rebuild');

    try {
      // 1. Clear existing timeline
      await this.timelineEngine.clearUserTimeline(userId);

      // 2. Fetch all raw data from all engines
      const allEvents: NormalizedTimelineEvent[] = [];

      // Journal entries
      const journalEvents = await this.fetchJournalEntries(userId);
      allEvents.push(...journalEvents);

      // Fight records (if table exists)
      try {
        const fightEvents = await this.fetchFightRecords(userId);
        allEvents.push(...fightEvents);
      } catch (err) {
        logger.debug({ error: err }, 'Fight records table not available');
      }

      // Job records (if table exists)
      try {
        const jobEvents = await this.fetchJobRecords(userId);
        allEvents.push(...jobEvents);
      } catch (err) {
        logger.debug({ error: err }, 'Job records table not available');
      }

      // Project events (if table exists)
      try {
        const projectEvents = await this.fetchProjectEvents(userId);
        allEvents.push(...projectEvents);
      } catch (err) {
        logger.debug({ error: err }, 'Project events table not available');
      }

      // Identity changes (from identity engine results)
      try {
        const identityEvents = await this.fetchIdentityChanges(userId);
        allEvents.push(...identityEvents);
      } catch (err) {
        logger.debug({ error: err }, 'Identity changes not available');
      }

      // Paracosm events (from paracosm engine results)
      try {
        const paracosmEvents = await this.fetchParacosmEvents(userId);
        allEvents.push(...paracosmEvents);
      } catch (err) {
        logger.debug({ error: err }, 'Paracosm events not available');
      }

      // Arc/Saga/Era events (from narrative engine)
      try {
        const arcEvents = await this.fetchArcEvents(userId);
        allEvents.push(...arcEvents);
      } catch (err) {
        logger.debug({ error: err }, 'Arc events not available');
      }

      // Relationship events (from relationship dynamics)
      try {
        const relationshipEvents = await this.fetchRelationshipEvents(userId);
        allEvents.push(...relationshipEvents);
      } catch (err) {
        logger.debug({ error: err }, 'Relationship events not available');
      }

      // Emotion events (from emotion engine)
      try {
        const emotionEvents = await this.fetchEmotionEvents(userId);
        allEvents.push(...emotionEvents);
      } catch (err) {
        logger.debug({ error: err }, 'Emotion events not available');
      }

      // Habit events (if table exists)
      try {
        const habitEvents = await this.fetchHabitEvents(userId);
        allEvents.push(...habitEvents);
      } catch (err) {
        logger.debug({ error: err }, 'Habit events table not available');
      }

      // 3. Normalize and add all events
      if (allEvents.length > 0) {
        await this.timelineEngine.addEvents(userId, allEvents);
        logger.info({ userId, eventCount: allEvents.length }, 'Timeline rebuild completed');
      } else {
        logger.info({ userId }, 'No events found to add to timeline');
      }
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to rebuild timeline');
      throw error;
    }
  }

  /**
   * Fetch and normalize journal entries
   */
  private async fetchJournalEntries(userId: string): Promise<NormalizedTimelineEvent[]> {
    const { data: entries, error } = await supabaseAdmin
      .from('journal_entries')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: true });

    if (error) {
      logger.warn({ error, userId }, 'Failed to fetch journal entries');
      return [];
    }

    return (entries || []).flatMap(entry => 
      normalizeJournalEntry({
        id: entry.id,
        date: entry.date || entry.timestamp || entry.created_at,
        content: entry.content || '',
        summary: entry.summary,
        tags: entry.tags || [],
        mood: entry.mood,
        sentiment: entry.sentiment,
        chapter_id: entry.chapter_id,
        source: entry.source,
        metadata: entry.metadata
      })
    );
  }

  /**
   * Fetch and normalize fight records
   */
  private async fetchFightRecords(userId: string): Promise<NormalizedTimelineEvent[]> {
    // Check if fights table exists by trying to query it
    const { data: fights, error } = await supabaseAdmin
      .from('fights')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: true });

    if (error) {
      if (error.code === '42P01') {
        // Table doesn't exist
        return [];
      }
      logger.warn({ error, userId }, 'Failed to fetch fight records');
      return [];
    }

    return (fights || []).flatMap(fight =>
      normalizeFightEvent({
        id: fight.id,
        date: fight.date,
        opponent: fight.opponent,
        notes: fight.notes,
        result: fight.result,
        method: fight.method,
        gym: fight.gym,
        tags: fight.tags,
        metadata: fight.metadata
      })
    );
  }

  /**
   * Fetch and normalize job records
   */
  private async fetchJobRecords(userId: string): Promise<NormalizedTimelineEvent[]> {
    const { data: jobs, error } = await supabaseAdmin
      .from('jobs')
      .select('*')
      .eq('user_id', userId)
      .order('start_date', { ascending: true });

    if (error) {
      if (error.code === '42P01') {
        return [];
      }
      logger.warn({ error, userId }, 'Failed to fetch job records');
      return [];
    }

    return (jobs || []).flatMap(job =>
      normalizeJobEvent({
        id: job.id,
        company: job.company,
        position: job.position,
        startDate: job.start_date,
        endDate: job.end_date,
        description: job.description,
        tags: job.tags,
        metadata: job.metadata
      })
    );
  }

  /**
   * Fetch and normalize project events
   */
  private async fetchProjectEvents(userId: string): Promise<NormalizedTimelineEvent[]> {
    const { data: projects, error } = await supabaseAdmin
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      if (error.code === '42P01') {
        return [];
      }
      logger.warn({ error, userId }, 'Failed to fetch project events');
      return [];
    }

    return (projects || []).flatMap(project =>
      normalizeProjectEvent({
        id: project.id,
        name: project.name,
        date: project.start_date || project.created_at,
        type: project.type || 'custom',
        description: project.description,
        tags: project.tags,
        metadata: project.metadata
      })
    );
  }

  /**
   * Fetch and normalize identity changes from engine results
   */
  private async fetchIdentityChanges(userId: string): Promise<NormalizedTimelineEvent[]> {
    // Fetch from engine_results table where engine_id is identity-related
    const { data: results, error } = await supabaseAdmin
      .from('engine_results')
      .select('*')
      .eq('user_id', userId)
      .in('engine_id', ['identity_core', 'archetype'])
      .order('created_at', { ascending: true });

    if (error) {
      if (error.code === '42P01') {
        return [];
      }
      logger.warn({ error, userId }, 'Failed to fetch identity changes');
      return [];
    }

    const events: NormalizedTimelineEvent[] = [];

    for (const result of results || []) {
      try {
        const data = result.data as any;
        if (data.changes && Array.isArray(data.changes)) {
          for (const change of data.changes) {
            events.push(...normalizeIdentityEvent({
              id: `${result.id}-${change.id || Date.now()}`,
              date: change.date || result.created_at,
              dimension: change.dimension || result.engine_id,
              oldValue: change.old_value,
              newValue: change.new_value,
              description: change.description,
              confidence: change.confidence,
              metadata: { engine_result_id: result.id, ...change }
            }));
          }
        }
      } catch (err) {
        logger.debug({ error: err, resultId: result.id }, 'Failed to parse identity change');
      }
    }

    return events;
  }

  /**
   * Fetch and normalize paracosm events from engine results
   */
  private async fetchParacosmEvents(userId: string): Promise<NormalizedTimelineEvent[]> {
    const { data: results, error } = await supabaseAdmin
      .from('engine_results')
      .select('*')
      .eq('user_id', userId)
      .eq('engine_id', 'paracosm')
      .order('created_at', { ascending: true });

    if (error) {
      if (error.code === '42P01') {
        return [];
      }
      logger.warn({ error, userId }, 'Failed to fetch paracosm events');
      return [];
    }

    const events: NormalizedTimelineEvent[] = [];

    for (const result of results || []) {
      try {
        const data = result.data as any;
        if (data.events && Array.isArray(data.events)) {
          for (const event of data.events) {
            events.push(...normalizeParacosm({
              id: `${result.id}-${event.id || Date.now()}`,
              date: event.date || result.created_at,
              worldName: event.world_name,
              eventDescription: event.description || event.event_description,
              type: event.type,
              tags: event.tags,
              metadata: { engine_result_id: result.id, ...event }
            }));
          }
        }
      } catch (err) {
        logger.debug({ error: err, resultId: result.id }, 'Failed to parse paracosm event');
      }
    }

    return events;
  }

  /**
   * Fetch and normalize arc/saga/era events
   */
  private async fetchArcEvents(userId: string): Promise<NormalizedTimelineEvent[]> {
    // Check timeline_hierarchy table
    const { data: arcs, error } = await supabaseAdmin
      .from('timeline_hierarchy')
      .select('*')
      .eq('user_id', userId)
      .order('start_date', { ascending: true });

    if (error) {
      if (error.code === '42P01') {
        return [];
      }
      logger.warn({ error, userId }, 'Failed to fetch arc events');
      return [];
    }

    return (arcs || []).flatMap(arc =>
      normalizeArc({
        id: arc.id,
        name: arc.name,
        startDate: arc.start_date,
        endDate: arc.end_date,
        type: arc.type || 'arc',
        description: arc.description,
        tags: arc.tags,
        metadata: arc.metadata
      })
    );
  }

  /**
   * Fetch and normalize relationship events
   */
  private async fetchRelationshipEvents(userId: string): Promise<NormalizedTimelineEvent[]> {
    // Check relationships table and relationship_dynamics engine results
    const events: NormalizedTimelineEvent[] = [];

    // From relationships table
    const { data: relationships, error: relError } = await supabaseAdmin
      .from('relationships')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (!relError && relationships) {
      for (const rel of relationships) {
        if (rel.first_met_date) {
          events.push(...normalizeRelationshipEvent({
            id: `${rel.id}-met`,
            date: rel.first_met_date,
            characterName: rel.name || rel.character_name || 'Unknown',
            eventType: 'met',
            description: rel.notes,
            metadata: { relationship_id: rel.id }
          }));
        }
      }
    }

    // From relationship_dynamics engine results
    const { data: dynamics, error: dynError } = await supabaseAdmin
      .from('engine_results')
      .select('*')
      .eq('user_id', userId)
      .eq('engine_id', 'relationship_dynamics')
      .order('created_at', { ascending: true });

    if (!dynError && dynamics) {
      for (const result of dynamics) {
        try {
          const data = result.data as any;
          if (data.interactions && Array.isArray(data.interactions)) {
            for (const interaction of data.interactions) {
              events.push(...normalizeRelationshipEvent({
                id: `${result.id}-${interaction.id || Date.now()}`,
                date: interaction.date || result.created_at,
                characterName: interaction.character_name || 'Unknown',
                eventType: interaction.type || 'interaction',
                description: interaction.description,
                tags: interaction.tags,
                metadata: { engine_result_id: result.id, ...interaction }
              }));
            }
          }
        } catch (err) {
          logger.debug({ error: err, resultId: result.id }, 'Failed to parse relationship event');
        }
      }
    }

    return events;
  }

  /**
   * Fetch and normalize emotion events
   */
  private async fetchEmotionEvents(userId: string): Promise<NormalizedTimelineEvent[]> {
    const { data: results, error } = await supabaseAdmin
      .from('engine_results')
      .select('*')
      .eq('user_id', userId)
      .eq('engine_id', 'emotional_intelligence')
      .order('created_at', { ascending: true });

    if (error) {
      if (error.code === '42P01') {
        return [];
      }
      logger.warn({ error, userId }, 'Failed to fetch emotion events');
      return [];
    }

    const events: NormalizedTimelineEvent[] = [];

    for (const result of results || []) {
      try {
        const data = result.data as any;
        if (data.emotions && Array.isArray(data.emotions)) {
          for (const emotion of data.emotions) {
            events.push(...normalizeEmotionEvent({
              id: `${result.id}-${emotion.id || Date.now()}`,
              date: emotion.date || result.created_at,
              emotion: emotion.emotion || emotion.name,
              intensity: emotion.intensity,
              trigger: emotion.trigger,
              description: emotion.description,
              tags: emotion.tags,
              metadata: { engine_result_id: result.id, ...emotion }
            }));
          }
        }
      } catch (err) {
        logger.debug({ error: err, resultId: result.id }, 'Failed to parse emotion event');
      }
    }

    return events;
  }

  /**
   * Fetch and normalize habit events
   */
  private async fetchHabitEvents(userId: string): Promise<NormalizedTimelineEvent[]> {
    const { data: habits, error } = await supabaseAdmin
      .from('habits')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      if (error.code === '42P01') {
        return [];
      }
      logger.warn({ error, userId }, 'Failed to fetch habit events');
      return [];
    }

    const events: NormalizedTimelineEvent[] = [];

    // For each habit, create events for milestones and completions
    for (const habit of habits || []) {
      // Start event
      if (habit.start_date) {
        events.push(...normalizeHabitEvent({
          id: `${habit.id}-start`,
          date: habit.start_date,
          habitName: habit.name,
          eventType: 'started',
          description: habit.description,
          metadata: { habit_id: habit.id }
        }));
      }

      // Check for completion records (if habits_completions table exists)
      try {
        const { data: completions } = await supabaseAdmin
          .from('habit_completions')
          .select('*')
          .eq('habit_id', habit.id)
          .order('date', { ascending: true });

        if (completions) {
          for (const completion of completions) {
            events.push(...normalizeHabitEvent({
              id: `${habit.id}-${completion.id}`,
              date: completion.date,
              habitName: habit.name,
              eventType: 'completed',
              description: completion.notes,
              streak: completion.streak,
              metadata: { habit_id: habit.id, completion_id: completion.id }
            }));
          }
        }
      } catch (err) {
        // Table doesn't exist, skip
      }
    }

    return events;
  }
}

