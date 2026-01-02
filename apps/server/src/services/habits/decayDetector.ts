import { logger } from '../../logger';
import { differenceInDays, parseISO } from 'date-fns';
import type { Habit, HabitInsight } from './types';

/**
 * Detects habit decay (losing consistency)
 */
export class HabitDecayDetector {
  /**
   * Detect habit decay
   */
  detect(habits: Habit[]): HabitInsight[] {
    const insights: HabitInsight[] = [];

    try {
      for (const habit of habits) {
        if (!habit.last_performed) {
          // Never performed = high decay risk
          habit.decay_risk = 1.0;
          continue;
        }

        const daysSince = this.daysSince(habit.last_performed);
        const frequency = habit.frequency || 1; // Default: once per week

        // Calculate expected frequency (days between performances)
        const expectedInterval = 7 / frequency; // Days between performances

        // If days since last performance exceeds expected interval significantly
        if (daysSince >= expectedInterval * 2) {
          // Calculate decay risk (0-1)
          const risk = Math.min(1, daysSince / (expectedInterval * 4));
          habit.decay_risk = risk;

          // Generate warning if risk is significant
          if (risk >= 0.3) {
            const severity = risk >= 0.7 ? 'critical' : risk >= 0.5 ? 'high' : 'medium';

            insights.push({
              id: crypto.randomUUID(),
              type: 'decay_warning',
              message: this.generateDecayMessage(habit.action, daysSince, severity),
              confidence: 0.85,
              timestamp: new Date().toISOString(),
              habit_id: habit.id || '',
              metadata: {
                days_since_last: Math.floor(daysSince),
                expected_interval: Math.floor(expectedInterval),
                decay_risk: risk,
                severity,
              },
            });
          }
        } else {
          // Low decay risk
          habit.decay_risk = Math.max(0, (daysSince - expectedInterval) / expectedInterval);
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to detect habit decay');
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
   * Generate decay warning message
   */
  private generateDecayMessage(action: string, daysSince: number, severity: string): string {
    const days = Math.floor(daysSince);

    if (severity === 'critical') {
      return `⚠️ Critical: Habit "${action}" hasn't been performed in ${days} days. This habit is at high risk of being lost.`;
    }
    if (severity === 'high') {
      return `Habit "${action}" is losing consistency (last done ${days} days ago). Consider re-engaging soon.`;
    }
    return `Habit "${action}" hasn't been performed in ${days} days. Consider getting back on track.`;
  }
}


