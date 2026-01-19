/**
 * Timeline Page Service
 * Transforms data for the multi-lane timeline visualization
 */

import { logger } from '../logger';
import type { MemoryEntry } from '../types';
import type { TimelineLayer } from '../types/timeline';

import { memoryService } from './memoryService';
import { supabaseAdmin } from './supabaseClient';
import { timelineManager } from './timelineManager';

export type TimelineEntry = {
  id: string;
  timestamp: string;
  title: string;
  summary: string;
  full_text: string;
  mood: string | null;
  arc: string | null;
  saga: string | null;
  era: string | null;
  lane: string;
  tags: string[];
  character_ids: string[];
  related_entry_ids: string[];
};

export type TimelineBand = {
  id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  color: string;
  type: 'era' | 'saga' | 'arc';
};

type TimelineFilters = {
  era?: string[];
  saga?: string[];
  arc?: string[];
  lane?: string[];
  mood?: string[];
  search?: string;
};

class TimelinePageService {
  /**
   * Derive lane from entry tags/metadata
   */
  private deriveLane(entry: MemoryEntry): string {
    // Priority 1: metadata.lane
    if (entry.metadata?.lane && typeof entry.metadata.lane === 'string') {
      return entry.metadata.lane;
    }

    // Priority 2: Check tags for lane keywords
    const laneKeywords: Record<string, string> = {
      work: 'work',
      mma: 'mma',
      robotics: 'robotics',
      creative: 'creative',
      life: 'life'
    };

    const tagLower = entry.tags.map(t => t.toLowerCase());
    for (const [keyword, lane] of Object.entries(laneKeywords)) {
      if (tagLower.some(t => t.includes(keyword))) {
        return lane;
      }
    }

    // Priority 3: metadata.category
    if (entry.metadata?.category && typeof entry.metadata.category === 'string') {
      const category = entry.metadata.category.toLowerCase();
      if (laneKeywords[category]) {
        return laneKeywords[category];
      }
    }

    // Fallback: "life"
    return 'life';
  }

  /**
   * Extract character IDs from entry metadata
   */
  private extractCharacterIds(entry: MemoryEntry): string[] {
    const characterIds: string[] = [];
    
    if (entry.metadata?.relationships && Array.isArray(entry.metadata.relationships)) {
      entry.metadata.relationships.forEach((rel: any) => {
        if (rel.character_id) {
          characterIds.push(rel.character_id);
        } else if (rel.id) {
          characterIds.push(rel.id);
        }
      });
    }

    if (entry.metadata?.character_ids && Array.isArray(entry.metadata.character_ids)) {
      entry.metadata.character_ids.forEach((id: string) => {
        if (!characterIds.includes(id)) {
          characterIds.push(id);
        }
      });
    }

    return characterIds;
  }

  /**
   * Find hierarchy (era/saga/arc) for an entry
   */
  private async findHierarchyForEntry(
    userId: string,
    entry: MemoryEntry
  ): Promise<{ era: string | null; saga: string | null; arc: string | null }> {
    let era: string | null = null;
    let saga: string | null = null;
    let arc: string | null = null;

    try {
      // Check if entry has hierarchy IDs in metadata
      if (entry.metadata?.era_id) {
        era = entry.metadata.era_id as string;
      }
      if (entry.metadata?.saga_id) {
        saga = entry.metadata.saga_id as string;
      }
      if (entry.metadata?.arc_id) {
        arc = entry.metadata.arc_id as string;
      }

      // If not in metadata, try to find by date range
      if (!era && !saga && !arc) {
        const entryDate = new Date(entry.date);

        // Search eras
        const eras = await timelineManager.search(userId, {
          layer_type: ['era'],
          date_from: entry.date,
          date_to: entry.date
        });
        if (eras.length > 0) {
          era = eras[0].id;
        }

        // Search sagas
        const sagas = await timelineManager.search(userId, {
          layer_type: ['saga'],
          date_from: entry.date,
          date_to: entry.date
        });
        if (sagas.length > 0) {
          saga = sagas[0].id;
        }

        // Search arcs
        const arcs = await timelineManager.search(userId, {
          layer_type: ['arc'],
          date_from: entry.date,
          date_to: entry.date
        });
        if (arcs.length > 0) {
          arc = arcs[0].id;
        }
      }
    } catch (error) {
      logger.warn({ error, entryId: entry.id }, 'Failed to find hierarchy for entry');
    }

    return { era, saga, arc };
  }

