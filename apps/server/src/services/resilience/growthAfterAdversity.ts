import { logger } from '../../logger';
import { parseISO, isAfter, differenceInDays } from 'date-fns';
import type { Setback, ResilienceInsight, ResilienceContext } from './types';

/**
 * Detects growth after adversity (post-traumatic growth)
 */
export class GrowthAfterAdversity {
  /**
   * Analyze growth after setbacks
   */
  analyze(setbacks: Setback[], ctx: ResilienceContext): ResilienceInsight[] {
    const insights: ResilienceInsight[] = [];

    try {
      const entries = ctx.entries || [];

      for (const setback of setbacks) {
        const growth = this.detectGrowth(setback, entries);

        if (growth) {
          insights.push({
            id: crypto.randomUUID(),
            type: 'growth_from_adversity',
            message: `You grew from this setback: "${setback.reason.substring(0, 60)}...". ${growth.lesson}`,
            confidence: 0.9,
            timestamp: growth.timestamp,
            related_setback_id: setback.id,
            metadata: {
              days_after_setback: growth.daysAfter,
              growth_type: growth.type,
              lesson_learned: growth.lesson,
            },
          });
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to analyze growth after adversity');
    }

    return insights;
  }

  /**
   * Detect growth after setback
   */
  private detectGrowth(
    setback: Setback,
    entries: any[]
  ): { timestamp: string; daysAfter: number; type: string; lesson: string } | null {
    try {
      const setbackDate = parseISO(setback.timestamp);

      // Get entries after setback (within 180 days)
      const laterEntries = entries.filter(e => {
        const entryDate = parseISO(e.date || e.created_at || e.timestamp);
        const daysAfter = differenceInDays(entryDate, setbackDate);
        return isAfter(entryDate, setbackDate) && daysAfter <= 180;
      });

      for (const entry of laterEntries) {
        const content = (entry.content || entry.text || '').toLowerCase();
        const entryDate = parseISO(entry.date || entry.created_at || entry.timestamp);
        const daysAfter = differenceInDays(entryDate, setbackDate);

        // Check for growth indicators
        const growth = this.detectGrowthIndicators(content, entry.text || entry.content || '');

        if (growth) {
          return {
            timestamp: entry.date || entry.created_at || entry.timestamp,
            daysAfter,
            type: growth.type,
            lesson: growth.lesson,
          };
        }
      }

      return null;
    } catch (error) {
      logger.error({ error }, 'Failed to detect growth');
      return null;
    }
  }

  /**
   * Detect growth indicators in text
   */
  private detectGrowthIndicators(textLower: string, textOriginal: string): { type: string; lesson: string } | null {
    // Growth markers
    const growthMarkers = [
      { pattern: /learned/i, type: 'learning' },
      { pattern: /stronger/i, type: 'strength' },
      { pattern: /better now/i, type: 'improvement' },
      { pattern: /grew from/i, type: 'growth' },
      { pattern: /taught me/i, type: 'lesson' },
      { pattern: /made me/i, type: 'transformation' },
      { pattern: /helped me/i, type: 'benefit' },
      { pattern: /realized/i, type: 'insight' },
      { pattern: /understand/i, type: 'understanding' },
      { pattern: /appreciate/i, type: 'appreciation' },
      { pattern: /grateful/i, type: 'gratitude' },
      { pattern: /wisdom/i, type: 'wisdom' },
      { pattern: /perspective/i, type: 'perspective' },
      { pattern: /resilient/i, type: 'resilience' },
      { pattern: /overcame/i, type: 'overcoming' },
      { pattern: /survived/i, type: 'survival' },
      { pattern: /bounce back/i, type: 'recovery' },
    ];

    for (const marker of growthMarkers) {
      if (marker.pattern.test(textLower)) {
        // Extract the lesson
        const lesson = this.extractLesson(textOriginal, marker.pattern);
        return {
          type: marker.type,
          lesson: lesson || `Growth detected: ${marker.type}`,
        };
      }
    }

    return null;
  }

  /**
   * Extract lesson from text
   */
  private extractLesson(text: string, pattern: RegExp): string {
    // Try to extract the lesson around the growth marker
    const match = text.match(pattern);
    if (!match) return '';

    const matchIndex = match.index || 0;
    const contextStart = Math.max(0, matchIndex - 50);
    const contextEnd = Math.min(text.length, matchIndex + 150);
    const context = text.substring(contextStart, contextEnd);

    // Try to extract a complete sentence
    const sentences = context.split(/[.!?]/);
    for (const sentence of sentences) {
      if (pattern.test(sentence)) {
        return sentence.trim().substring(0, 200);
      }
    }

    return context.trim().substring(0, 200);
  }
}

