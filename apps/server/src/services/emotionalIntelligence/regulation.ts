import { logger } from '../../logger';

/**
 * Detects regulation strategies from text
 */
export function detectRegulation(text: string): string | null {
  try {
    const regulationPatterns: Array<{ strategy: string; regex: RegExp }> = [
      { strategy: 'training', regex: /(trained|worked out|gym|bjj|muay thai|sparred|rolled)/i },
      { strategy: 'journaling', regex: /(wrote|journaled|documented|reflected|put it down)/i },
      { strategy: 'coding', regex: /(coded|programmed|built|developed|worked on project)/i },
      { strategy: 'walking', regex: /(walked|went for a walk|strolled|hiked)/i },
      { strategy: 'sleeping', regex: /(slept|went to bed|rested|napped)/i },
      { strategy: 'smoking', regex: /(smoked|had a cigarette|vaped)/i },
      { strategy: 'music', regex: /(listened to music|played music|sang|danced)/i },
      { strategy: 'social', regex: /(talked to|called|hung out|met up|socialized)/i },
      { strategy: 'meditation', regex: /(meditated|breathed|mindfulness|calmed down)/i },
      { strategy: 'eating', regex: /(ate|food|meal|snack|comfort food)/i },
      { strategy: 'gaming', regex: /(played games|gaming|video game)/i },
      { strategy: 'reading', regex: /(read|book|article|studied)/i },
    ];

    for (const pattern of regulationPatterns) {
      if (pattern.regex.test(text)) {
        return pattern.strategy;
      }
    }

    return null;
  } catch (error) {
    logger.error({ error }, 'Error detecting regulation strategy');
    return null;
  }
}

