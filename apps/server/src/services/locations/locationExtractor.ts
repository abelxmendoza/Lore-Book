import { logger } from '../../logger';
import { embeddingService } from '../embeddingService';
import type { ExtractedLocation } from './types';

/**
 * Extracts locations from journal entries
 * Uses simple pattern matching for V1
 */
export class LocationExtractor {
  /**
   * Extract locations from entries
   */
  async extract(entries: any[]): Promise<ExtractedLocation[]> {
    const out: ExtractedLocation[] = [];

    try {
      for (const entry of entries) {
        const text = entry.content || entry.text || '';
        if (!text) continue;

        // Extract location using patterns
        const extracted = this.extractLocationName(text);

        if (!extracted) continue;

        const normalized = this.normalize(extracted);
        const type = this.detectType(extracted);

        // Get embedding
        let embedding: number[] = [];
        try {
          embedding = await embeddingService.embedText(extracted);
        } catch (error) {
          logger.warn({ error, entryId: entry.id }, 'Failed to get embedding for location');
        }

        out.push({
          memoryId: entry.id,
          raw: text.substring(0, 500),
          extractedName: extracted,
          normalizedName: normalized,
          type,
          embedding,
          userId: entry.user_id,
        });
      }

      logger.debug({ extracted: out.length, entries: entries.length }, 'Extracted locations');

      return out;
    } catch (error) {
      logger.error({ error }, 'Failed to extract locations');
      return [];
    }
  }

  /**
   * Extract location name from text
   */
  private extractLocationName(text: string): string | null {
    // Pattern 1: "at/in/to/from [Location]"
    const prepositionPattern = /\b(?:at|in|to|from|near|by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
    const prepositionMatch = text.match(prepositionPattern);
    if (prepositionMatch) {
      const location = prepositionMatch[0].replace(/^(?:at|in|to|from|near|by)\s+/i, '').trim();
      if (location.length > 1) {
        return location;
      }
    }

    // Pattern 2: Address patterns
    const addressPattern = /\b([A-Z][a-z]+\s+(?:Street|Avenue|Road|Drive|Boulevard|Lane|Way|Park|Beach|City|State|Country))\b/g;
    const addressMatch = text.match(addressPattern);
    if (addressMatch) {
      return addressMatch[0].trim();
    }

    // Pattern 3: Common location abbreviations
    const abbrevPattern = /\b(LA|NYC|SF|NY|CA|TX|FL|USA|UK|EU)\b/gi;
    const abbrevMatch = text.match(abbrevPattern);
    if (abbrevMatch) {
      return abbrevMatch[0].trim();
    }

    // Pattern 4: Capitalized words that might be locations
    const capitalizedPattern = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)*)\b/g;
    const capitalizedMatches = text.matchAll(capitalizedPattern);
    for (const match of capitalizedMatches) {
      const word = match[0];
      // Skip common non-location words
      if (!['The', 'This', 'That', 'There', 'They', 'Then', 'When', 'What', 'Where', 'Who', 'Why', 'How'].includes(word)) {
        return word;
      }
    }

    return null;
  }

  /**
   * Normalize location name
   */
  normalize(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Detect location type
   */
  detectType(str: string | null): string | null {
    if (!str) return null;

    const s = str.toLowerCase();

    if (s.includes('bjj') || s.includes('gym') || s.includes('academy') || s.includes('dojo') || s.includes('martial')) {
      return 'gym';
    }
    if (s.includes('club') || s.includes('bar') || s.includes('lounge') || s.includes('restaurant') || s.includes('cafe')) {
      return 'venue';
    }
    if (s.includes('street') || s.includes('st') || s.includes('ave') || s.includes('avenue')) {
      return 'street';
    }
    if (s.includes('drive') || s.includes('road') || s.includes('boulevard') || s.includes('lane')) {
      return 'address';
    }
    if (s.includes('park') || s.includes('beach') || s.includes('trail')) {
      return 'outdoor';
    }
    if (s.includes('home') || s.includes('house') || s.includes('apartment')) {
      return 'home';
    }
    if (s.includes('city') || s.includes('state') || s.includes('country')) {
      return 'region';
    }

    return 'unknown';
  }
}

