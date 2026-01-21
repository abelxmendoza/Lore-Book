import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

/**
 * BM25 Keyword Search Service
 * Implements BM25 ranking for keyword-based retrieval
 */
export class BM25Search {
  /**
   * Simple BM25 implementation for keyword search
   * Uses PostgreSQL full-text search as base, then applies BM25-like scoring
   */
  async search(
    userId: string,
    query: string,
    limit: number = 20
  ): Promise<Array<{ id: string; score: number; content: string }>> {
    try {
      // Tokenize query
      const queryTerms = this.tokenize(query);
      if (queryTerms.length === 0) {
        return [];
      }

      // Use PostgreSQL full-text search with ranking
      const searchQuery = queryTerms.join(' & ');
      
      const { data, error } = await supabaseAdmin
        .from('journal_entries')
        .select('id, content, summary, tags, created_at')
        .eq('user_id', userId)
        .textSearch('content', searchQuery, {
          type: 'websearch',
          config: 'english'
        })
        .limit(limit * 2); // Get more for re-ranking

      if (error) {
        logger.warn({ error }, 'Full-text search failed, falling back to ILIKE');
        // Fallback to ILIKE search
        return this.fallbackKeywordSearch(userId, query, limit);
      }

      // Apply BM25-like scoring
      const scored = await this.scoreBM25(
        data || [],
        queryTerms,
        userId
      );

      // Sort by score and return top results
      return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(item => ({
          id: item.id,
          score: item.score,
          content: item.content || item.summary || ''
        }));
    } catch (error) {
      logger.error({ error, query }, 'BM25 search failed');
      return this.fallbackKeywordSearch(userId, query, limit);
    }
  }

  /**
   * Tokenize query into terms
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 2) // Filter out very short terms
      .filter(term => !this.isStopWord(term));
  }

  /**
   * Check if term is a stop word
   */
  private isStopWord(term: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that',
      'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what',
      'which', 'who', 'when', 'where', 'why', 'how'
    ]);
    return stopWords.has(term);
  }

  /**
   * Calculate BM25 score for documents
   */
  private async scoreBM25(
    documents: Array<{ id: string; content?: string; summary?: string; tags?: string[] }>,
    queryTerms: string[],
    userId: string
  ): Promise<Array<{ id: string; score: number; content?: string; summary?: string }>> {
    // Get document frequencies (DF) for terms
    const dfMap = await this.getDocumentFrequencies(userId, queryTerms);
    
    // Get total document count
    const { count: totalDocs } = await supabaseAdmin
      .from('journal_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    
    const N = totalDocs || 1;
    const k1 = 1.5; // BM25 parameter
    const b = 0.75; // BM25 parameter
    const avgDocLength = 500; // Approximate average document length

    return documents.map(doc => {
      const text = (doc.content || doc.summary || '').toLowerCase();
      const docTerms = this.tokenize(text);
      const docLength = docTerms.length;
      
      // Calculate term frequencies
      const tfMap = new Map<string, number>();
      docTerms.forEach(term => {
        tfMap.set(term, (tfMap.get(term) || 0) + 1);
      });

      // Calculate BM25 score
      let score = 0;
      queryTerms.forEach(term => {
        const tf = tfMap.get(term) || 0;
        const df = dfMap.get(term) || 1;
        
        // IDF (Inverse Document Frequency)
        const idf = Math.log((N - df + 0.5) / (df + 0.5));
        
        // BM25 term score
        const numerator = tf * (k1 + 1);
        const denominator = tf + k1 * (1 - b + b * (docLength / avgDocLength));
        const termScore = idf * (numerator / denominator);
        
        score += termScore;
      });

      // Boost for tags match
      if (doc.tags && doc.tags.length > 0) {
        const tagMatches = queryTerms.filter(term => 
          doc.tags!.some(tag => tag.toLowerCase().includes(term))
        );
        score += tagMatches.length * 0.5;
      }

      return {
        id: doc.id,
        score,
        content: doc.content,
        summary: doc.summary
      };
    });
  }

  /**
   * Get document frequencies for terms
   */
  private async getDocumentFrequencies(
    userId: string,
    terms: string[]
  ): Promise<Map<string, number>> {
    const dfMap = new Map<string, number>();
    
    // For each term, count how many documents contain it
    for (const term of terms) {
      const { count } = await supabaseAdmin
        .from('journal_entries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .ilike('content', `%${term}%`);
      
      dfMap.set(term, count || 1);
    }
    
    return dfMap;
  }

  /**
   * Fallback keyword search using ILIKE
   */
  private async fallbackKeywordSearch(
    userId: string,
    query: string,
    limit: number
  ): Promise<Array<{ id: string; score: number; content: string }>> {
    const { data } = await supabaseAdmin
      .from('journal_entries')
      .select('id, content, summary')
      .eq('user_id', userId)
      .ilike('content', `%${query}%`)
      .limit(limit);

    return (data || []).map((doc, index) => ({
      id: doc.id,
      score: 1.0 - (index / (data?.length || 1)), // Simple ranking
      content: doc.content || doc.summary || ''
    }));
  }
}

export const bm25Search = new BM25Search();
