import { logger } from '../../logger';

import type { CopingStrategies } from './types';

/**
 * Detects coping behaviors (positive & negative)
 */
export class CopingDetector {
  /**
   * Detect coping strategies from entries
   */
  detect(entries: any[]): CopingStrategies {
    const strategies: CopingStrategies = {
      positive: [],
      negative: [],
      positive_count: 0,
      negative_count: 0,
      ratio: 0,
    };

    try {
      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        const contentLower = content.toLowerCase();
        const timestamp = entry.date || entry.created_at || entry.timestamp || new Date().toISOString();

        // Positive coping strategies
        const positivePatterns = [
          /(trained|worked out|exercise|gym|running|jogging|fitness)/,
          /(journaling|writing|reflecting|meditation|meditated|mindfulness)/,
          /(reading|studied|learning|education|book)/,
          /(cleaned|organized|tidied|decluttered)/,
          /(talked to|reached out|called|texted|connected with)/,
          /(hobby|creative|art|music|drawing|painting|playing)/,
          /(nature|outdoor|walk|hike|park|beach)/,
          /(therapy|counseling|support group|help)/,
          /(prayer|spiritual|faith|religion)/,
          /(volunteer|helping others|giving back)/,
        ];

        // Negative coping strategies
        const negativePatterns = [
          /(drank|drinking|alcohol|beer|wine|drunk)/,
          /(binged|binge|overate|ate too much|emotional eating)/,
          /(isolated|withdrew|stayed in|avoided|hid)/,
          /(self sabotage|self-sabotage|sabotaged myself)/,
          /(rage|angry outburst|yelled|screamed|lost it)/,
          /(argued|fought|conflict|drama)/,
          /(procrastinated|avoided|put off|delayed)/,
          /(shopping spree|spent too much|impulse buy)/,
          /(social media|scrolling|doom scrolling)/,
          /(substance|drug|smoking)/,
        ];

        // Check for positive coping
        for (const pattern of positivePatterns) {
          if (pattern.test(contentLower)) {
            strategies.positive.push(timestamp);
            strategies.positive_count++;
            break; // Count each entry only once
          }
        }

        // Check for negative coping
        for (const pattern of negativePatterns) {
          if (pattern.test(contentLower)) {
            strategies.negative.push(timestamp);
            strategies.negative_count++;
            break; // Count each entry only once
          }
        }
      }

      // Calculate ratio (positive / negative, or 0 if no negative)
      if (strategies.negative_count > 0) {
        strategies.ratio = strategies.positive_count / strategies.negative_count;
      } else if (strategies.positive_count > 0) {
        strategies.ratio = Infinity; // All positive, no negative
      } else {
        strategies.ratio = 0; // No coping strategies detected
      }

      logger.debug(
        {
          positive: strategies.positive_count,
          negative: strategies.negative_count,
          ratio: strategies.ratio,
        },
        'Detected coping strategies'
      );

      return strategies;
    } catch (error) {
      logger.error({ error }, 'Failed to detect coping strategies');
      return strategies;
    }
  }

  /**
   * Get coping strategy summary
   */
  getSummary(strategies: CopingStrategies): {
    dominant: 'positive' | 'negative' | 'balanced' | 'none';
    message: string;
  } {
    if (strategies.positive_count === 0 && strategies.negative_count === 0) {
      return {
        dominant: 'none',
        message: 'No clear coping strategies detected.',
      };
    }

    if (strategies.ratio > 2) {
      return {
        dominant: 'positive',
        message: `You're using primarily positive coping strategies (${strategies.positive_count} positive vs ${strategies.negative_count} negative).`,
      };
    }

    if (strategies.ratio < 0.5) {
      return {
        dominant: 'negative',
        message: `You're using more negative coping strategies (${strategies.negative_count} negative vs ${strategies.positive_count} positive). Consider developing healthier coping mechanisms.`,
      };
    }

    return {
      dominant: 'balanced',
      message: `You're using a mix of coping strategies (${strategies.positive_count} positive, ${strategies.negative_count} negative).`,
    };
  }
}

