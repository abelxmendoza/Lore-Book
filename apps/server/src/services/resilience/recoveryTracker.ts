import { parseISO, isAfter, differenceInDays } from 'date-fns';

import { logger } from '../../logger';

import type { Setback, ResilienceInsight, ResilienceContext } from './types';

/**
 * Tracks recovery from setbacks
 */
export class RecoveryTracker {
  /**
   * Track recovery for setbacks
   */
  track(setbacks: Setback[], ctx: ResilienceContext): ResilienceInsight[] {
    const insights: ResilienceInsight[] = [];

    try {
      const entries = ctx.entries || [];
      const identityPulse = ctx.identity_pulse || {};
      const sentimentTrend = identityPulse.sentiment_trend || identityPulse.sentimentTrend || [];

      for (const setback of setbacks) {
        const recoveryPoint = this.detectRecoveryPoint(setback, entries, sentimentTrend);

        if (recoveryPoint) {
          insights.push({
            id: crypto.randomUUID(),
            type: 'recovery_started',
            message: `Recovery started after setback: "${setback.reason.substring(0, 60)}..."`,
            confidence: 0.8,
            timestamp: recoveryPoint.timestamp,
            related_setback_id: setback.id,
            metadata: {
              recovery_start: recoveryPoint.timestamp,
              days_after_setback: recoveryPoint.daysAfter,
              sentiment_at_recovery: recoveryPoint.sentiment,
            },
          });

          // Check if recovery is complete
          const recoveryComplete = this.detectRecoveryComplete(setback, recoveryPoint.timestamp, entries, sentimentTrend);
          if (recoveryComplete) {
            insights.push({
              id: crypto.randomUUID(),
              type: 'recovery_completed',
              message: `Recovery completed after setback: "${setback.reason.substring(0, 60)}..."`,
              confidence: 0.85,
              timestamp: recoveryComplete.timestamp,
              related_setback_id: setback.id,
              metadata: {
                recovery_start: recoveryPoint.timestamp,
                recovery_end: recoveryComplete.timestamp,
                recovery_duration_days: recoveryComplete.durationDays,
              },
            });
          }
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to track recovery');
    }

    return insights;
  }

  /**
   * Detect recovery point after setback
   */
  private detectRecoveryPoint(
    setback: Setback,
    entries: any[],
    sentimentTrend: any[]
  ): { timestamp: string; daysAfter: number; sentiment: number } | null {
    try {
      const setbackDate = parseISO(setback.timestamp);

      // Get entries after setback
      const laterEntries = entries.filter(e => {
        const entryDate = parseISO(e.date || e.created_at || e.timestamp);
        return isAfter(entryDate, setbackDate);
      });

      // Look for recovery indicators in entries
      for (const entry of laterEntries.slice(0, 20)) {
        const content = (entry.content || entry.text || '').toLowerCase();
        const entryDate = parseISO(entry.date || entry.created_at || entry.timestamp);
        const daysAfter = differenceInDays(entryDate, setbackDate);

        // Check for recovery markers
        if (
          content.includes('feeling better') ||
          content.includes('back on track') ||
          content.includes('recovered') ||
          content.includes('moving forward') ||
          content.includes('getting better') ||
          content.includes('improving') ||
          content.includes('bounce back') ||
          content.includes('recovered from')
        ) {
          // Find sentiment at this point
          const sentiment = this.getSentimentAtTime(entryDate, sentimentTrend);

          return {
            timestamp: entry.date || entry.created_at || entry.timestamp,
            daysAfter,
            sentiment: sentiment || 0,
          };
        }
      }

      // Check sentiment trend for recovery
      const recoveryFromSentiment = this.detectRecoveryFromSentiment(setback, laterEntries, sentimentTrend);
      if (recoveryFromSentiment) {
        return recoveryFromSentiment;
      }

      return null;
    } catch (error) {
      logger.error({ error }, 'Failed to detect recovery point');
      return null;
    }
  }

  /**
   * Detect recovery from sentiment trend
   */
  private detectRecoveryFromSentiment(
    setback: Setback,
    laterEntries: any[],
    sentimentTrend: any[]
  ): { timestamp: string; daysAfter: number; sentiment: number } | null {
    try {
      const setbackDate = parseISO(setback.timestamp);

      // Find sentiment values after setback
      const postSetbackSentiments = sentimentTrend
        .filter(s => {
          const sDate = parseISO(s.timestamp || s.date);
          return isAfter(sDate, setbackDate);
        })
        .slice(0, 10);

      if (postSetbackSentiments.length === 0) {
        return null;
      }

      // Check if sentiment is rising and crosses into positive
      for (let i = 1; i < postSetbackSentiments.length; i++) {
        const prev = postSetbackSentiments[i - 1];
        const curr = postSetbackSentiments[i];

        const prevValue = prev.value || prev.sentiment || 0;
        const currValue = curr.value || curr.sentiment || 0;

        // Recovery detected if sentiment crosses above 0 or shows consistent improvement
        if (currValue > 0 || (currValue > prevValue && currValue > -0.3)) {
          const sDate = parseISO(curr.timestamp || curr.date);
          const daysAfter = differenceInDays(sDate, setbackDate);

          return {
            timestamp: curr.timestamp || curr.date,
            daysAfter,
            sentiment: currValue,
          };
        }
      }

      return null;
    } catch (error) {
      logger.error({ error }, 'Failed to detect recovery from sentiment');
      return null;
    }
  }

  /**
   * Detect if recovery is complete
   */
  private detectRecoveryComplete(
    setback: Setback,
    recoveryStart: string,
    entries: any[],
    sentimentTrend: any[]
  ): { timestamp: string; durationDays: number } | null {
    try {
      const recoveryStartDate = parseISO(recoveryStart);

      // Get entries after recovery started
      const postRecoveryEntries = entries.filter(e => {
        const entryDate = parseISO(e.date || e.created_at || e.timestamp);
        return isAfter(entryDate, recoveryStartDate);
      });

      // Look for completion indicators
      for (const entry of postRecoveryEntries.slice(0, 15)) {
        const content = (entry.content || entry.text || '').toLowerCase();
        const entryDate = parseISO(entry.date || entry.created_at || entry.timestamp);
        const durationDays = differenceInDays(entryDate, recoveryStartDate);

        // Recovery complete if sentiment is consistently positive or explicit completion markers
        if (
          content.includes('fully recovered') ||
          content.includes('back to normal') ||
          content.includes('over it') ||
          content.includes('moved on') ||
          (durationDays >= 7 && this.isSentimentStable(entryDate, sentimentTrend))
        ) {
          return {
            timestamp: entry.date || entry.created_at || entry.timestamp,
            durationDays,
          };
        }
      }

      return null;
    } catch (error) {
      logger.error({ error }, 'Failed to detect recovery complete');
      return null;
    }
  }

  /**
   * Check if sentiment is stable and positive
   */
  private isSentimentStable(timestamp: string, sentimentTrend: any[]): boolean {
    const targetDate = parseISO(timestamp);
    const recentSentiments = sentimentTrend
      .filter(s => {
        const sDate = parseISO(s.timestamp || s.date);
        const daysDiff = Math.abs(differenceInDays(sDate, targetDate));
        return daysDiff <= 3;
      })
      .map(s => s.value || s.sentiment || 0);

    if (recentSentiments.length === 0) return false;

    const avg = recentSentiments.reduce((a, b) => a + b, 0) / recentSentiments.length;
    return avg > 0.2; // Positive and stable
  }

  /**
   * Get sentiment at specific time
   */
  private getSentimentAtTime(timestamp: Date, sentimentTrend: any[]): number | null {
    const closest = sentimentTrend
      .map(s => ({
        date: parseISO(s.timestamp || s.date),
        value: s.value || s.sentiment || 0,
      }))
      .sort((a, b) => Math.abs(a.date.getTime() - timestamp.getTime()) - Math.abs(b.date.getTime() - timestamp.getTime()))[0];

    return closest ? closest.value : null;
  }
}

