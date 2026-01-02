import { logger } from '../../logger';
import { differenceInDays, parseISO } from 'date-fns';
import type { Habit, HabitInsight } from './types';

/**
 * Calculates habit streaks
 */
export class StreakCalculator {
  /**
   * Calculate streaks for habits
   */
  calculate(habits: Habit[]): HabitInsight[] {
    const insights: HabitInsight[] = [];

    try {
      for (const habit of habits) {
        if (!habit.last_performed) {
          continue;
        }

        const daysSince = this.daysSince(habit.last_performed);
        const currentStreak = habit.streak || 0;

        // If performed within last 2 days, increment streak
        if (daysSince <= 1) {
          const newStreak = currentStreak + 1;
          habit.streak = newStreak;

          // Update longest streak if needed
          if (!habit.longest_streak || newStreak > habit.longest_streak) {
            habit.longest_streak = newStreak;
          }

          // Only create insight for significant streaks or milestones
          if (newStreak % 7 === 0 || newStreak === 1 || newStreak === 30 || newStreak === 100) {
            insights.push({
              id: crypto.randomUUID(),
              type: 'streak_update',
              message: this.generateStreakMessage(habit.action, newStreak),
              confidence: 0.9,
              timestamp: new Date().toISOString(),
              habit_id: habit.id || '',
              metadata: {
                streak: newStreak,
                previous_streak: currentStreak,
              },
            });
          }
        } else if (daysSince > 1 && currentStreak > 0) {
          // Streak broken
          habit.streak = 0;

          insights.push({
            id: crypto.randomUUID(),
            type: 'streak_update',
            message: `Streak broken for "${habit.action}". Previous streak: ${currentStreak} days.`,
            confidence: 0.95,
            timestamp: new Date().toISOString(),
            habit_id: habit.id || '',
            metadata: {
              streak: 0,
              previous_streak: currentStreak,
              days_since_last: Math.floor(daysSince),
            },
          });
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to calculate streaks');
    }

    return insights;
  }

  /**
   * Calculate days since date
   */
  private daysSince(date: string): number {
    try {
      const dateObj = parseISO(date);
      const now = new Date();
      return differenceInDays(now, dateObj);
    } catch (error) {
      return 999; // Invalid date = very old
    }
  }

  /**
   * Generate streak message
   */
  private generateStreakMessage(action: string, streak: number): string {
    if (streak === 1) {
      return `Started streak for "${action}"!`;
    }
    if (streak === 7) {
      return `One week streak for "${action}"! Keep it up!`;
    }
    if (streak === 30) {
      return `🎉 30-day streak for "${action}"! Amazing consistency!`;
    }
    if (streak === 100) {
      return `🔥 100-day streak for "${action}"! Incredible dedication!`;
    }
    return `Streak for "${action}": ${streak} days`;
  }
}


