import { logger } from '../../logger';

import type { Habit, HabitContext } from './types';

/**
 * Extracts habits from journal entries
 */
export class HabitExtractor {
  /**
   * Extract habits from context
   */
  extract(ctx: HabitContext): Habit[] {
    const habits: Habit[] = [];

    try {
      const entries = ctx.entries || [];

      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        if (this.looksLikeHabit(content)) {
          const action = this.extractAction(content);
          const category = this.categorizeHabit(action);

          habits.push({
            id: `habit_${entry.id}_${Date.now()}`,
            action,
            last_performed: entry.date || entry.created_at || entry.timestamp,
            category,
            metadata: {
              source_entry_id: entry.id,
              extracted_from: content.substring(0, 200),
            },
          });
        }
      }

      // Merge duplicates
      const merged = this.mergeDuplicates(habits);

      logger.debug({ habits: merged.length, entries: entries.length }, 'Extracted habits');

      return merged;
    } catch (error) {
      logger.error({ error }, 'Failed to extract habits');
      return [];
    }
  }

  /**
   * Check if text looks like a habit
   */
  private looksLikeHabit(text: string): boolean {
    const content = text.toLowerCase();

    // Habit markers
    const markers = [
      'every day',
      'each day',
      'daily',
      'each morning',
      'every morning',
      'each evening',
      'every evening',
      'each night',
      'every night',
      'whenever i',
      'i try to',
      'i usually',
      'i always',
      'i consistently',
      'routine',
      'habit',
      'regularly',
      'consistently',
      'every week',
      'each week',
    ];

    // Check for habit markers
    const hasMarker = markers.some(m => content.includes(m));

    // Check for frequency patterns
    const frequencyPatterns = [
      /\d+\s+times\s+(?:a|per)\s+(?:day|week|month)/i,
      /(?:once|twice|three times|four times|five times)\s+(?:a|per)\s+(?:day|week)/i,
    ];

    const hasFrequency = frequencyPatterns.some(pattern => pattern.test(content));

    // Check for action patterns (verbs that indicate habits)
    const actionPatterns = [
      /i\s+(?:go|do|make|take|have|practice|exercise|work\s+out|meditate|read|write|code|study)/i,
    ];

    const hasAction = actionPatterns.some(pattern => pattern.test(content));

    return hasMarker || (hasFrequency && hasAction);
  }

  /**
   * Extract action from text
   */
  private extractAction(text: string): string {
    // Try to extract the main action
    const sentences = text.split(/[.!?]/);
    const firstSentence = sentences[0] || text;

    // Look for action patterns
    const actionMatch = firstSentence.match(
      /(?:i\s+)?(?:try\s+to|usually|always|consistently|regularly)?\s*([^.!?]+?)(?:\s+every|\s+each|\s+daily|$)/i
    );

    if (actionMatch && actionMatch[1]) {
      return actionMatch[1].trim().substring(0, 100);
    }

    // Fallback: take first 60 characters
    return firstSentence.trim().substring(0, 60);
  }

  /**
   * Categorize habit
   */
  private categorizeHabit(action: string): string {
    const actionLower = action.toLowerCase();

    if (actionLower.includes('exercise') || actionLower.includes('gym') || actionLower.includes('workout') || actionLower.includes('run') || actionLower.includes('jog')) {
      return 'fitness';
    }
    if (actionLower.includes('meditate') || actionLower.includes('mindfulness') || actionLower.includes('yoga')) {
      return 'wellness';
    }
    if (actionLower.includes('read') || actionLower.includes('study') || actionLower.includes('learn')) {
      return 'learning';
    }
    if (actionLower.includes('write') || actionLower.includes('journal') || actionLower.includes('blog')) {
      return 'writing';
    }
    if (actionLower.includes('code') || actionLower.includes('program') || actionLower.includes('develop')) {
      return 'development';
    }
    if (actionLower.includes('eat') || actionLower.includes('drink') || actionLower.includes('cook')) {
      return 'nutrition';
    }
    if (actionLower.includes('sleep') || actionLower.includes('wake') || actionLower.includes('bedtime')) {
      return 'sleep';
    }
    if (actionLower.includes('social') || actionLower.includes('friend') || actionLower.includes('call')) {
      return 'social';
    }

    return 'other';
  }

  /**
   * Merge duplicate habits
   */
  private mergeDuplicates(habits: Habit[]): Habit[] {
    const map = new Map<string, Habit>();

    for (const habit of habits) {
      const key = habit.action.toLowerCase().trim();

      if (!map.has(key)) {
        map.set(key, habit);
      } else {
        // Merge: keep the most recent last_performed
        const existing = map.get(key)!;
        const existingDate = existing.last_performed ? new Date(existing.last_performed) : null;
        const newDate = habit.last_performed ? new Date(habit.last_performed) : null;

        if (newDate && (!existingDate || newDate > existingDate)) {
          existing.last_performed = habit.last_performed;
        }

        // Merge metadata
        existing.metadata = {
          ...existing.metadata,
          ...habit.metadata,
          merged_from: [...(existing.metadata?.merged_from || []), habit.id],
        };
      }
    }

    return Array.from(map.values());
  }
}