  /**
   * Get timeline entries transformed for visualization
   */
  async getTimelineEntries(userId: string, filters?: TimelineFilters): Promise<TimelineEntry[]> {
    try {
      // Fetch entries with filters
      const entries = await memoryService.searchEntries(userId, {
        search: filters?.search,
        tag: filters?.lane?.[0], // Simple tag filter for now
        limit: 1000 // Get a large set for timeline
      });

      if (!entries || !Array.isArray(entries)) {
        logger.warn({ userId }, 'MemoryService returned invalid entries data');
        return [];
      }

      // Transform entries
      const transformedEntries: TimelineEntry[] = [];

      for (const entry of entries) {
        try {
          const hierarchy = await this.findHierarchyForEntry(userId, entry);
          const lane = this.deriveLane(entry);
          const characterIds = this.extractCharacterIds(entry);
          
          // Extract related entry IDs
          const relatedEntryIds: string[] = [];
          if (entry.metadata?.related_entries && Array.isArray(entry.metadata.related_entries)) {
            relatedEntryIds.push(...entry.metadata.related_entries);
          }
          if (entry.metadata?.related_entry_ids && Array.isArray(entry.metadata.related_entry_ids)) {
            relatedEntryIds.push(...entry.metadata.related_entry_ids);
          }

          // Apply filters
          if (filters?.era && filters.era.length > 0 && hierarchy.era && !filters.era.includes(hierarchy.era)) {
            continue;
          }
          if (filters?.saga && filters.saga.length > 0 && hierarchy.saga && !filters.saga.includes(hierarchy.saga)) {
            continue;
          }
          if (filters?.arc && filters.arc.length > 0 && hierarchy.arc && !filters.arc.includes(hierarchy.arc)) {
            continue;
          }
          if (filters?.lane && filters.lane.length > 0 && !filters.lane.includes(lane)) {
            continue;
          }
          if (filters?.mood && filters.mood.length > 0 && entry.mood && !filters.mood.includes(entry.mood)) {
            continue;
          }

          transformedEntries.push({
            id: entry.id,
            timestamp: entry.date || new Date().toISOString(),
            title: entry.summary || (entry.content ? entry.content.substring(0, 60) + (entry.content.length > 60 ? '...' : '') : 'Untitled Entry'),
            summary: entry.summary || (entry.content ? entry.content.substring(0, 200) : ''),
            full_text: entry.content || '',
            mood: entry.mood || null,
            arc: hierarchy.arc,
            saga: hierarchy.saga,
            era: hierarchy.era,
            lane,
            tags: entry.tags || [],
            character_ids: characterIds,
            related_entry_ids: relatedEntryIds
          });
        } catch (entryError) {
          logger.warn({ error: entryError, entryId: entry.id }, 'Failed to transform entry, skipping');
          continue;
        }
      }

      return transformedEntries;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get timeline entries');
      // Return empty array instead of throwing to prevent 500 errors
      return [];
    }
  }

  /**
   * Get timeline eras
   */
  async getTimelineEras(userId: string): Promise<TimelineBand[]> {
    try {
      const eras = await timelineManager.search(userId, {
        layer_type: ['era']
      });

      if (!eras || !Array.isArray(eras)) {
        logger.warn({ userId }, 'TimelineManager returned invalid eras data');
        return [];
      }

      return eras.map(era => ({
        id: era.id,
        name: era.title || 'Untitled Era',
        start_date: era.start_date || new Date().toISOString(),
        end_date: era.end_date || null,
        color: '#4a148c', // deep violet
        type: 'era' as const
      }));
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get timeline eras');
      return [];
    }
  }

  /**
   * Get timeline sagas
   */
  async getTimelineSagas(userId: string): Promise<TimelineBand[]> {
    try {
      const sagas = await timelineManager.search(userId, {
        layer_type: ['saga']
      });

      if (!sagas || !Array.isArray(sagas)) {
        logger.warn({ userId }, 'TimelineManager returned invalid sagas data');
        return [];
      }

      return sagas.map(saga => ({
        id: saga.id,
        name: saga.title || 'Untitled Saga',
        start_date: saga.start_date || new Date().toISOString(),
        end_date: saga.end_date || null,
        color: '#b71c1c', // crimson
        type: 'saga' as const
      }));
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get timeline sagas');
      return [];
    }
  }

  /**
   * Get timeline arcs
   */
  async getTimelineArcs(userId: string): Promise<TimelineBand[]> {
    try {
      const arcs = await timelineManager.search(userId, {
        layer_type: ['arc']
      });

      if (!arcs || !Array.isArray(arcs)) {
        logger.warn({ userId }, 'TimelineManager returned invalid arcs data');
        return [];
      }

      return arcs.map(arc => ({
        id: arc.id,
        name: arc.title || 'Untitled Arc',
        start_date: arc.start_date || new Date().toISOString(),
        end_date: arc.end_date || null,
        color: '#1e88e5', // electric blue
        type: 'arc' as const
      }));
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get timeline arcs');
      return [];
    }
  }

