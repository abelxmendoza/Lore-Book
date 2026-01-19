import { logger } from '../../logger';

import type { TemporalSignal } from './types';

/**
 * Extracts temporal signals from journal entries
 * Gathers people, locations, activities, and timestamps
 */
export class EventExtractor {
  /**
   * Extract temporal signals from entries
   */
  async extract(ctx: { entries: any[]; entities?: any[]; locations?: any[]; activities?: any[] }): Promise<TemporalSignal[]> {
    const out: TemporalSignal[] = [];

    try {
      // Create lookup maps for resolved entities
      const entityMap = new Map<string, string>();
      const locationMap = new Map<string, string>();
      const activityMap = new Map<string, string>();

      (ctx.entities || []).forEach((e: any) => {
        if (e.canonical) entityMap.set(e.canonical.toLowerCase(), e.id || e.canonical);
      });

      (ctx.locations || []).forEach((l: any) => {
        const key = l.name?.toLowerCase() || l.normalized_name?.toLowerCase();
        if (key) locationMap.set(key, l.id || l.name);
      });

      (ctx.activities || []).forEach((a: any) => {
        const key = a.name?.toLowerCase() || a.normalized_name?.toLowerCase();
        if (key) activityMap.set(key, a.id || a.name);
      });

      for (const entry of ctx.entries) {
        const text = entry.content || entry.text || '';
        if (!text) continue;

        const timestamp = entry.date || entry.created_at || entry.timestamp;

        // Extract people, locations, activities from text (simple pattern matching)
        const people = this.extractPeople(text, entityMap);
        const locations = this.extractLocations(text, locationMap);
        const activities = this.extractActivities(text, activityMap);

        // Only create signal if we have at least one entity
        if (people.length > 0 || locations.length > 0 || activities.length > 0) {
          out.push({
            memoryId: entry.id,
            timestamp,
            people,
            locations,
            activities,
            text,
          });
        }
      }

      logger.debug({ signals: out.length, entries: ctx.entries.length }, 'Extracted temporal signals');

      return out;
    } catch (error) {
      logger.error({ error }, 'Failed to extract temporal signals');
      return [];
    }
  }

  /**
   * Extract people from text
   */
  private extractPeople(text: string, entityMap: Map<string, string>): string[] {
    const people: string[] = [];
    const textLower = text.toLowerCase();

    // Check against entity map
    for (const [key, value] of entityMap.entries()) {
      if (textLower.includes(key)) {
        people.push(value);
      }
    }

    // Also check for common person patterns
    const personPatterns = [
      /\b(mom|dad|mother|father|brother|sister|friend|coach|boss)\b/gi,
      /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g, // Full names
    ];

    for (const pattern of personPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const person = match[1] || match[0];
        if (person && !people.includes(person)) {
          people.push(person);
        }
      }
    }

    return people;
  }

  /**
   * Extract locations from text
   */
  private extractLocations(text: string, locationMap: Map<string, string>): string[] {
    const locations: string[] = [];
    const textLower = text.toLowerCase();

    // Check against location map
    for (const [key, value] of locationMap.entries()) {
      if (textLower.includes(key)) {
        locations.push(value);
      }
    }

    return locations;
  }

  /**
   * Extract activities from text
   */
  private extractActivities(text: string, activityMap: Map<string, string>): string[] {
    const activities: string[] = [];
    const textLower = text.toLowerCase();

    // Check against activity map
    for (const [key, value] of activityMap.entries()) {
      if (textLower.includes(key)) {
        activities.push(value);
      }
    }

    return activities;
  }
}

