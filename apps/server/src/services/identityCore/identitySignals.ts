import { randomUUID } from 'crypto';

import { logger } from '../../logger';

import type { IdentitySignal, IdentitySignalType } from './identityTypes';

/**
 * Extracts identity signals from journal entries
 */
export class IdentitySignalExtractor {
  private readonly patterns: Array<{ type: IdentitySignalType; regex: RegExp }> = [
    { type: 'value', regex: /(i value|i believe|important to me|i care about|matters to me|i prioritize)/i },
    { type: 'belief', regex: /(i think|i believe that|my philosophy|i hold that|my view is)/i },
    { type: 'desire', regex: /(i want|i wish|i crave|i'm aiming for|i hope for|i long for)/i },
    { type: 'fear', regex: /(i'm afraid|i fear|i worry|i doubt|i'm scared|i'm anxious about)/i },
    { type: 'strength', regex: /(i'm good at|i'm strong when|my advantage|i excel at|i'm skilled in)/i },
    { type: 'weakness', regex: /(i struggle with|i'm bad at|my weakness|i fail at|i'm terrible at)/i },
    { type: 'self_label', regex: /(i am|i'm the type|i define myself|i see myself as|i consider myself)/i },
    { type: 'shadow', regex: /(my dark side|i sabotage|my worst self|my destructive side|i self-destruct)/i },
    { type: 'aspiration', regex: /(future me|i want to become|my dream self|i aspire to be|i'm working toward)/i },
    { type: 'identity_statement', regex: /(this is who i am|i realized that i'm|i've learned i'm|i discovered that i)/i },
  ];

  /**
   * Extract identity signals from entries
   */
  extract(entries: any[]): IdentitySignal[] {
    const signals: IdentitySignal[] = [];

    try {
      for (const entry of entries) {
        if (!entry.text || !entry.id || !entry.timestamp) continue;

        const text = entry.text;

        for (const pattern of this.patterns) {
          if (pattern.regex.test(text)) {
            // Calculate weight based on emotional intensity
            const emotionalWords = (text.match(/\b(very|extremely|deeply|intensely|profoundly|strongly)\b/gi) || []).length;
            const weight = Math.min(1, 0.3 + emotionalWords * 0.15);

            signals.push({
              id: randomUUID(),
              type: pattern.type,
              text: text,
              evidence: text,
              timestamp: entry.timestamp,
              weight,
              confidence: 0.75,
              memory_id: entry.id,
            });
            // Don't break - one entry can have multiple identity signals
          }
        }
      }

      logger.debug({ count: signals.length }, 'Extracted identity signals');
    } catch (error) {
      logger.error({ error }, 'Error extracting identity signals');
    }

    return signals;
  }
}

