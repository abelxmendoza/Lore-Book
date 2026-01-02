import { logger } from '../../logger';

/**
 * Extracts emotional triggers from text
 */
export class TriggerExtractor {
  private readonly patterns = [
    { trigger: 'conflict', regex: /(argue|fight|beef|conflict|clash|disagreement|dispute)/i },
    { trigger: 'rejection', regex: /(ignored|curved|rejected|turned me down|ghosted|dismissed)/i },
    { trigger: 'work stress', regex: /(deadline|workload|stressed at work|work pressure|overwhelmed at work)/i },
    { trigger: 'loneliness', regex: /(alone|lonely|isolated|by myself|no one|nobody)/i },
    { trigger: 'competition', regex: /(beat|win|lose|compete|spar|match|tournament)/i },
    { trigger: 'money issues', regex: /(broke|money|financial|can't afford|expensive|bills)/i },
    { trigger: 'relationship', regex: /(girl|date|relationship|breakup|ex|partner)/i },
    { trigger: 'health', regex: /(sick|pain|injury|hurt|ache|illness)/i },
    { trigger: 'failure', regex: /(failed|mistake|wrong|screwed up|messed up)/i },
    { trigger: 'success', regex: /(succeeded|achieved|accomplished|won|completed)/i },
  ];

  /**
   * Extract triggers from text
   */
  extract(text: string): string[] {
    try {
      const triggers: string[] = [];

      for (const pattern of this.patterns) {
        if (pattern.regex.test(text)) {
          triggers.push(pattern.trigger);
        }
      }

      return triggers;
    } catch (error) {
      logger.error({ error }, 'Failed to extract triggers');
      return [];
    }
  }
}

