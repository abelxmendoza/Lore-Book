import { logger } from '../../logger';

/**
 * Detects emotional triggers from text
 */
export function detectTriggers(text: string): string[] {
  const triggers: string[] = [];

  try {
    const triggerPatterns: Array<{ trigger: string; regex: RegExp }> = [
      { trigger: 'rejection', regex: /(rejected|ignored|dismissed|excluded|left out|abandoned)/i },
      { trigger: 'conflict', regex: /(argument|fight|disagreement|confrontation|dispute|tension)/i },
      { trigger: 'disrespect', regex: /(disrespected|insulted|belittled|dismissed|disregarded)/i },
      { trigger: 'money_stress', regex: /(broke|poor|debt|financial|money|bills|expenses|can't afford)/i },
      { trigger: 'loneliness', regex: /(lonely|alone|isolated|no one|nobody|by myself)/i },
      { trigger: 'competition', regex: /(competition|rival|better than me|outperformed|lost to)/i },
      { trigger: 'failure', regex: /(failed|messed up|screwed up|didn't make it|lost)/i },
      { trigger: 'criticism', regex: /(criticized|judged|attacked|blamed|fault|wrong)/i },
      { trigger: 'uncertainty', regex: /(uncertain|unknown|unclear|confused|don't know|unsure)/i },
      { trigger: 'overwhelm', regex: /(overwhelmed|too much|can't handle|stressed|pressure)/i },
    ];

    for (const pattern of triggerPatterns) {
      if (pattern.regex.test(text)) {
        triggers.push(pattern.trigger);
      }
    }

    logger.debug({ count: triggers.length }, 'Detected triggers');
  } catch (error) {
    logger.error({ error }, 'Error detecting triggers');
  }

  return triggers;
}

