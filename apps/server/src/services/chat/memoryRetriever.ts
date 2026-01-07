import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { getEngineResults } from '../../engineRuntime/storage';
import { embeddingService } from '../embeddingService';
import { entityConfidenceService } from '../entityConfidenceService';
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
   * Semantic search for relevant entries with confidence weighting
   */
  async searchRelevantEntries(
    userId: string,
    query: string,
    limit: number = 10
  ): Promise<MemoryEntry[]> {
    try {
      // Get query embedding
      const queryEmbedding = await embeddingService.embedText(query);

      // Search using vector similarity (get more results for re-ranking)
      const { data, error } = await supabaseAdmin.rpc('match_journal_entries', {
        user_uuid: userId,
        query_embedding: queryEmbedding,
        match_threshold: 0.7,
        match_count: limit * 2, // Get more for confidence re-ranking
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

      const entries = (data || []) as MemoryEntry[];

      // NEW: Attach entity confidence and re-rank
      const entriesWithConfidence = await this.attachConfidenceAndRank(
        userId,
        entries,
        limit
      );

      return entriesWithConfidence;
    } catch (error) {
      logger.error({ error }, 'Error searching relevant entries');
      return [];
    }
  }

  /**
   * Attach entity confidence to entries and re-rank by confidence-weighted score
   */
  private async attachConfidenceAndRank(
    userId: string,
    entries: MemoryEntry[],
    limit: number
  ): Promise<MemoryEntry[]> {
    try {
      // Get entity mentions for all entries
      const entryIds = entries.map(e => e.id).filter(Boolean);
      if (entryIds.length === 0) return entries;

      const { data: mentions } = await supabaseAdmin
        .from('entity_mentions')
        .select('memory_id, entity_id')
        .in('memory_id', entryIds)
        .eq('user_id', userId);

      // Group entity IDs by entry
      const entryEntityMap = new Map<string, string[]>();
      (mentions || []).forEach(m => {
        const existing = entryEntityMap.get(m.memory_id) || [];
        if (!existing.includes(m.entity_id)) {
          existing.push(m.entity_id);
        }
        entryEntityMap.set(m.memory_id, existing);
      });

      // Load confidence for each entry's entities
      const entriesWithConfidence = await Promise.all(
        entries.map(async (entry) => {
          const entityIds = entryEntityMap.get(entry.id) || [];
          
          if (entityIds.length === 0) {
            // No entities, default confidence
            return {
              ...entry,
              _confidence: 0.5,
              _confidence_mode: 'NORMAL' as const,
            };
          }

          // Get confidence for each entity (try CHARACTER first, fallback to generic)
          const confidences = await Promise.all(
            entityIds.map(async (entityId) => {
              try {
                // Try to get from entities table
                const { data: entity } = await supabaseAdmin
                  .from('entities')
                  .select('confidence, type')
                  .eq('id', entityId)
                  .eq('user_id', userId)
                  .single();

                if (entity) {
                  return entity.confidence || 0.5;
                }

                // Fallback: try entity confidence service
                const entityType = entity?.type === 'person' ? 'CHARACTER' : 'LOCATION';
                const confidence = await entityConfidenceService['getCurrentEntityConfidence'](
                  userId,
                  entityId,
                  entityType
                );
                return confidence || 0.5;
              } catch (error) {
                logger.debug({ error, entityId }, 'Failed to get entity confidence');
                return 0.5; // Default
              }
            })
          );

          // Calculate average confidence
          const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
          const confidenceMode = avgConfidence < 0.5 ? 'UNCERTAIN' : 'NORMAL';

          return {
            ...entry,
            _confidence: avgConfidence,
            _confidence_mode: confidenceMode,
          };
        })
      );

      // Calculate recency weight (entries from last 30 days get boost)
      const now = Date.now();
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

      const recencyWeight = (dateStr: string): number => {
        const entryDate = new Date(dateStr).getTime();
        const daysAgo = (now - entryDate) / (24 * 60 * 60 * 1000);
        if (daysAgo <= 30) return 1.2; // Recent boost
        if (daysAgo <= 90) return 1.0; // Normal
        return 0.8; // Older entries slightly downweighted
      };

      // Re-rank by: similarity * recency * confidence
      const ranked = entriesWithConfidence
        .map(entry => {
          const similarity = (entry as any).similarity || 0.5;
          const recency = recencyWeight(entry.date || entry.created_at || new Date().toISOString());
          const confidence = entry._confidence || 0.5;
          const rankScore = similarity * recency * confidence;

          return {
            ...entry,
            _rank_score: rankScore,
          };
        })
        .sort((a, b) => b._rank_score - a._rank_score)
        .slice(0, limit);

      return ranked;
    } catch (error) {
      logger.error({ error }, 'Failed to attach confidence, returning original entries');
      return entries;
    }
  }

  /**
   * Check for narrative divergence when retrieving entries
   * Surfaces multiple versions if narratives conflict
   */
  async checkNarrativeDivergence(
    userId: string,
    entries: MemoryEntry[]
  ): Promise<Array<MemoryEntry & { narrative_divergence?: { conflicting_entry_ids: string[]; note: string } }>> {
    try {
      // Group entries by entity mentions to detect conflicts
      const entryEntityMap = new Map<string, string[]>();
      
      for (const entry of entries) {
        const { data: mentions } = await supabaseAdmin
          .from('entity_mentions')
          .select('entity_id')
          .eq('memory_id', entry.id)
          .eq('user_id', userId);
        
        const entityIds = (mentions || []).map(m => m.entity_id);
        entryEntityMap.set(entry.id, entityIds);
      }

      // Check for entries mentioning same entities with conflicting descriptions
      const entriesWithDivergence = entries.map(entry => {
        const entryEntities = entryEntityMap.get(entry.id) || [];
        const conflictingEntries: string[] = [];
        
        // Find other entries mentioning same entities
        for (const otherEntry of entries) {
          if (otherEntry.id === entry.id) continue;
          
          const otherEntities = entryEntityMap.get(otherEntry.id) || [];
          const sharedEntities = entryEntities.filter(e => otherEntities.includes(e));
          
          if (sharedEntities.length > 0) {
            // Check if descriptions conflict (simple semantic check)
            // In production, this would use embeddings for better accuracy
            const contentSimilarity = this.simpleContentSimilarity(entry.content, otherEntry.content);
            
            // Low similarity + same entities = potential divergence
            if (contentSimilarity < 0.3 && sharedEntities.length > 0) {
              conflictingEntries.push(otherEntry.id);
            }
          }
        }
        
        if (conflictingEntries.length > 0) {
          return {
            ...entry,
            narrative_divergence: {
              conflicting_entry_ids: conflictingEntries,
              note: 'Earlier entries describe this differently',
            },
          };
        }
        
        return entry;
      });

      return entriesWithDivergence;
    } catch (error) {
      logger.error({ error }, 'Failed to check narrative divergence');
      return entries;
    }
  }

  /**
   * Simple content similarity check (word overlap)
   * In production, use embeddings for better accuracy
   */
  private simpleContentSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }
}

