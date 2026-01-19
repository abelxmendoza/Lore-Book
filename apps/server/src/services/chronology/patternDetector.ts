import { parseISO, differenceInDays } from 'date-fns';

import type { Event, TemporalPattern } from './types';

/**
 * Detects basic temporal patterns
 * Advanced patterns are delegated to Python service
 */
export class PatternDetector {
  /**
   * Detect temporal patterns in events
   */
  detect(events: Event[]): TemporalPattern[] {
    const patterns: TemporalPattern[] = [];

    // Pattern 1: Temporal density
    const densityPattern = this.detectTemporalDensity(events);
    if (densityPattern) {
      patterns.push(densityPattern);
    }

    // Pattern 2: Clustering detection (basic)
    const clusteringPattern = this.detectClustering(events);
    if (clusteringPattern) {
      patterns.push(clusteringPattern);
    }

    // Pattern 3: Regular intervals (basic)
    const intervalPattern = this.detectRegularIntervals(events);
    if (intervalPattern) {
      patterns.push(intervalPattern);
    }

    return patterns;
  }

  /**
   * Detect temporal density pattern
   */
  private detectTemporalDensity(events: Event[]): TemporalPattern | null {
    const eventsWithTimestamps = events.filter(e => e.timestamp);
    if (eventsWithTimestamps.length < 2) return null;

    const sorted = eventsWithTimestamps.sort(
      (a, b) => new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime()
    );

    const firstDate = new Date(sorted[0].timestamp!);
    const lastDate = new Date(sorted[sorted.length - 1].timestamp!);
    const totalDays = differenceInDays(lastDate, firstDate) || 1;
    const density = sorted.length / totalDays;

    return {
      patternType: 'temporal_density',
      score: Math.min(1.0, density / 10), // Normalize to 0-1
      exampleEvents: sorted.slice(0, 5).map(e => e.id),
      metadata: {
        eventsPerDay: density,
        totalEvents: sorted.length,
        timeSpan: totalDays,
      },
    };
  }

  /**
   * Detect clustering pattern (basic)
   */
  private detectClustering(events: Event[]): TemporalPattern | null {
    const eventsWithTimestamps = events.filter(e => e.timestamp);
    if (eventsWithTimestamps.length < 3) return null;

    const sorted = eventsWithTimestamps.sort(
      (a, b) => new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime()
    );

    // Find clusters (events within 7 days of each other)
    const clusters: Event[][] = [];
    let currentCluster: Event[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const prevDate = new Date(sorted[i - 1].timestamp!);
      const currDate = new Date(sorted[i].timestamp!);
      const daysDiff = differenceInDays(currDate, prevDate);

      if (daysDiff <= 7) {
        currentCluster.push(sorted[i]);
      } else {
        if (currentCluster.length >= 3) {
          clusters.push(currentCluster);
        }
        currentCluster = [sorted[i]];
      }
    }

    if (currentCluster.length >= 3) {
      clusters.push(currentCluster);
    }

    if (clusters.length > 0) {
      const largestCluster = clusters.reduce((a, b) => (a.length > b.length ? a : b));
      return {
        patternType: 'temporal_clustering',
        score: Math.min(1.0, clusters.length / 5), // Normalize
        exampleEvents: largestCluster.slice(0, 5).map(e => e.id),
        metadata: {
          clusterCount: clusters.length,
          largestClusterSize: largestCluster.length,
        },
      };
    }

    return null;
  }

  /**
   * Detect regular intervals (basic)
   */
  private detectRegularIntervals(events: Event[]): TemporalPattern | null {
    const eventsWithTimestamps = events.filter(e => e.timestamp);
    if (eventsWithTimestamps.length < 4) return null;

    const sorted = eventsWithTimestamps.sort(
      (a, b) => new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime()
    );

    // Calculate intervals between consecutive events
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prevDate = new Date(sorted[i - 1].timestamp!);
      const currDate = new Date(sorted[i].timestamp!);
      const days = differenceInDays(currDate, prevDate);
      intervals.push(days);
    }

    // Check if intervals are relatively consistent (within 20% variance)
    if (intervals.length < 3) return null;

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => {
      return sum + Math.pow(interval - avgInterval, 2);
    }, 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / avgInterval;

    // If CV < 0.2, intervals are relatively regular
    if (coefficientOfVariation < 0.2 && avgInterval > 0) {
      return {
        patternType: 'regular_intervals',
        score: Math.min(1.0, 1 - coefficientOfVariation),
        exampleEvents: sorted.slice(0, 5).map(e => e.id),
        metadata: {
          averageIntervalDays: Math.round(avgInterval),
          coefficientOfVariation,
        },
      };
    }

    return null;
  }
}

