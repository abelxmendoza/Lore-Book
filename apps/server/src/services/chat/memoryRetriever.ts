import { logger } from '../../logger';
import { supabaseAdmin } from '../../supabaseClient';
import { getEngineResults } from '../../engineRuntime/storage';
import { embeddingService } from '../embeddingService';
import type { MemoryContext } from './chatTypes';
import type { MemoryEntry } from '../../types';

/**
 * Memory Retriever
 * Fetches relevant entries + engine outputs
 */
export class MemoryRetriever {
  /**
   * Retrieve memory context for a user
   * @param userId - User ID
   * @param max - Maximum number of entries to retrieve
   * @param query - Optional query for semantic search
   */
  async retrieve(userId: string, max = 20, query?: string): Promise<MemoryContext> {
    try {
      logger.debug({ userId, max, hasQuery: !!query }, 'Retrieving memory context');

      let entries: MemoryEntry[] = [];

      // STEP 1: Use semantic search if query provided, otherwise get recent entries
      if (query && query.trim().length > 0) {
        // Get semantically relevant entries
        const relevantEntries = await this.searchRelevantEntries(userId, query, Math.floor(max * 0.6));
        
        // Also get some recent entries for context
        const { data: recentEntries } = await supabaseAdmin
          .from('journal_entries')
          .select('*')
          .eq('user_id', userId)
          .order('timestamp', { ascending: false })
          .limit(Math.floor(max * 0.4));

        // Combine and deduplicate by ID
        const entryMap = new Map<string, MemoryEntry>();
        relevantEntries.forEach((e) => {
          if (e.id) entryMap.set(e.id, e);
        });
        (recentEntries || []).forEach((e: MemoryEntry) => {
          if (e.id && !entryMap.has(e.id)) entryMap.set(e.id, e);
        });

        entries = Array.from(entryMap.values());
        logger.debug({ userId, relevantCount: relevantEntries.length, totalCount: entries.length }, 'Retrieved entries via semantic search');
      } else {
        // Fallback to recent entries
        const { data: entriesData, error: entriesError } = await supabaseAdmin
          .from('journal_entries')
          .select('*')
          .eq('user_id', userId)
          .order('timestamp', { ascending: false })
          .limit(max);

        if (entriesError) {
          logger.error({ error: entriesError }, 'Error fetching journal entries');
        }

        entries = (entriesData || []) as MemoryEntry[];
      }

      // STEP 2: Get engine results from engine runtime
      const engineResults = await getEngineResults(userId);

      // STEP 3: Extract specific engine outputs
      const identity = engineResults?.identityCore?.data || null;
      const archetypes = engineResults?.archetype?.data || null;
      const paracosm = engineResults?.paracosm?.data || null;
      const values = engineResults?.values?.data || null;
      const chronology = engineResults?.chronology?.data || null;
      const relationships = engineResults?.social?.data || null;
      const habits = engineResults?.habits?.data || null;
      const goals = engineResults?.goals?.data || null;
      const emotionalArcs = engineResults?.eq?.data || null;
      const vibes = engineResults?.identityCore?.data || null; // Use identity core for vibes
      const insights = engineResults || {}; // All engine results as insights

      // STEP 4: Get additional summaries if available
      let relationshipDynamics = null;
      try {
        const { data: relData } = await supabaseAdmin
          .from('social_insights')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        relationshipDynamics = relData;
      } catch (err) {
        logger.debug({ error: err }, 'Relationship dynamics not available');
      }

      let habitSummary = null;
      try {
        const { data: habitData } = await supabaseAdmin
          .from('habits')
          .select('*')
          .eq('user_id', userId);
        habitSummary = habitData;
      } catch (err) {
        logger.debug({ error: err }, 'Habit summary not available');
      }

      let goalsSummary = null;
      try {
        const { data: goalsData } = await supabaseAdmin
          .from('goals')
          .select('*')
          .eq('user_id', userId);
        goalsSummary = goalsData;
      } catch (err) {
        logger.debug({ error: err }, 'Goals summary not available');
      }

      const context: MemoryContext = {
        entries: (entries || []) as MemoryEntry[],
        insights,
        identity: identity || {},
        chronology: chronology || {},
        relationships: relationships || relationshipDynamics || {},
        habits: habits || habitSummary || [],
        goals: goals || goalsSummary || [],
        emotionalArcs: emotionalArcs || {},
        archetypes: archetypes || {},
        paracosm: paracosm || {},
        values: values || {},
        vibes: vibes || {},
      };

      logger.debug(
        {
          userId,
          entries: context.entries.length,
          hasIdentity: !!context.identity,
          hasArchetypes: !!context.archetypes,
        },
        'Memory context retrieved'
      );

      return context;
    } catch (error) {
      logger.error({ error, userId }, 'Error retrieving memory context');
      // Return minimal context on error
      return {
        entries: [],
        insights: {},
        identity: {},
        chronology: {},
        relationships: {},
        habits: [],
        goals: [],
        emotionalArcs: {},
        archetypes: {},
        paracosm: {},
        values: {},
        vibes: {},
      };
    }
  }

  /**
   * Semantic search for relevant entries
   */
  async searchRelevantEntries(
    userId: string,
    query: string,
    limit: number = 10
  ): Promise<MemoryEntry[]> {
    try {
      // Get query embedding
      const queryEmbedding = await embeddingService.embedText(query);

      // Search using vector similarity
      const { data, error } = await supabaseAdmin.rpc('match_journal_entries', {
        user_uuid: userId,
        query_embedding: queryEmbedding,
        match_threshold: 0.7,
        match_count: limit,
      });

      if (error) {
        logger.error({ error }, 'Error in semantic search');
        // Fallback to text search
        const { data: textData } = await supabaseAdmin
          .from('journal_entries')
          .select('*')
          .eq('user_id', userId)
          .ilike('content', `%${query}%`)
          .limit(limit);
        return (textData || []) as MemoryEntry[];
      }

      return (data || []) as MemoryEntry[];
    } catch (error) {
      logger.error({ error }, 'Error searching relevant entries');
      return [];
    }
  }
}

