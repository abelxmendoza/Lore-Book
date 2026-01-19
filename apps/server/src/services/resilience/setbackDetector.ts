import { logger } from '../../logger';

import type { Setback, ResilienceContext } from './types';

/**
 * Detects setbacks from journal entries
 */
export class SetbackDetector {
  /**
   * Detect setbacks from context
   */
  detect(ctx: ResilienceContext): Setback[] {
    const setbacks: Setback[] = [];

    try {
      const entries = ctx.entries || [];
      const identityPulse = ctx.identity_pulse || {};
      const latestSentiment = identityPulse.latest_sentiment || identityPulse.latestSentiment || 0;

      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        const contentLower = content.toLowerCase();

        // Check for setback indicators
        if (this.looksLikeSetback(contentLower, latestSentiment)) {
          const severity = this.calculateSeverity(contentLower);
          const category = this.categorizeSetback(contentLower);

          setbacks.push({
            id: `set_${entry.id}_${Date.now()}`,
            timestamp: entry.date || entry.created_at || entry.timestamp || new Date().toISOString(),
            reason: this.extractReason(content),
            severity,
            category,
            metadata: {
              source_entry_id: entry.id,
              sentiment_at_time: latestSentiment,
              extracted_from: content.substring(0, 200),
            },
          });
        }
      }

      logger.debug({ setbacks: setbacks.length, entries: entries.length }, 'Detected setbacks');

      return setbacks;
    } catch (error) {
      logger.error({ error }, 'Failed to detect setbacks');
      return [];
    }
  }

  /**
   * Check if text looks like a setback
   */
  private looksLikeSetback(text: string, sentiment: number): boolean {
    // Negative sentiment threshold
    if (sentiment < -0.5) {
      return true;
    }

    // Setback markers
    const markers = [
      'i messed up',
      'i messed things up',
      'regret',
      'i feel horrible',
      'i feel terrible',
      'i lost',
      'i failed',
      'failure',
      'disaster',
      'crisis',
      'panic',
      'devastated',
      'crushed',
      'broken',
      'defeated',
      'overwhelmed',
      'can\'t handle',
      'can\'t cope',
      'everything went wrong',
      'nothing is working',
      'i give up',
      'i quit',
      'burnout',
      'exhausted',
      'drained',
      'collapsed',
      'broke down',
      'hit rock bottom',
      'worst day',
      'terrible day',
      'awful day',
      'bad news',
      'disappointed',
      'let down',
      'betrayed',
      'hurt',
      'pain',
      'suffering',
      'struggling',
      'difficult time',
      'hard time',
      'rough patch',
    ];

    return markers.some(marker => text.includes(marker));
  }

  /**
   * Calculate severity of setback
   */
  private calculateSeverity(text: string): 'low' | 'medium' | 'high' {
    // High severity indicators
    const highSeverity = [
      'panic',
      'scared',
      'devastated',
      'crushed',
      'broken',
      'hit rock bottom',
      'can\'t handle',
      'can\'t cope',
      'everything went wrong',
      'disaster',
      'crisis',
      'collapsed',
      'broke down',
      'worst day',
      'terrible day',
      'awful day',
      'i give up',
      'i quit',
    ];

    // Medium severity indicators
    const mediumSeverity = [
      'sad',
      'frustrated',
      'disappointed',
      'let down',
      'hurt',
      'struggling',
      'difficult time',
      'hard time',
      'rough patch',
      'exhausted',
      'drained',
      'burnout',
    ];

    if (highSeverity.some(marker => text.includes(marker))) {
      return 'high';
    }
    if (mediumSeverity.some(marker => text.includes(marker))) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Categorize setback
   */
  private categorizeSetback(text: string): string {
    if (text.includes('work') || text.includes('job') || text.includes('career') || text.includes('boss')) {
      return 'work';
    }
    if (text.includes('relationship') || text.includes('friend') || text.includes('partner') || text.includes('breakup')) {
      return 'relationship';
    }
    if (text.includes('health') || text.includes('sick') || text.includes('ill') || text.includes('medical')) {
      return 'health';
    }
    if (text.includes('financial') || text.includes('money') || text.includes('debt') || text.includes('broke')) {
      return 'financial';
    }
    if (text.includes('family') || text.includes('parent') || text.includes('child')) {
      return 'family';
    }
    if (text.includes('academic') || text.includes('school') || text.includes('grade') || text.includes('exam')) {
      return 'academic';
    }

    return 'other';
  }

  /**
   * Extract reason from text
   */
  private extractReason(text: string): string {
    // Try to extract the main reason
    const sentences = text.split(/[.!?]/);
    const firstSentence = sentences[0] || text;

    // Look for reason patterns
    const reasonPatterns = [
      /(?:because|due to|since|after|when)\s+([^.!?]+)/i,
      /(?:i|i'm|i've|i'll)\s+(?:feel|felt|feeling|was|am|were|are)\s+([^.!?]+)/i,
    ];

    for (const pattern of reasonPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim().substring(0, 200);
      }
    }

    // Fallback: take first 120 characters
    return firstSentence.trim().substring(0, 120);
  }
}

