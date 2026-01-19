import crypto from 'crypto';

import OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';

import { memoryService } from './memoryService';
import { ruleBasedTagExtractionService } from './ruleBasedTagExtraction';

const openai = new OpenAI({ apiKey: config.openAiKey });

// Simple in-memory cache for tag suggestions
const tagCache = new Map<string, string[]>();
const TAG_CACHE_SIZE = 1000;

export class TagService {
  /**
   * Generate cache key from content
   */
  private hashContent(content: string): string {
    const normalized = content.trim().toLowerCase().slice(0, 1000);
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Suggest tags using rule-based extraction first, fallback to AI if needed
   */
  async suggestTags(content: string, userId?: string): Promise<string[]> {
    // Check cache first
    const cacheKey = this.hashContent(content);
    if (tagCache.has(cacheKey)) {
      return tagCache.get(cacheKey)!;
    }

    // Use rule-based extraction (FREE - no API call)
    const ruleBasedTags = await ruleBasedTagExtractionService.suggestTags(content, userId);

    // Cache the result
    if (tagCache.size >= TAG_CACHE_SIZE) {
      const firstKey = tagCache.keys().next().value;
      if (firstKey) {
        tagCache.delete(firstKey);
      }
    }
    tagCache.set(cacheKey, ruleBasedTags);

    return ruleBasedTags;
  }

  /**
   * Legacy method - kept for backward compatibility
   * Now uses rule-based extraction instead of API
   */
  async suggestTagsLegacy(content: string): Promise<string[]> {
    // Use rule-based extraction instead of API
    return this.suggestTags(content);
  }
}

export const tagService = new TagService();
