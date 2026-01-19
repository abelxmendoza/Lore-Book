import { logger } from '../../logger';
import type { MemoryEntry } from '../../types';
import { memoryService } from '../memoryService';
import { supabaseAdmin } from '../supabaseClient';

import { timelineService, type Timeline } from './timelineService';

export type SearchMode = 'natural' | 'faceted' | 'semantic';

export interface SearchFilters {
  timeline_type?: string[];
  era?: string[];
  skill?: string[];
  job?: string[];
  location?: string[];
  emotion?: string[];
  year_from?: number;
  year_to?: number;
  tags?: string[];
}

export interface SearchResult {
  timeline: Timeline;
  memories: MemoryEntry[];
  relevance_score?: number;
}

export interface TimelineSearchResult {
  results: SearchResult[];
  total_count: number;
  search_mode: SearchMode;
}

export class TimelineSearchService {
  /**
   * Search timelines with multiple modes
   */
  async searchTimelines(
    userId: string,
    query: string,
    mode: SearchMode = 'natural',
    filters?: SearchFilters
  ): Promise<TimelineSearchResult> {
    try {
      switch (mode) {
        case 'natural':
          return this.naturalLanguageSearch(userId, query, filters);
        case 'faceted':
          return this.facetedSearch(userId, query, filters);
        case 'semantic':
          return this.semanticSearch(userId, query, filters);
        default:
          return this.naturalLanguageSearch(userId, query, filters);
      }
    } catch (error) {
      logger.error({ error, userId, query, mode }, 'Error in searchTimelines');
      throw error;
    }
  }

  /**
   * Natural language search - parse queries like "College timeline", "When I was studying solar"
   */
  private async naturalLanguageSearch(
    userId: string,
    query: string,
    filters?: SearchFilters
  ): Promise<TimelineSearchResult> {
    const lowerQuery = query.toLowerCase();

    // Extract timeline type hints
    let timelineType: string | undefined;
    if (lowerQuery.includes('era') || lowerQuery.includes('period')) {
      timelineType = 'life_era';
    } else if (lowerQuery.includes('skill') || lowerQuery.includes('learn')) {
      timelineType = 'skill';
    } else if (lowerQuery.includes('job') || lowerQuery.includes('work') || lowerQuery.includes('career')) {
      timelineType = 'work';
    } else if (lowerQuery.includes('location') || lowerQuery.includes('place') || lowerQuery.includes('lived')) {
      timelineType = 'location';
    }

    // Extract time hints
    let yearFrom: number | undefined;
    let yearTo: number | undefined;
    const yearMatch = query.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      const year = parseInt(yearMatch[0]);
      yearFrom = year;
      yearTo = year + 1;
    }

    // Build search filters
    const searchFilters: SearchFilters = {
      ...filters,
      ...(timelineType && { timeline_type: [timelineType] }),
      ...(yearFrom && { year_from: yearFrom }),
      ...(yearTo && { year_to: yearTo })
    };

    // Search timeline titles and descriptions
    const timelines = await timelineService.listTimelines(userId, {
      search: query,
      timeline_type: timelineType as any
    });

    // Get memories for each timeline
    const results: SearchResult[] = await Promise.all(
      timelines.map(async (timeline) => {
        const memories = await this.getMemoriesForTimeline(userId, timeline.id, filters);
        return {
          timeline,
          memories,
          relevance_score: this.calculateRelevanceScore(timeline, query)
        };
      })
    );

