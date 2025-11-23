import { logger } from '../../logger';
import type { DriftEvent, DriftTrend } from './types';

/**
 * Detects relationship drift (growing, fading, unstable)
 */
export class DriftDetector {
  /**
   * Detect drift events from entries
   */
  detect(entries: any[]): DriftEvent[] {
    const driftEvents: DriftEvent[] = [];
    const history: Record<string, number[]> = {};

    try {
      // Build mention history
      const nameRegex = /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\b/g;
      const commonWords = new Set([
        'I', 'The', 'This', 'That', 'There', 'Then', 'When', 'Where',
        'What', 'Who', 'How', 'Why', 'Which', 'Monday', 'Tuesday',
        'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
        'Los', 'Angeles', 'Hollywood', 'California', 'America',
      ]);

      entries.forEach((entry, idx) => {
        const content = entry.content || entry.text || '';
        if (!content) return;

        const matches = content.match(nameRegex) || [];
        const names = matches.filter(name => !commonWords.has(name) && name.length > 2);

        names.forEach((name) => {
          if (!history[name]) {
            history[name] = [];
          }
          history[name].push(idx);
        });
      });

      // Analyze trends for each person
      Object.keys(history).forEach((name) => {
        const indices = history[name];

        if (indices.length < 2) return; // Need at least 2 mentions

        const trend = this.analyzeTrend(indices, entries.length);
        if (!trend) return;

        // Get evidence (recent entries mentioning this person)
        const recentIndices = indices.slice(-5);
        const evidence = recentIndices
          .map(idx => {
            const entry = entries[idx];
            return entry?.content || entry?.text || '';
          })
          .filter(text => text.length > 0)
          .slice(0, 3);

        if (evidence.length > 0) {
          driftEvents.push({
            id: `drift_${name}_${Date.now()}`,
            person: name,
            trend,
            evidence,
            confidence: this.calculateConfidence(indices, entries.length),
            timestamp: new Date().toISOString(),
            metadata: {
              total_mentions: indices.length,
              mention_indices: indices,
            },
          });
        }
      });

      logger.debug({ drift: driftEvents.length, people: Object.keys(history).length }, 'Detected drift events');

      return driftEvents;
    } catch (error) {
      logger.error({ error }, 'Failed to detect drift');
      return [];
    }
  }

  /**
   * Analyze trend from mention indices
   */
  private analyzeTrend(indices: number[], totalEntries: number): DriftTrend | null {
    if (indices.length < 2) return null;

    // Split into early and recent mentions
    const midpoint = Math.floor(totalEntries / 2);
    const early = indices.filter(idx => idx < midpoint);
    const recent = indices.filter(idx => idx >= midpoint);

    // Calculate mention rates
    const earlyRate = early.length / midpoint;
    const recentRate = recent.length / (totalEntries - midpoint);

    // Determine trend
    if (recent.length === 0) {
      return 'fading'; // No recent mentions
    }

    if (early.length === 0) {
      return 'growing'; // Only recent mentions
    }

    const ratio = recentRate / (earlyRate + 0.001); // Avoid division by zero

    if (ratio > 1.5) {
      return 'growing';
    } else if (ratio < 0.5) {
      return 'fading';
    } else if (Math.abs(ratio - 1) > 0.3) {
      return 'unstable';
    }

    return 'stable';
  }

  /**
   * Calculate confidence in drift detection
   */
  private calculateConfidence(indices: number[], totalEntries: number): number {
    if (indices.length < 2) return 0.3;

    // More mentions = higher confidence
    const mentionDensity = indices.length / totalEntries;
    const confidence = Math.min(1, mentionDensity * 10);

    return Math.max(0.3, confidence);
  }
}

