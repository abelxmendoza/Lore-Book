import { logger } from '../../logger';
import { embeddingService } from '../embeddingService';
import type { ExtractedActivity } from './types';

/**
 * Extracts activities from journal entries
 * Uses keyword matching and pattern detection
 */
export class ActivityExtractor {
  private readonly ACTIVITY_KEYWORDS = [
    // Martial arts
    'bjj',
    'jiu-jitsu',
    'jiu jitsu',
    'muay thai',
    'sparring',
    'rolling',
    'training',
    'open mat',
    'grappling',
    // Robotics
    'coding',
    'deploying robots',
    'field ops',
    'pushing code',
    'dev work',
    'robotics',
    'robot',
    // Fitness
    'lifting',
    'running',
    'workout',
    'strength training',
    'gym',
    // Social
    'club',
    'bar',
    'party',
    'date',
    // Work
    'shift',
    'gig',
    'deployment',
    'demo',
    // Learning
    'studying',
    'reading',
    'learning',
    'duolingo',
  ];

  /**
   * Extract activities from entries
   */
  async extract(entries: any[]): Promise<ExtractedActivity[]> {
    const out: ExtractedActivity[] = [];

    try {
      for (const entry of entries) {
        const text = entry.content || entry.text || '';
        if (!text) continue;

        const textLower = text.toLowerCase();

        // Find matching activity keyword
        let extracted: string | null = null;
        for (const keyword of this.ACTIVITY_KEYWORDS) {
          if (textLower.includes(keyword)) {
            extracted = keyword;
            break;
          }
        }

        if (!extracted) continue;

        const normalized = this.normalize(extracted);
        const category = this.detectCategory(extracted, text);
        const intensity = this.detectIntensity(text);

        // Get embedding
        let embedding: number[] = [];
        try {
          embedding = await embeddingService.embedText(extracted);
        } catch (error) {
          logger.warn({ error, entryId: entry.id }, 'Failed to get embedding for activity');
        }

        out.push({
          memoryId: entry.id,
          raw: text.substring(0, 500),
          extractedName: extracted,
          normalizedName: normalized,
          category,
          intensity,
          embedding,
          userId: entry.user_id,
        });
      }

      logger.debug({ extracted: out.length, entries: entries.length }, 'Extracted activities');

      return out;
    } catch (error) {
      logger.error({ error }, 'Failed to extract activities');
      return [];
    }
  }

  /**
   * Normalize activity name
   */
  normalize(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, '_')
      .trim();
  }

  /**
   * Detect activity category
   */
  detectCategory(activity: string, text: string): string | null {
    const s = activity.toLowerCase();
    const textLower = text.toLowerCase();

    if (s.includes('bjj') || s.includes('jiu') || s.includes('roll') || s.includes('spar') || s.includes('grappling')) {
      return 'martial_arts';
    }
    if (s.includes('muay') || textLower.includes('muay thai')) {
      return 'martial_arts';
    }
    if (s.includes('lift') || s.includes('run') || s.includes('workout') || s.includes('gym') || s.includes('strength')) {
      return 'fitness';
    }
    if (s.includes('club') || s.includes('bar') || s.includes('party') || s.includes('date')) {
      return 'nightlife';
    }
    if (s.includes('code') || s.includes('robot') || s.includes('deploy') || s.includes('dev')) {
      return 'robotics';
    }
    if (s.includes('reading') || s.includes('study') || s.includes('learning') || s.includes('duolingo')) {
      return 'learning';
    }
    if (s.includes('shift') || s.includes('gig') || s.includes('work')) {
      return 'work';
    }

    return 'other';
  }

  /**
   * Detect activity intensity (1-10 scale)
   */
  detectIntensity(text: string): number {
    const s = text.toLowerCase();

    if (s.includes('hard') || s.includes('intense') || s.includes('killed me') || s.includes('exhausted')) {
      return 8;
    }
    if (s.includes('tired') || s.includes('drained') || s.includes('worn out')) {
      return 7;
    }
    if (s.includes('light') || s.includes('easy') || s.includes('casual') || s.includes('chill')) {
      return 3;
    }
    if (s.includes('moderate') || s.includes('medium')) {
      return 5;
    }

    // Default moderate intensity
    return 5;
  }
}

