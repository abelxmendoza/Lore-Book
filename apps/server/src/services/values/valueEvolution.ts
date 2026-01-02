import { logger } from '../../logger';
import type { ValueSignal, ValueEvolutionPoint } from './types';

/**
 * Tracks how your values shift with time
 */
export class ValueEvolution {
  /**
   * Build timeline of value evolution
   */
  buildTimeline(signals: ValueSignal[]): ValueEvolutionPoint[] {
    try {
      // Sort by timestamp
      const sorted = [...signals].sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateA - dateB;
      });

      return sorted.map(s => ({
        timestamp: s.timestamp,
        category: s.category,
        strength: s.strength,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to build value evolution timeline');
      return [];
    }
  }

  /**
   * Detect value shifts (significant changes in value strength over time)
   */
  detectShifts(timeline: ValueEvolutionPoint[]): Array<{
    category: string;
    shift: 'strengthening' | 'weakening' | 'stable';
    magnitude: number;
    period: { start: string; end: string };
  }> {
    try {
      const shifts: Array<{
        category: string;
        shift: 'strengthening' | 'weakening' | 'stable';
        magnitude: number;
        period: { start: string; end: string };
      }> = [];

      // Group by category
      const byCategory: Record<string, ValueEvolutionPoint[]> = {};
      for (const point of timeline) {
        if (!byCategory[point.category]) {
          byCategory[point.category] = [];
        }
        byCategory[point.category].push(point);
      }

      // Analyze each category
      for (const [category, points] of Object.entries(byCategory)) {
        if (points.length < 2) continue;

        // Compare first half vs second half
        const midpoint = Math.floor(points.length / 2);
        const firstHalf = points.slice(0, midpoint);
        const secondHalf = points.slice(midpoint);

        const avgFirst = firstHalf.reduce((sum, p) => sum + p.strength, 0) / firstHalf.length;
        const avgSecond = secondHalf.reduce((sum, p) => sum + p.strength, 0) / secondHalf.length;

        const diff = avgSecond - avgFirst;
        const magnitude = Math.abs(diff);

        if (magnitude > 0.2) {
          shifts.push({
            category,
            shift: diff > 0 ? 'strengthening' : 'weakening',
            magnitude,
            period: {
              start: firstHalf[0].timestamp,
              end: secondHalf[secondHalf.length - 1].timestamp,
            },
          });
        }
      }

      return shifts;
    } catch (error) {
      logger.error({ error }, 'Failed to detect value shifts');
      return [];
    }
  }

  /**
   * Get value evolution summary
   */
  getSummary(timeline: ValueEvolutionPoint[]): {
    total_points: number;
    categories_tracked: number;
    time_span_days: number;
    strongest_category: string | null;
    most_volatile_category: string | null;
  } {
    if (timeline.length === 0) {
      return {
        total_points: 0,
        categories_tracked: 0,
        time_span_days: 0,
        strongest_category: null,
        most_volatile_category: null,
      };
    }

    try {
      const categories = new Set(timeline.map(p => p.category));
      const first = new Date(timeline[0].timestamp);
      const last = new Date(timeline[timeline.length - 1].timestamp);
      const timeSpanDays = (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24);

      // Find strongest category (highest average strength)
      const byCategory: Record<string, number[]> = {};
      for (const point of timeline) {
        if (!byCategory[point.category]) {
          byCategory[point.category] = [];
        }
        byCategory[point.category].push(point.strength);
      }

      let strongestCategory: string | null = null;
      let highestAvg = 0;

      let mostVolatileCategory: string | null = null;
      let highestVolatility = 0;

      for (const [category, strengths] of Object.entries(byCategory)) {
        const avg = strengths.reduce((sum, s) => sum + s, 0) / strengths.length;
        if (avg > highestAvg) {
          highestAvg = avg;
          strongestCategory = category;
        }

        // Calculate volatility (standard deviation)
        const variance = strengths.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / strengths.length;
        const stdDev = Math.sqrt(variance);
        if (stdDev > highestVolatility) {
          highestVolatility = stdDev;
          mostVolatileCategory = category;
        }
      }

      return {
        total_points: timeline.length,
        categories_tracked: categories.size,
        time_span_days: timeSpanDays,
        strongest_category: strongestCategory,
        most_volatile_category: mostVolatileCategory,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get value evolution summary');
      return {
        total_points: 0,
        categories_tracked: 0,
        time_span_days: 0,
        strongest_category: null,
        most_volatile_category: null,
      };
    }
  }
}

