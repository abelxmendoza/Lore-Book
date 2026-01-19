import { logger } from '../../logger';
import { embeddingService } from '../embeddingService';

import type { ExtractedEvent } from './types';

/**
 * Extracts events from journal entries
 * Extracts time, location, keywords, and creates embeddings
 */
export class EventExtractor {
  /**
   * Extract events from entries
   */
  async extract(entries: any[]): Promise<ExtractedEvent[]> {
    const out: ExtractedEvent[] = [];

    try {
      for (const entry of entries) {
        const text = entry.content || entry.text || '';
        if (!text) continue;

        // Extract timestamp (simple patterns for V1)
        const timestamp = this.extractTimestamp(text, entry.date || entry.created_at || entry.timestamp);

        // Extract location (simple patterns)
        const location = this.extractLocation(text);

        // Extract keywords (nouns and important words)
        const keywords = this.extractKeywords(text);

        // Get embedding
        let embedding: number[] = [];
        try {
          embedding = await embeddingService.embedText(text);
        } catch (error) {
          logger.warn({ error, entryId: entry.id }, 'Failed to get embedding for event');
        }

        out.push({
          memoryId: entry.id,
          raw: text.substring(0, 500), // Limit raw text
          timestamp,
          location,
          keywords,
          embedding,
          userId: entry.user_id,
        });
      }

      logger.debug({ extracted: out.length, entries: entries.length }, 'Extracted events');

      return out;
    } catch (error) {
      logger.error({ error }, 'Failed to extract events');
      return [];
    }
  }

  /**
   * Extract timestamp from text
   */
  private extractTimestamp(text: string, fallback: string | null): string | null {
    // Try to parse dates from text
    const datePatterns = [
      /(\d{1,2}\/\d{1,2}\/\d{2,4})/g,
      /(\d{4}-\d{2}-\d{2})/g,
      /(today|yesterday|tomorrow|now)/gi,
      /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi,
      /(january|february|march|april|may|june|july|august|september|october|november|december)/gi,
    ];

    for (const pattern of datePatterns) {
      if (pattern.test(text)) {
        // If we find a date pattern, try to parse it
        try {
          const date = new Date(text);
          if (!isNaN(date.getTime())) {
            return date.toISOString();
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    // Fallback to entry date
    if (fallback) {
      try {
        const date = new Date(fallback);
        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
      } catch {
        // Ignore parse errors
      }
    }

    return null;
  }

  /**
   * Extract location from text
   */
  private extractLocation(text: string): string | null {
    // Simple location patterns
    const locationPatterns = [
      /\b(in|at|to|from) ([A-Z][a-z]+(?: [A-Z][a-z]+)*)\b/g,
      /\b([A-Z][a-z]+ (?:Street|Avenue|Road|Park|Beach|City|State|Country|Restaurant|Cafe|Bar|Club))\b/g,
      /\b(LA|NYC|SF|NY|CA|TX|FL|USA)\b/gi,
    ];

    for (const pattern of locationPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const location = match[2] || match[1] || match[0];
        if (location && location.length > 1) {
          return location.trim();
        }
      }
    }

    return null;
  }

  /**
   * Extract keywords (nouns and important words)
   */
  private extractKeywords(text: string): string[] {
    // Simple keyword extraction - get capitalized words and important nouns
    const words = text.split(/\s+/);
    const keywords: string[] = [];

    // Get capitalized words (potential proper nouns)
    for (const word of words) {
      const cleaned = word.replace(/[^\w]/g, '');
      if (cleaned.length > 3 && /^[A-Z]/.test(cleaned)) {
        keywords.push(cleaned);
      }
    }

    // Get common event-related words
    const eventWords = ['meeting', 'party', 'event', 'conference', 'wedding', 'birthday', 'dinner', 'lunch', 'breakfast', 'trip', 'travel', 'visit'];
    for (const word of eventWords) {
      if (text.toLowerCase().includes(word)) {
        keywords.push(word);
      }
    }

    // Return top 6 keywords
    return [...new Set(keywords)].slice(0, 6);
  }
}

