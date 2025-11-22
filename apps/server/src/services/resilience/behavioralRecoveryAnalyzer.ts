import { logger } from '../../logger';
import type { ResilienceInsight, ResilienceContext } from './types';

/**
 * Analyzes behavioral recovery after setbacks
 */
export class BehavioralRecoveryAnalyzer {
  /**
   * Analyze behavioral recovery
   */
  analyze(ctx: ResilienceContext): ResilienceInsight[] {
    const insights: ResilienceInsight[] = [];

    try {
      const entries = ctx.entries || [];

      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        const contentLower = content.toLowerCase();

        if (this.looksLikeBehavioralRecovery(contentLower)) {
          insights.push({
            id: crypto.randomUUID(),
            type: 'behavioral_recovery',
            message: `Behavioral recovery detected: "${this.extractRecoveryAction(content)}"`,
            confidence: 0.85,
            timestamp: entry.date || entry.created_at || entry.timestamp || new Date().toISOString(),
            metadata: {
              recovery_action: this.extractRecoveryAction(content),
              source_entry_id: entry.id,
            },
          });
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to analyze behavioral recovery');
    }

    return insights;
  }

  /**
   * Check if text looks like behavioral recovery
   */
  private looksLikeBehavioralRecovery(text: string): boolean {
    const recoveryMarkers = [
      'got back up',
      'got back on',
      'started again',
      'back on track',
      'back to',
      'resumed',
      'restarted',
      'picked myself up',
      'bounced back',
      'recovered',
      'recovering',
      'moving forward',
      'moving ahead',
      'pushing through',
      'persevering',
      'persisting',
      'not giving up',
      'won\'t give up',
      'refusing to quit',
      'staying strong',
      'keeping going',
      'continuing',
      'pressing on',
      'fighting back',
      'fighting through',
      'overcoming',
      'pushing past',
      'getting through',
      'making progress',
      'rebuilding',
      'starting fresh',
      'new beginning',
      'turning things around',
      'making a comeback',
    ];

    return recoveryMarkers.some(marker => text.includes(marker));
  }

  /**
   * Extract recovery action from text
   */
  private extractRecoveryAction(text: string): string {
    // Try to extract the action
    const sentences = text.split(/[.!?]/);
    const firstSentence = sentences[0] || text;

    // Look for action patterns
    const actionPatterns = [
      /(?:got back|started|resumed|restarted|picked myself up|bounced back|recovered|moving forward|pushing through|persevering|overcoming|rebuilding|turning things around|making a comeback)\s+([^.!?]+)/i,
    ];

    for (const pattern of actionPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim().substring(0, 100);
      }
    }

    // Fallback: take first 80 characters
    return firstSentence.trim().substring(0, 80);
  }
}