    // Sort by relevance
    results.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));

    return {
      results,
      total_count: results.length,
      search_mode: 'natural'
    };
  }

  /**
   * Faceted search - filter by era, skill, job, location, emotion, year range
   */
  private async facetedSearch(
    userId: string,
    query: string,
    filters?: SearchFilters
  ): Promise<TimelineSearchResult> {
    try {
      // Build timeline query with filters
      let timelineQuery = supabaseAdmin
        .from('timelines')
        .select('*')
        .eq('user_id', userId);

      // Apply timeline type filters
      if (filters?.timeline_type && filters.timeline_type.length > 0) {
        timelineQuery = timelineQuery.in('timeline_type', filters.timeline_type);
      }

      // Apply year range filters
      if (filters?.year_from) {
        timelineQuery = timelineQuery.gte('start_date', `${filters.year_from}-01-01`);
      }
      if (filters?.year_to) {
        timelineQuery = timelineQuery.lte('start_date', `${filters.year_to}-12-31`);
      }

      // Apply text search if provided
      if (query) {
        timelineQuery = timelineQuery.or(`title.ilike.%${query}%,description.ilike.%${query}%`);
      }

      const { data: timelines, error } = await timelineQuery.order('start_date', { ascending: true });

      if (error) {
        logger.error({ error }, 'Failed to search timelines');
        throw error;
      }

      // Get memories for each timeline with additional filters
      const results: SearchResult[] = await Promise.all(
        (timelines || []).map(async (timeline: any) => {
          const memories = await this.getMemoriesForTimeline(userId, timeline.id, filters);
          return {
            timeline: {
              id: timeline.id,
              user_id: timeline.user_id,
              title: timeline.title,
              description: timeline.description,
              timeline_type: timeline.timeline_type,
              parent_id: timeline.parent_id,
              start_date: timeline.start_date,
              end_date: timeline.end_date,
              tags: timeline.tags || [],
              metadata: timeline.metadata || {},
              created_at: timeline.created_at,
              updated_at: timeline.updated_at
            },
            memories: memories.map(m => ({
              id: m.id,
              content: m.content,
              date: m.date,
              tags: m.tags || [],
              mood: m.mood || null
            }))
          };
        })
      );

      return {
        results,
        total_count: results.length,
        search_mode: 'faceted'
      };
    } catch (error) {
      logger.error({ error }, 'Error in facetedSearch');
      throw error;
    }
  }

  /**
   * Semantic search - embeddings-based search for "Periods of burnout", "Times I felt driven"
   */
  private async semanticSearch(
    userId: string,
    query: string,
    filters?: SearchFilters
  ): Promise<TimelineSearchResult> {
    try {
      // First, get all timelines (or filtered)
      const timelineFilters: any = {};
      if (filters?.timeline_type && filters.timeline_type.length > 0) {
        timelineFilters.timeline_type = filters.timeline_type[0];
      }
      const timelines = await timelineService.listTimelines(userId, timelineFilters);

      // Get memories with semantic search
      const memoryResults = await memoryService.searchEntries(userId, {
        semantic: true,
        search: query,
        limit: 100
      });

      // Group memories by timeline
      const timelineMemoryMap = new Map<string, MemoryEntry[]>();

      for (const memory of memoryResults) {
        // Get timelines for this memory
        const { data: memberships } = await supabaseAdmin
          .from('timeline_memberships')
          .select('timeline_id')
          .eq('user_id', userId)
          .eq('journal_entry_id', memory.id);

        (memberships || []).forEach((m: any) => {
          if (!timelineMemoryMap.has(m.timeline_id)) {
            timelineMemoryMap.set(m.timeline_id, []);
          }
          timelineMemoryMap.get(m.timeline_id)!.push(memory);
        });
      }

      // Build results
      const results: SearchResult[] = timelines
        .filter(t => timelineMemoryMap.has(t.id))
        .map(timeline => ({
          timeline,
          memories: (timelineMemoryMap.get(timeline.id) || []).map(m => ({
            id: m.id,
            content: m.content,
            date: m.date,
            tags: m.tags || [],
            mood: m.mood || null
          })),
          relevance_score: timelineMemoryMap.get(timeline.id)?.length || 0
        }))
        .sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));

      return {
        results,
        total_count: results.length,
        search_mode: 'semantic'
      };
    } catch (error) {
      logger.error({ error }, 'Error in semanticSearch');
      throw error;
    }
  }

  /**
   * Get memories for a timeline with filters
   */
  private async getMemoriesForTimeline(
    userId: string,
    timelineId: string,
    filters?: SearchFilters
  ): Promise<MemoryEntry[]> {
    try {
      // Get membership IDs
      const { data: memberships } = await supabaseAdmin
        .from('timeline_memberships')
        .select('journal_entry_id')
        .eq('user_id', userId)
        .eq('timeline_id', timelineId);

      if (!memberships || memberships.length === 0) {
        return [];
      }

      const entryIds = memberships.map((m: any) => m.journal_entry_id);

      // Build memory query
      let memoryQuery = supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .in('id', entryIds);

      // Apply emotion filter
      if (filters?.emotion && filters.emotion.length > 0) {
        memoryQuery = memoryQuery.in('mood', filters.emotion);
      }

      // Apply tag filter
      if (filters?.tags && filters.tags.length > 0) {
        memoryQuery = memoryQuery.overlaps('tags', filters.tags);
      }

      // Apply year range
      if (filters?.year_from) {
        memoryQuery = memoryQuery.gte('date', `${filters.year_from}-01-01`);
      }
      if (filters?.year_to) {
        memoryQuery = memoryQuery.lte('date', `${filters.year_to}-12-31`);
      }

      const { data: memories, error } = await memoryQuery.order('date', { ascending: false });

      if (error) {
        logger.error({ error }, 'Failed to get memories for timeline');
        return [];
      }

      return (memories || []) as MemoryEntry[];
    } catch (error) {
      logger.error({ error }, 'Error getting memories for timeline');
      return [];
    }
  }

  /**
   * Calculate relevance score for natural language search
   */
  private calculateRelevanceScore(timeline: Timeline, query: string): number {
    let score = 0;
    const lowerQuery = query.toLowerCase();
    const lowerTitle = timeline.title.toLowerCase();
    const lowerDescription = (timeline.description || '').toLowerCase();

    // Title match (highest weight)
    if (lowerTitle.includes(lowerQuery)) {
      score += 10;
    }

    // Description match
    if (lowerDescription.includes(lowerQuery)) {
      score += 5;
    }

    // Tag match
    timeline.tags.forEach(tag => {
      if (tag.toLowerCase().includes(lowerQuery)) {
        score += 3;
      }
    });

    return score;
  }
}

export const timelineSearchService = new TimelineSearchService();
