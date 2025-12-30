import { logger } from '../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { EngineContext } from './types';

/**
 * Builds shared context for all engines
 * Loads everything engines need using one shared call
 */
export async function buildEngineContext(userId: string): Promise<EngineContext> {
  try {
    logger.debug({ userId }, 'Building engine context');

    // Load journal entries
    const { data: entries, error: entriesError } = await supabaseAdmin
      .from('journal_entries')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: true });

    if (entriesError) {
      logger.error({ error: entriesError }, 'Error loading journal entries');
    }

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
      entries: entries || [],
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

