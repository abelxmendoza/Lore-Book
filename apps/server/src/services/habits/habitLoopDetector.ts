import { logger } from '../../logger';

import type { Habit, HabitInsight, HabitContext } from './types';

/**
 * Detects habit loops: Trigger → Action → Reward
 */
export class HabitLoopDetector {
  /**
   * Detect habit loops
   */
  detect(habits: Habit[], ctx: HabitContext): HabitInsight[] {
    const insights: HabitInsight[] = [];

    try {
      for (const habit of habits) {
        // Detect trigger if not already set
        if (!habit.trigger) {
          const trigger = this.guessTrigger(habit.action, ctx);
          if (trigger) {
            habit.trigger = trigger;

            insights.push({
              id: crypto.randomUUID(),
              type: 'habit_loop',
              message: `Detected trigger for habit "${habit.action}": ${trigger}`,
              confidence: 0.7,
              timestamp: new Date().toISOString(),
              habit_id: habit.id || '',
              metadata: {
                trigger: trigger,
              },
            });
          }
        }

        // Detect reward if not already set
        if (!habit.reward) {
          const reward = this.guessReward(habit.action, ctx);
          if (reward) {
            habit.reward = reward;

            insights.push({
              id: crypto.randomUUID(),
              type: 'habit_loop',
              message: `Detected potential reward for habit "${habit.action}": ${reward}`,
              confidence: 0.6,
              timestamp: new Date().toISOString(),
              habit_id: habit.id || '',
              metadata: {
                reward: reward,
              },
            });
          }
        }

        // Calculate frequency if not set
        if (!habit.frequency) {
          const frequency = this.calculateFrequency(habit, ctx);
          if (frequency > 0) {
            habit.frequency = frequency;
          }
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to detect habit loops');
    }

    return insights;
  }

  /**
   * Guess trigger from action and context
   */
  private guessTrigger(action: string, ctx: HabitContext): string | null {
    const actionLower = action.toLowerCase();

    // Time-based triggers
    if (actionLower.includes('morning') || actionLower.includes('wake') || actionLower.includes('after waking')) {
      return 'morning';
    }
    if (actionLower.includes('evening') || actionLower.includes('night') || actionLower.includes('before bed')) {
      return 'evening';
    }
    if (actionLower.includes('after work') || actionLower.includes('afternoon')) {
      return 'afternoon';
    }

    // Activity-based triggers
    if (actionLower.includes('gym') || actionLower.includes('exercise') || actionLower.includes('workout')) {
      return 'morning';
    }
    if (actionLower.includes('meditate') || actionLower.includes('mindfulness')) {
      return 'waking up';
    }
    if (actionLower.includes('code') || actionLower.includes('program')) {
      return 'evenings';
    }
    if (actionLower.includes('read') || actionLower.includes('book')) {
      return 'before bed';
    }
    if (actionLower.includes('journal') || actionLower.includes('write')) {
      return 'end of day';
    }

    // Check entries for trigger patterns
    const entries = ctx.entries || [];
    for (const entry of entries.slice(0, 10)) {
      const content = (entry.content || '').toLowerCase();
      if (content.includes(actionLower.substring(0, 20))) {
        // Look for trigger phrases
        if (content.includes('when i') || content.includes('after i') || content.includes('before i')) {
          const triggerMatch = content.match(/(?:when|after|before)\s+i\s+([^.!?]+)/i);
          if (triggerMatch && triggerMatch[1]) {
            return triggerMatch[1].trim();
          }
        }
      }
    }

    return null;
  }

  /**
   * Guess reward from action and context
   */
  private guessReward(action: string, ctx: HabitContext): string | null {
    const actionLower = action.toLowerCase();

    // Common rewards
    if (actionLower.includes('exercise') || actionLower.includes('gym') || actionLower.includes('workout')) {
      return 'feeling energized';
    }
    if (actionLower.includes('meditate') || actionLower.includes('mindfulness')) {
      return 'feeling calm';
    }
    if (actionLower.includes('read') || actionLower.includes('learn')) {
      return 'knowledge gain';
    }
    if (actionLower.includes('code') || actionLower.includes('program')) {
      return 'sense of accomplishment';
    }
    if (actionLower.includes('journal') || actionLower.includes('write')) {
      return 'clarity and reflection';
    }

    // Check entries for reward mentions
    const entries = ctx.entries || [];
    for (const entry of entries.slice(0, 10)) {
      const content = (entry.content || '').toLowerCase();
      if (content.includes(actionLower.substring(0, 20))) {
        // Look for reward phrases
        if (content.includes('feel') || content.includes('makes me') || content.includes('helps me')) {
          const rewardMatch = content.match(/(?:feel|makes me|helps me)\s+([^.!?]+)/i);
          if (rewardMatch && rewardMatch[1]) {
            return rewardMatch[1].trim();
          }
        }
      }
    }

    return null;
  }

  /**
   * Calculate frequency from entries
   */
  private calculateFrequency(habit: Habit, ctx: HabitContext): number {
    const entries = ctx.entries || [];
    const actionLower = habit.action.toLowerCase();

    // Count entries mentioning this habit
    const mentions = entries.filter((e: any) => {
      const content = (e.content || '').toLowerCase();
      return content.includes(actionLower.substring(0, 20));
    });

    if (mentions.length === 0) return 0;

    // Calculate frequency per week
    const firstMention = mentions[mentions.length - 1];
    const lastMention = mentions[0];
    const firstDate = new Date(firstMention.date || firstMention.created_at);
    const lastDate = new Date(lastMention.date || lastMention.created_at);
    const daysDiff = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff === 0) return mentions.length;

    const weeks = daysDiff / 7;
    return weeks > 0 ? mentions.length / weeks : mentions.length;
  }
}


