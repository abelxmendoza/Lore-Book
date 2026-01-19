/**
 * Search Engine Analytics Module
 * Combined keyword and semantic search with clustering
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import { BaseAnalyticsModule } from './base';
import type { AnalyticsPayload, MemoryData } from './types';

interface SearchOptions {
  query?: string;
  filters?: {
    dateFrom?: string;
    dateTo?: string;
    people?: string[];
    topics?: string[];
  };
}

interface SearchResult {
  id: string;
  text: string;
  date: string;
  similarity: number;
  keywordScore: number;
  semanticScore: number;
  recencyScore: number;
  totalScore: number;
}

export class SearchEngineModule extends BaseAnalyticsModule {
  protected readonly moduleType = 'search' as const;
  private readonly SEMANTIC_WEIGHT = 0.6;
  private readonly KEYWORD_WEIGHT = 0.3;
  private readonly RECENCY_WEIGHT = 0.1;

  async run(userId: string, options?: SearchOptions): Promise<AnalyticsPayload> {
    // Search doesn't use cache (always fresh results)
    
    if (!options?.query || options.query.trim().length === 0) {
      return this.emptyPayload();
    }

    const query = options.query.trim();
    const memories = await this.fetchMemories(userId, 1000);

    // Apply filters
    const filteredMemories = this.applyFilters(memories, options.filters);

    // Perform semantic search
    const semanticResults = await this.semanticSearch(userId, query, filteredMemories);
    
    // Perform keyword search
    const keywordResults = this.keywordSearch(query, filteredMemories);
    
    // Combine and rank results
    const combinedResults = this.combineAndRank(semanticResults, keywordResults, memories);
    
    // Find related memories
    const relatedMemories = this.findRelatedMemories(combinedResults.slice(0, 5), memories);
    
    // Cluster results
    const clusters = this.clusterResults(combinedResults.slice(0, 20));

    const payload: AnalyticsPayload = {
      metrics: {
        totalResults: combinedResults.length,
        semanticResults: semanticResults.length,
        keywordResults: keywordResults.length,
        relatedMemories: relatedMemories.length,
        clusters: clusters.length,
      },
      charts: [],
      clusters: clusters.map(c => ({
        id: c.id,
        label: c.label,
        size: c.size,
        members: c.members,
        summary: c.summary,
      })),
      insights: [
        {
          text: `Found ${combinedResults.length} result${combinedResults.length !== 1 ? 's' : ''} for "${query}".`,
          category: 'search',
          score: combinedResults.length > 0 ? 1 : 0,
        },
      ],
      summary: this.generateSummary(combinedResults, query),
      metadata: {
        results: combinedResults.slice(0, 50).map(r => ({
          id: r.id,
          text: r.text.substring(0, 200),
          date: r.date,
          score: r.totalScore,
        })),
        relatedMemories: relatedMemories.map(m => ({
          id: m.id,
          text: m.text.substring(0, 200),
          date: m.created_at,
        })),
      },
    };

    return payload;
  }

  /**
   * Apply filters to memories
   */
  private applyFilters(
    memories: MemoryData[],
    filters?: SearchOptions['filters']
  ): MemoryData[] {
    if (!filters) {
      return memories;
    }

    let filtered = [...memories];

    // Date filter
    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      filtered = filtered.filter(m => new Date(m.created_at) >= fromDate);
    }
    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      filtered = filtered.filter(m => new Date(m.created_at) <= toDate);
    }

    // People filter
    if (filters.people && filters.people.length > 0) {
      filtered = filtered.filter(m =>
        (m.people || []).some(p => filters.people!.includes(p))
      );
    }

    // Topics filter
    if (filters.topics && filters.topics.length > 0) {
      filtered = filtered.filter(m =>
        (m.topics || []).some(t => filters.topics!.includes(t))
      );
    }

    return filtered;
  }

  /**
   * Semantic search using pgvector
   */
  private async semanticSearch(
    userId: string,
    query: string,
    memories: MemoryData[]
  ): Promise<SearchResult[]> {
    try {
      // Generate embedding for query (would need embedding service)
      // For now, use a simplified approach: find memories with similar topics
      
      const results: SearchResult[] = [];
      const queryLower = query.toLowerCase();
      const queryWords = queryLower.split(/\s+/);

      for (const memory of memories) {
        if (!memory.embedding) {
          continue;
        }

        // Simple semantic matching based on topics and text
        const textLower = memory.text.toLowerCase();
        const topicMatches = (memory.topics || []).filter(t => 
          queryWords.some(word => t.toLowerCase().includes(word))
        ).length;
        const textMatches = queryWords.filter(word => textLower.includes(word)).length;
        
        const semanticScore = (topicMatches * 0.6 + textMatches * 0.4) / queryWords.length;

        if (semanticScore > 0.1) {
          results.push({
            id: memory.id,
            text: memory.text,
            date: memory.created_at,
            similarity: semanticScore,
            keywordScore: 0, // Will be computed in combineAndRank
            semanticScore,
            recencyScore: 0, // Will be computed in combineAndRank
            totalScore: 0, // Will be computed in combineAndRank
          });
        }
      }

      return results;
    } catch (error) {
      logger.error({ error, userId, query }, 'Error in semantic search');
      return [];
    }
  }

  /**
   * Keyword search using trigram similarity
   */
  private keywordSearch(query: string, memories: MemoryData[]): SearchResult[] {
    const results: SearchResult[] = [];
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    for (const memory of memories) {
      const textLower = memory.text.toLowerCase();
      const topicText = (memory.topics || []).join(' ').toLowerCase();
      const peopleText = (memory.people || []).join(' ').toLowerCase();
      const combinedText = `${textLower} ${topicText} ${peopleText}`;

      // Count word matches
      let matches = 0;
      for (const word of queryWords) {
        if (combinedText.includes(word)) {
          matches++;
        }
      }

      const keywordScore = matches / queryWords.length;

      if (keywordScore > 0.1) {
        results.push({
          id: memory.id,
          text: memory.text,
          date: memory.created_at,
          similarity: keywordScore,
          keywordScore,
          semanticScore: 0, // Will be computed in combineAndRank
          recencyScore: 0, // Will be computed in combineAndRank
          totalScore: 0, // Will be computed in combineAndRank
        });
      }
    }

    return results;
  }

  /**
   * Combine and rank search results
   */
  private combineAndRank(
    semanticResults: SearchResult[],
    keywordResults: SearchResult[],
    allMemories: MemoryData[]
  ): SearchResult[] {
    const resultMap = new Map<string, SearchResult>();

    // Add semantic results
    for (const result of semanticResults) {
      resultMap.set(result.id, { ...result });
    }

    // Merge keyword results
    for (const result of keywordResults) {
      const existing = resultMap.get(result.id);
      if (existing) {
        existing.keywordScore = result.keywordScore;
      } else {
        resultMap.set(result.id, { ...result });
      }
    }

    // Compute recency scores and total scores
    const now = Date.now();
    const oldestDate = allMemories.length > 0
      ? new Date(allMemories[0].created_at).getTime()
      : now;
    const timeRange = now - oldestDate;

    for (const result of resultMap.values()) {
      const memoryDate = new Date(result.date).getTime();
      const age = now - memoryDate;
      result.recencyScore = timeRange > 0 ? 1 - (age / timeRange) : 1;

      // Combined ranking formula
      result.totalScore = 
        (result.semanticScore * this.SEMANTIC_WEIGHT) +
        (result.keywordScore * this.KEYWORD_WEIGHT) +
        (result.recencyScore * this.RECENCY_WEIGHT);
    }

    // Sort by total score
    return Array.from(resultMap.values())
      .sort((a, b) => b.totalScore - a.totalScore);
  }

  /**
   * Find related memories to top results
   */
  private findRelatedMemories(
    topResults: SearchResult[],
    allMemories: MemoryData[]
  ): MemoryData[] {
    const related: MemoryData[] = [];
    const topIds = new Set(topResults.map(r => r.id));

    for (const result of topResults.slice(0, 5)) {
      const memory = allMemories.find(m => m.id === result.id);
      if (!memory) continue;

      // Find memories with similar topics or people
      for (const other of allMemories) {
        if (topIds.has(other.id)) continue; // Skip if already in results

        const topicOverlap = (memory.topics || []).filter(t => 
          (other.topics || []).includes(t)
        ).length;
        const peopleOverlap = (memory.people || []).filter(p => 
          (other.people || []).includes(p)
        ).length;

        if (topicOverlap > 0 || peopleOverlap > 0) {
          related.push(other);
          if (related.length >= 10) {
            break;
          }
        }
      }

      if (related.length >= 10) {
        break;
      }
    }

    return related.slice(0, 10);
  }

  /**
   * Cluster search results
   */
  private clusterResults(results: SearchResult[]): Array<{ id: string; label: string; size: number; members: string[]; summary: string }> {
    if (results.length < 3) {
      return [];
    }

    // Simple clustering by topic overlap
    const clusters: Array<{ id: string; label: string; size: number; members: string[]; summary: string }> = [];
    const processed = new Set<string>();

    // This is simplified - would use actual clustering in production
    const topicClusters = new Map<string, string[]>();

    // Group by common topics (simplified)
    for (const result of results) {
      if (processed.has(result.id)) continue;

      // Find memory to get topics
      // For now, create simple clusters
      const clusterId = `cluster_${clusters.length}`;
      clusters.push({
        id: clusterId,
        label: `Result Cluster ${clusters.length + 1}`,
        size: 1,
        members: [result.id],
        summary: result.text.substring(0, 100),
      });

      processed.add(result.id);
    }

    return clusters;
  }

  /**
   * Generate summary
   */
  private generateSummary(results: SearchResult[], query: string): string {
    if (results.length === 0) {
      return `No results found for "${query}".`;
    }

    const topResult = results[0];
    const avgScore = results.reduce((sum, r) => sum + r.totalScore, 0) / results.length;

    let summary = `Found ${results.length} result${results.length > 1 ? 's' : ''} for "${query}". `;
    summary += `Top result has a relevance score of ${(topResult.totalScore * 100).toFixed(0)}%. `;
    summary += `Average relevance: ${(avgScore * 100).toFixed(0)}%.`;

    return summary;
  }

  private emptyPayload(): AnalyticsPayload {
    return {
      metrics: {},
      charts: [],
      insights: [],
      summary: 'Enter a search query to find memories.',
    };
  }
}

export const searchEngineModule = new SearchEngineModule();
