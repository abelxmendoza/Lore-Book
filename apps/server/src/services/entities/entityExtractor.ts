import { logger } from '../../logger';

import type { ExtractedEntity, EntityType } from './types';

/**
 * Extracts entities from journal entries using rule-based patterns
 * For V1, we use simple regex patterns instead of compromise library
 */
export class EntityExtractor {
  /**
   * Extract entities from entries
   */
  extract(entries: any[]): ExtractedEntity[] {
    const out: ExtractedEntity[] = [];

    try {
      // Person patterns (names, pronouns, relationships)
      const personPatterns = [
        /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g, // Full names
        /\b(mom|dad|mother|father|brother|sister|friend|coach|boss|teacher)\b/gi,
        /\b([A-Z][a-z]+)\b/g, // Capitalized words (potential names)
      ];

      // Place patterns
      const placePatterns = [
        /\b(in|at|to|from) ([A-Z][a-z]+(?: [A-Z][a-z]+)*)\b/g, // "in Los Angeles", "at Starbucks"
        /\b([A-Z][a-z]+ (?:Street|Avenue|Road|Park|Beach|City|State|Country))\b/g,
        /\b(LA|NYC|SF|NY|CA|TX|FL)\b/gi, // Common abbreviations
      ];

      // Organization patterns
      const orgPatterns = [
        /\b([A-Z][a-z]+ (?:Inc|LLC|Corp|Company|University|College|School|Hospital))\b/g,
        /\b(Google|Apple|Microsoft|Amazon|Facebook|Twitter|Instagram)\b/gi,
      ];

      // Event patterns
      const eventPatterns = [
        /\b(conference|meeting|wedding|birthday|party|event|festival|concert)\b/gi,
      ];

      for (const entry of entries) {
        const text = entry.content || entry.text || '';
        if (!text) continue;

        // Extract people
        for (const pattern of personPatterns) {
          const matches = text.matchAll(pattern);
          for (const match of matches) {
            const name = match[1] || match[0];
            if (name && name.length > 1) {
              out.push({
                raw: name.trim(),
                type: 'person',
                memoryId: entry.id,
                timestamp: entry.date || entry.created_at || entry.timestamp,
                userId: entry.user_id,
              });
            }
          }
        }

        // Extract places
        for (const pattern of placePatterns) {
          const matches = text.matchAll(pattern);
          for (const match of matches) {
            const place = match[2] || match[1] || match[0];
            if (place && place.length > 1) {
              out.push({
                raw: place.trim(),
                type: 'place',
                memoryId: entry.id,
                timestamp: entry.date || entry.created_at || entry.timestamp,
                userId: entry.user_id,
              });
            }
          }
        }

        // Extract organizations
        for (const pattern of orgPatterns) {
          const matches = text.matchAll(pattern);
          for (const match of matches) {
            const org = match[1] || match[0];
            if (org && org.length > 1) {
              out.push({
                raw: org.trim(),
                type: 'org',
                memoryId: entry.id,
                timestamp: entry.date || entry.created_at || entry.timestamp,
                userId: entry.user_id,
              });
            }
          }
        }

        // Extract events
        for (const pattern of eventPatterns) {
          const matches = text.matchAll(pattern);
          for (const match of matches) {
            const event = match[0];
            if (event && event.length > 1) {
              out.push({
                raw: event.trim(),
                type: 'event',
                memoryId: entry.id,
                timestamp: entry.date || entry.created_at || entry.timestamp,
                userId: entry.user_id,
              });
            }
          }
        }
      }

      // Deduplicate within same entry
      const seen = new Set<string>();
      const deduplicated = out.filter(e => {
        const key = `${e.memoryId}:${e.raw}:${e.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      logger.debug({ extracted: deduplicated.length, entries: entries.length }, 'Extracted entities');

      return deduplicated;
    } catch (error) {
      logger.error({ error }, 'Failed to extract entities');
      return [];
    }
  }
}

