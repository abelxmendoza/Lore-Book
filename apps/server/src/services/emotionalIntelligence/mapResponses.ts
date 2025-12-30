import { logger } from '../../logger';

/**
 * Maps behavior responses from text
 */
export function mapBehaviorResponse(text: string): string | null {
  try {
    const responsePatterns: Array<{ response: string; regex: RegExp }> = [
      { response: 'withdrawal', regex: /(shut down|withdrew|isolated|pulled away|retreated|closed off)/i },
      { response: 'aggression', regex: /(snapped|lashed out|exploded|yelled|attacked|fought back)/i },
      { response: 'overthinking', regex: /(overthink|ruminated|spiraled|obsessed|couldn't stop thinking)/i },
      { response: 'overwork', regex: /(worked harder|grinded|pushed through|kept going|didn't stop)/i },
      { response: 'dissociation', regex: /(zoned out|spaced out|numb|disconnected|checked out)/i },
      { response: 'avoidance', regex: /(avoided|ignored|put off|delayed|procrastinated|ran away)/i },
      { response: 'seeking_validation', regex: /(needed approval|wanted reassurance|sought comfort|asked for help)/i },
      { response: 'self_criticism', regex: /(blamed myself|self-doubt|i'm terrible|i messed up|hated myself)/i },
      { response: 'distraction', regex: /(distracted|escaped|got away|took my mind off)/i },
      { response: 'confrontation', regex: /(confronted|stood up|fought back|defended|spoke up)/i },
    ];

    for (const pattern of responsePatterns) {
      if (pattern.regex.test(text)) {
        return pattern.response;
      }
    }

    return null;
  } catch (error) {
    logger.error({ error }, 'Error mapping behavior response');
    return null;
  }
}