  /**
   * Score entry for highlight significance using AI
   * Returns score 0-1 based on emotional weight, narrative importance, and connections
   */
  async scoreHighlightSignificance(entry: MemoryEntry, useAI: boolean = false): Promise<number> {
    // If AI scoring is requested and OpenAI is available
    if (useAI) {
      try {
        const { default: OpenAI } = await import('openai');
        const { config } = await import('../config');
        const openai = new OpenAI({ apiKey: config.openAiKey });

        const completion = await openai.chat.completions.create({
          model: config.defaultModel,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: 'Score this journal entry for narrative significance (0-1). Consider: emotional weight, turning points, character interactions, life changes, achievements, failures, breakthroughs. Return JSON: { score: number, reasoning: string }'
            },
            {
              role: 'user',
              content: `Entry:\nDate: ${entry.date}\nMood: ${entry.mood || 'none'}\nTags: ${entry.tags.join(', ') || 'none'}\nContent: ${entry.content.substring(0, 500)}\n${entry.summary ? `Summary: ${entry.summary}` : ''}`
            }
          ]
        });

        const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
        return Math.max(0, Math.min(1, result.score || 0));
      } catch (error) {
        logger.warn({ error }, 'AI highlight scoring failed, falling back to heuristic');
      }
    }

    // Fallback to heuristic scoring
    let score = 0;

    // Emotional intensity (0-0.4)
    const emotionalWeights: Record<string, number> = {
      excited: 0.4,
      anxious: 0.35,
      angry: 0.35,
      happy: 0.3,
      sad: 0.25,
      calm: 0.15
    };
    if (entry.mood) {
      score += emotionalWeights[entry.mood.toLowerCase()] || 0.1;
    }

    // Related entries count (0-0.3)
    const relatedCount = (entry.metadata?.related_entries as string[] | undefined)?.length || 
                        (entry.metadata?.related_entry_ids as string[] | undefined)?.length || 0;
    score += Math.min(0.3, relatedCount * 0.05);

    // Character involvement (0-0.2)
    const characterIds = this.extractCharacterIds(entry);
    score += Math.min(0.2, characterIds.length * 0.05);

    // Content length and richness (0-0.1)
    if (entry.content.length > 500) score += 0.05;
    if (entry.summary) score += 0.05;

    return Math.min(1, score);
  }

  /**
   * Batch score entries for highlights
   */
  async scoreHighlights(userId: string, entryIds?: string[], useAI: boolean = false): Promise<Record<string, number>> {
    try {
      const entries = entryIds 
        ? await Promise.all(entryIds.map(id => memoryService.getEntry(userId, id)))
        : await memoryService.searchEntries(userId, { limit: 1000 });

      const scores: Record<string, number> = {};
      
      for (const entry of entries) {
        if (entry) {
          const score = await this.scoreHighlightSignificance(entry, useAI);
          scores[entry.id] = score;
          
          // Optionally save score to metadata
          if (entry.metadata) {
            entry.metadata.highlight_score = score;
          }
        }
      }

      return scores;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to score highlights');
      return {};
    }
  }

  /**
   * Get emotion intensity data grouped by time periods
   */
  async getEmotionIntensity(userId: string, groupBy: 'day' | 'week' | 'month' = 'week'): Promise<Array<{
    period: string;
    mood: string;
    intensity: number;
    count: number;
  }>> {
    try {
      const entries = await memoryService.searchEntries(userId, { limit: 5000 });
      
      const moodIntensity: Record<string, number> = {
        excited: 0.9,
        anxious: 0.8,
        angry: 0.85,
        happy: 0.7,
        sad: 0.6,
        calm: 0.4
      };

      const grouped: Record<string, Record<string, { intensity: number; count: number }>> = {};

      entries.forEach(entry => {
        if (!entry.mood) return;

        const date = new Date(entry.date);
        let period: string;
        
        if (groupBy === 'day') {
          period = date.toISOString().split('T')[0];
        } else if (groupBy === 'week') {
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          period = weekStart.toISOString().split('T')[0];
        } else {
          period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }

        const mood = entry.mood.toLowerCase();
        if (!grouped[period]) {
          grouped[period] = {};
        }
        if (!grouped[period][mood]) {
          grouped[period][mood] = { intensity: 0, count: 0 };
        }

        grouped[period][mood].intensity += moodIntensity[mood] || 0.5;
        grouped[period][mood].count += 1;
      });

      const result: Array<{ period: string; mood: string; intensity: number; count: number }> = [];
      
      Object.entries(grouped).forEach(([period, moods]) => {
        Object.entries(moods).forEach(([mood, data]) => {
          result.push({
            period,
            mood,
            intensity: data.intensity / data.count, // Average intensity
            count: data.count
          });
        });
      });

      return result.sort((a, b) => a.period.localeCompare(b.period));
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get emotion intensity');
      return [];
    }
  }
}

export const timelinePageService = new TimelinePageService();

