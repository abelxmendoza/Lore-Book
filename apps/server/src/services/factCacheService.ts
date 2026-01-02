import crypto from 'crypto';
import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';
import type { ExtractedFact, FactExtractionResult } from './factExtractionService';

/**
 * Aggressive caching service for fact extractions
 * Uses content hash as cache key - facts don't change if content doesn't change
 */
class FactCacheService {
  private memoryCache: Map<string, FactExtractionResult> = new Map();
  private readonly MEMORY_CACHE_SIZE = 1000; // Keep last 1000 extractions in memory

  /**
   * Generate content hash for cache key
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Get cached facts for content
   */
  async getCachedFacts(content: string): Promise<FactExtractionResult | null> {
    const hash = this.hashContent(content);

    // Check memory cache first (fastest)
    if (this.memoryCache.has(hash)) {
      return this.memoryCache.get(hash)!;
    }

    // Check database cache (fact_claims table)
    try {
      const { data, error } = await supabaseAdmin
        .from('fact_claims')
        .select('claim_type, subject, attribute, value, confidence, metadata')
        .eq('user_id', 'cache') // Use special user_id for cached facts
        .eq('entry_id', hash)
        .limit(100);

      if (!error && data && data.length > 0) {
        const facts: ExtractedFact[] = data.map(row => ({
          claim_type: row.claim_type as any,
          subject: row.subject,
          attribute: row.attribute,
          value: row.value,
          confidence: row.confidence,
          context: (row.metadata as any)?.context
        }));

        const result: FactExtractionResult = {
          facts,
          extraction_confidence: 0.7
        };

        // Store in memory cache
        this.setMemoryCache(hash, result);
        return result;
      }
    } catch (error) {
      logger.debug({ error }, 'Failed to check database cache');
    }

    return null;
  }

  /**
   * Cache facts for content
   */
  async cacheFacts(content: string, facts: FactExtractionResult): Promise<void> {
    const hash = this.hashContent(content);

    // Store in memory cache
    this.setMemoryCache(hash, facts);

    // Store in database cache (fire and forget)
    try {
      const factClaims = facts.facts.map(fact => ({
        user_id: 'cache', // Special user_id for cached facts
        entry_id: hash,
        claim_type: fact.claim_type,
        subject: fact.subject,
        attribute: fact.attribute,
        value: fact.value,
        confidence: fact.confidence,
        metadata: { context: fact.context }
      }));

      // Upsert to fact_claims table
      await supabaseAdmin
        .from('fact_claims')
        .upsert(factClaims, {
          onConflict: 'user_id,entry_id,subject,attribute,value'
        })
        .catch(err => logger.debug({ error: err }, 'Failed to cache facts in database'));
    } catch (error) {
      logger.debug({ error }, 'Failed to cache facts');
    }
  }

  /**
   * Get cached facts for entry ID (if entry content hasn't changed)
   */
  async getCachedFactsForEntry(userId: string, entryId: string): Promise<FactExtractionResult | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('fact_claims')
        .select('claim_type, subject, attribute, value, confidence, metadata')
        .eq('user_id', userId)
        .eq('entry_id', entryId)
        .limit(100);

      if (!error && data && data.length > 0) {
        const facts: ExtractedFact[] = data.map(row => ({
          claim_type: row.claim_type as any,
          subject: row.subject,
          attribute: row.attribute,
          value: row.value,
          confidence: row.confidence,
          context: (row.metadata as any)?.context
        }));

        return {
          facts,
          extraction_confidence: 0.7
        };
      }
    } catch (error) {
      logger.debug({ error }, 'Failed to get cached facts for entry');
    }

    return null;
  }

  /**
   * Set memory cache with size limit
   */
  private setMemoryCache(key: string, value: FactExtractionResult): void {
    // If cache is full, remove oldest entry (simple FIFO)
    if (this.memoryCache.size >= this.MEMORY_CACHE_SIZE) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) {
        this.memoryCache.delete(firstKey);
      }
    }
    this.memoryCache.set(key, value);
  }

  /**
   * Clear cache for entry (when entry is updated)
   */
  async clearCacheForEntry(userId: string, entryId: string): Promise<void> {
    try {
      await supabaseAdmin
        .from('fact_claims')
        .delete()
        .eq('user_id', userId)
        .eq('entry_id', entryId);
    } catch (error) {
      logger.debug({ error }, 'Failed to clear cache for entry');
    }
  }

  /**
   * Clear memory cache
   */
  clearMemoryCache(): void {
    this.memoryCache.clear();
  }
}

export const factCacheService = new FactCacheService();

