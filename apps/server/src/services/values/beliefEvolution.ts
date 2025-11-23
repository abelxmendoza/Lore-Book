import { logger } from '../../logger';
import type { BeliefSignal, BeliefEvolutionPoint } from './types';

/**
 * Tracks belief drift over time
 */
export class BeliefEvolution {
  /**
   * Build timeline of belief evolution
   */
  buildTimeline(beliefs: BeliefSignal[]): BeliefEvolutionPoint[] {
    try {
      // Sort by timestamp
      const sorted = [...beliefs].sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateA - dateB;
      });

      return sorted.map(b => ({
        timestamp: b.timestamp,
        statement: b.statement,
        polarity: b.polarity,
        confidence: b.confidence,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to build belief evolution timeline');
      return [];
    }
  }

  /**
   * Detect belief shifts (changes in polarity or confidence)
   */
  detectShifts(timeline: BeliefEvolutionPoint[]): Array<{
    statement: string;
    shift: 'polarity' | 'confidence' | 'both';
    magnitude: number;
    period: { start: string; end: string };
  }> {
    try {
      const shifts: Array<{
        statement: string;
        shift: 'polarity' | 'confidence' | 'both';
        magnitude: number;
        period: { start: string; end: string };
      }> = [];

      // Group by similar statements (simplified - in production, use semantic similarity)
      const byStatement: Record<string, BeliefEvolutionPoint[]> = {};
      for (const point of timeline) {
        const key = point.statement.substring(0, 50); // Simplified grouping
        if (!byStatement[key]) {
          byStatement[key] = [];
        }
        byStatement[key].push(point);
      }

      // Analyze each statement group
      for (const [statement, points] of Object.entries(byStatement)) {
        if (points.length < 2) continue;

        const first = points[0];
        const last = points[points.length - 1];

        const polarityDiff = Math.abs(last.polarity - first.polarity);
        const confidenceDiff = Math.abs(last.confidence - first.confidence);

        if (polarityDiff > 0.3 || confidenceDiff > 0.3) {
          const shiftType: 'polarity' | 'confidence' | 'both' =
            polarityDiff > 0.3 && confidenceDiff > 0.3
              ? 'both'
              : polarityDiff > 0.3
              ? 'polarity'
              : 'confidence';

          shifts.push({
            statement,
            shift: shiftType,
            magnitude: Math.max(polarityDiff, confidenceDiff),
            period: {
              start: first.timestamp,
              end: last.timestamp,
            },
          });
        }
      }

      return shifts;
    } catch (error) {
      logger.error({ error }, 'Failed to detect belief shifts');
      return [];
    }
  }

  /**
   * Get belief evolution summary
   */
  getSummary(timeline: BeliefEvolutionPoint[]): {
    total_beliefs: number;
    explicit_beliefs: number;
    implicit_beliefs: number;
    average_polarity: number;
    average_confidence: number;
    time_span_days: number;
  } {
    if (timeline.length === 0) {
      return {
        total_beliefs: 0,
        explicit_beliefs: 0,
        implicit_beliefs: 0,
        average_polarity: 0,
        average_confidence: 0,
        time_span_days: 0,
      };
    }

    try {
      const first = new Date(timeline[0].timestamp);
      const last = new Date(timeline[timeline.length - 1].timestamp);
      const timeSpanDays = (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24);

      const totalPolarity = timeline.reduce((sum, p) => sum + p.polarity, 0);
      const totalConfidence = timeline.reduce((sum, p) => sum + p.confidence, 0);

      return {
        total_beliefs: timeline.length,
        explicit_beliefs: 0, // Would need to track this in timeline
        implicit_beliefs: 0, // Would need to track this in timeline
        average_polarity: totalPolarity / timeline.length,
        average_confidence: totalConfidence / timeline.length,
        time_span_days: timeSpanDays,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get belief evolution summary');
      return {
        total_beliefs: 0,
        explicit_beliefs: 0,
        implicit_beliefs: 0,
        average_polarity: 0,
        average_confidence: 0,
        time_span_days: 0,
      };
    }
  }
}

