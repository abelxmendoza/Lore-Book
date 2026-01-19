import { logger } from '../../logger';

import type { LegacySignal, LegacyContext, LegacyDomain } from './types';

/**
 * Extracts legacy signals from journal entries
 */
export class LegacyExtractor {
  /**
   * Extract legacy signals from context
   */
  extract(ctx: LegacyContext): LegacySignal[] {
    const signals: LegacySignal[] = [];

    try {
      const entries = ctx.entries || [];

      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        const contentLower = content.toLowerCase();
        const sentiment = entry.sentiment || this.estimateSentiment(content);

        // Legacy domain patterns
        const patterns: Array<{ domain: LegacyDomain; regex: RegExp }> = [
          { domain: 'tech', regex: /(building.*omega|robot|startup|engine|system|software|legacy code|programming|developing|creating.*app|building.*platform)/ },
          { domain: 'craft', regex: /(art|music|writing|creating|drawing|designing|composing|craft|artistic|creative work|paint|sculpt)/ },
          { domain: 'martial', regex: /(fight|bjj|muay thai|training|competing|strength|discipline|martial arts|judo|karate|boxing|mma)/ },
          { domain: 'family', regex: /(family|mom|dad|grandma|grandpa|heritage|mexican|roots|ancestors|lineage|tradition)/ },
          { domain: 'mentor', regex: /(mentoring|teaching|guiding|coaching|helping.*learn|sharing.*knowledge|passing.*on)/ },
          { domain: 'impact', regex: /(helping|teaching|inspiring|guiding|making.*difference|changing.*lives|impact|influence)/ },
          { domain: 'identity', regex: /(who i am|my purpose|meaning|path|calling|destiny|legacy|what i'll be remembered|my story)/ },
          { domain: 'heritage', regex: /(heritage|culture|tradition|roots|ancestry|lineage|family history|legacy|inheritance)/ },
          { domain: 'teaching', regex: /(teaching|educating|sharing knowledge|passing on|mentoring|guiding|instructing)/ },
        ];

        // Check for legacy patterns
        for (const pattern of patterns) {
          if (pattern.regex.test(contentLower)) {
            const intensity = this.calculateIntensity(content, sentiment);
            const direction = this.determineDirection(contentLower);

            signals.push({
              id: `legacy_${entry.id}_${pattern.domain}_${Date.now()}`,
              timestamp: entry.date || entry.created_at || entry.timestamp || new Date().toISOString(),
              domain: pattern.domain,
              intensity,
              direction,
              text: content.substring(0, 500),
              entry_id: entry.id,
              metadata: {
                source_entry_id: entry.id,
                sentiment,
              },
            });
          }
        }

        // Negative legacy signals (regret, wasted time, lost years)
        if (this.isNegativeLegacy(contentLower)) {
          const domain = this.determineNegativeLegacyDomain(contentLower);
          signals.push({
            id: `legacy_${entry.id}_negative_${Date.now()}`,
            timestamp: entry.date || entry.created_at || entry.timestamp || new Date().toISOString(),
            domain,
            intensity: 0.7,
            direction: -1,
            text: content.substring(0, 500),
            entry_id: entry.id,
            metadata: {
              source_entry_id: entry.id,
              sentiment,
              is_negative_legacy: true,
            },
          });
        }
      }

      logger.debug({ signals: signals.length, entries: entries.length }, 'Extracted legacy signals');

      return signals;
    } catch (error) {
      logger.error({ error }, 'Failed to extract legacy signals');
      return [];
    }
  }

  /**
   * Calculate intensity of legacy signal
   */
  private calculateIntensity(text: string, sentiment: number): number {
    const textLower = text.toLowerCase();

    // Base intensity from sentiment (normalized to 0-1)
    let intensity = Math.max(0, (sentiment + 1) / 2);

    // Boost for strong legacy indicators
    const strongIndicators = [
      'legacy',
      'remembered',
      'forever',
      'lasting',
      'permanent',
      'impact',
      'influence',
      'purpose',
      'meaning',
      'destiny',
      'calling',
      'heritage',
      'tradition',
      'passing on',
      'teaching',
      'mentoring',
    ];

    if (strongIndicators.some(indicator => textLower.includes(indicator))) {
      intensity = Math.min(1, intensity + 0.3);
    }

    // Boost for long-term thinking
    const longTermIndicators = [
      'years from now',
      'future',
      'generations',
      'long-term',
      'forever',
      'always',
      'never forget',
    ];

    if (longTermIndicators.some(indicator => textLower.includes(indicator))) {
      intensity = Math.min(1, intensity + 0.2);
    }

    return Math.max(0, Math.min(1, intensity));
  }

  /**
   * Determine direction of legacy signal
   */
  private determineDirection(textLower: string): 1 | -1 {
    // Negative legacy indicators
    const negativeIndicators = [
      'regret',
      'wasted time',
      'lost years',
      'missed opportunity',
      'should have',
      'wish i had',
      'failed legacy',
      'broken tradition',
    ];

    if (negativeIndicators.some(indicator => textLower.includes(indicator))) {
      return -1;
    }

    return 1;
  }

  /**
   * Check if text indicates negative legacy
   */
  private isNegativeLegacy(textLower: string): boolean {
    const negativeMarkers = [
      'regret',
      'wasted time',
      'lost years',
      'missed opportunity',
      'should have done',
      'wish i had',
      'failed',
      'broken',
    ];

    return negativeMarkers.some(marker => textLower.includes(marker));
  }

  /**
   * Determine domain for negative legacy
   */
  private determineNegativeLegacyDomain(textLower: string): LegacyDomain {
    if (textLower.includes('family') || textLower.includes('heritage') || textLower.includes('tradition')) {
      return 'family';
    }
    if (textLower.includes('career') || textLower.includes('work') || textLower.includes('tech')) {
      return 'tech';
    }
    if (textLower.includes('art') || textLower.includes('creative') || textLower.includes('craft')) {
      return 'craft';
    }

    return 'identity'; // Default to identity
  }

  /**
   * Estimate sentiment from text if not provided
   */
  private estimateSentiment(text: string): number {
    const textLower = text.toLowerCase();

    // Positive indicators
    const positiveMarkers = [
      'happy', 'glad', 'excited', 'great', 'wonderful', 'amazing', 'love', 'enjoyed', 'fun', 'good', 'better', 'best',
      'proud', 'grateful', 'thankful', 'blessed', 'lucky', 'pleased', 'satisfied', 'content',
    ];
    const positiveCount = positiveMarkers.filter(m => textLower.includes(m)).length;

    // Negative indicators
    const negativeMarkers = [
      'sad', 'angry', 'frustrated', 'disappointed', 'upset', 'worried', 'anxious', 'stressed', 'tired', 'exhausted',
      'bad', 'worse', 'worst', 'hate', 'regret', 'guilty', 'ashamed', 'embarrassed', 'hurt', 'pain',
    ];
    const negativeCount = negativeMarkers.filter(m => textLower.includes(m)).length;

    // Calculate sentiment (-1 to +1)
    if (positiveCount === 0 && negativeCount === 0) return 0;
    const total = positiveCount + negativeCount;
    return (positiveCount - negativeCount) / total;
  }
}

