/**
 * Candidate Retriever for Memory Recall Engine
 * 
 * Retrieves candidate entries and events based on recall intent.
 */

import { logger } from '../../logger';
import type { MemoryEntry } from '../../types';
import { embeddingService } from '../embeddingService';
import { memoryService } from '../memoryService';

import type { RecallIntent, RecallEntry, RecallEvent } from './types';


export class CandidateRetriever {
  /**
   * Retrieve candidate entries and events based on intent
   */
  async retrieveCandidates(
    userId: string,
    intent: RecallIntent
  ): Promise<{ entries: RecallEntry[]; events: RecallEvent[] }> {
    try {
      // Build semantic search query from intent
      const searchQuery = this.buildSearchQuery(intent);

      // Perform semantic search
      const memoryEntries = await memoryService.semanticSearchEntries(
        userId,
        searchQuery,
        50, // Get more candidates for ranking
        0.3 // Lower threshold for broader recall
      );

      // Convert to RecallEntry format
      let entries: RecallEntry[] = memoryEntries.map((entry) =>
        this.mapToRecallEntry(entry)
      );

      // Apply intent-specific filters
      if (intent.type === 'EMOTIONAL_SIMILARITY' && intent.emotions?.length) {
        entries = this.filterByEmotionOverlap(entries, intent.emotions);
      }

      if (intent.type === 'TEMPORAL_COMPARISON') {
        entries = this.sortByRecency(entries);
      }

      if (intent.type === 'ENTITY_LOOKUP' && intent.entities?.length) {
        entries = this.filterByEntities(entries, intent.entities);
      }

      // For now, events are empty (can be extended later)
      const events: RecallEvent[] = [];

      logger.debug(
        { userId, intentType: intent.type, entryCount: entries.length },
        'Retrieved recall candidates'
      );

      return { entries, events };
    } catch (error) {
      logger.error({ error, userId, intent }, 'Failed to retrieve recall candidates');
      return { entries: [], events: [] };
    }
  }

  /**
   * Build semantic search query from intent
   */
  private buildSearchQuery(intent: RecallIntent): string {
    const parts: string[] = [];

    if (intent.emotions?.length) {
      parts.push(...intent.emotions);
    }

    if (intent.themes?.length) {
      parts.push(...intent.themes);
    }

    if (intent.entities?.length) {
      parts.push(...intent.entities);
    }

    // If no specific parts, return a generic query
    return parts.length > 0 ? parts.join(' ') : 'past memories';
  }

  /**
   * Map MemoryEntry to RecallEntry
   */
  private mapToRecallEntry(entry: MemoryEntry): RecallEntry {
    const metadata = (entry.metadata as Record<string, unknown>) || {};
    const emotions = metadata.emotions as string[] | undefined;
    const themes = metadata.themes as string[] | undefined;
    const people = metadata.people as string[] | undefined;

    return {
      id: entry.id,
      content: entry.content,
      date: entry.date,
      emotions,
      themes,
      people,
      confidence: 0.7, // Default confidence, will be computed during ranking
      similarity_score: 0, // Will be computed during ranking
      rank_score: 0, // Will be computed during ranking
      metadata: {
        ...metadata,
        embedding: entry.embedding, // Store embedding for similarity computation
      },
    };
  }

  /**
   * Filter entries by emotion overlap
   */
  private filterByEmotionOverlap(
    entries: RecallEntry[],
    targetEmotions: string[]
  ): RecallEntry[] {
    return entries.filter((entry) => {
      if (!entry.emotions?.length) return false;

      const entryEmotionsLower = entry.emotions.map((e) => e.toLowerCase());
      const targetEmotionsLower = targetEmotions.map((e) => e.toLowerCase());

      return targetEmotionsLower.some((emotion) =>
        entryEmotionsLower.some((e) => e.includes(emotion) || emotion.includes(e))
      );
    });
  }

  /**
   * Sort entries by recency (most recent first)
   */
  private sortByRecency(entries: RecallEntry[]): RecallEntry[] {
    return [...entries].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });
  }

  /**
   * Filter entries by entity mentions
   */
  private filterByEntities(
    entries: RecallEntry[],
    entities: string[]
  ): RecallEntry[] {
    return entries.filter((entry) => {
      const contentLower = entry.content.toLowerCase();
      const peopleLower = entry.people?.map((p) => p.toLowerCase()) ?? [];

      return entities.some((entity) => {
        const entityLower = entity.toLowerCase();
        return (
          contentLower.includes(entityLower) ||
          peopleLower.some((p) => p.includes(entityLower) || entityLower.includes(p))
        );
      });
    });
  }
}

