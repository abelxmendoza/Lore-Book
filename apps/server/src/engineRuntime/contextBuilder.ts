import { subDays } from 'date-fns';

import { logger } from '../logger';
import { supabaseAdmin } from '../services/supabaseClient';

import type { EngineContext } from './types';

export interface BuildContextOptions {
  maxEntries?: number; // Default: 1000
  maxDays?: number; // Default: 90
  includeAll?: boolean; // For engines that need everything (chronology, legacy)
}

/**
 * Builds shared context for all engines
 * Loads everything engines need using one shared call
 * Optimized with configurable limits to improve performance for large datasets
 */
export async function buildEngineContext(
  userId: string,
  options: BuildContextOptions = {}
): Promise<EngineContext> {
  try {
    const { maxEntries = 1000, maxDays = 90, includeAll = false } = options;
    logger.debug({ userId, maxEntries, maxDays, includeAll }, 'Building engine context');

    // Calculate date cutoff if limiting by days
    const dateCutoff = includeAll ? null : subDays(new Date(), maxDays).toISOString();

    // Build query for journal entries
    let entriesQuery = supabaseAdmin
      .from('journal_entries')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false }); // Most recent first for better relevance

    // Apply limits if not including all
    if (!includeAll) {
      if (dateCutoff) {
        entriesQuery = entriesQuery.gte('date', dateCutoff);
      }
      entriesQuery = entriesQuery.limit(maxEntries);
    }

    const { data: entries, error: entriesError } = await entriesQuery;

    if (entriesError) {
      logger.error({ error: entriesError }, 'Error loading journal entries');
    }

    // Reverse to chronological order (oldest first) for engines that need it
    const entriesChronological = (entries || []).reverse();

    // Load relationships (if table exists)
    let relationships: any[] = [];
    try {
      const { data: relData } = await supabaseAdmin
        .from('relationships')
        .select('*')
        .eq('user_id', userId);
      relationships = relData || [];
    } catch (err) {
      logger.debug({ error: err }, 'Relationships table not available');
    }

    // Load goals (if table exists)
    let goals: any[] = [];
    try {
      const { data: goalsData } = await supabaseAdmin
        .from('goals')
        .select('*')
        .eq('user_id', userId);
      goals = goalsData || [];
    } catch (err) {
      logger.debug({ error: err }, 'Goals table not available');
    }

    // Load habits (if table exists)
    let habits: any[] = [];
    try {
      const { data: habitsData } = await supabaseAdmin
        .from('habits')
        .select('*')
        .eq('user_id', userId);
      habits = habitsData || [];
    } catch (err) {
      logger.debug({ error: err }, 'Habits table not available');
    }

    const context: EngineContext = {
      entries: entriesChronological,
      relationships,
      goals,
      habits,
      user: {
        id: userId,
      },
      now: new Date(),
    };

    logger.debug(
      {
        userId,
        entries: context.entries.length,
        relationships: context.relationships?.length || 0,
        goals: context.goals?.length || 0,
        habits: context.habits?.length || 0,
        limited: !includeAll,
        maxEntries,
        maxDays,
      },
      'Engine context built'
    );

    return context;
  } catch (error) {
    logger.error({ error, userId }, 'Error building engine context');
    // Return minimal context on error
    return {
      entries: [],
      relationships: [],
      goals: [],
      habits: [],
      user: { id: userId },
      now: new Date(),
    };
  }
}

