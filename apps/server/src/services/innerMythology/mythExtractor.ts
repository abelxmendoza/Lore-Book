import { logger } from '../../logger';
import { randomUUID } from 'crypto';
import type { MythElement, MythCategory } from './mythTypes';

/**
 * Extracts mythological elements from journal entries
 */
export class MythExtractor {
  private readonly patterns: Array<{ cat: MythCategory; regex: RegExp }> = [
    { cat: 'hero', regex: /(i overcame|i fought|i pushed through|i rose up|i conquered|i defeated|i won)/i },
    { cat: 'villain', regex: /(enemy|opponent|threat|someone vs me|adversary|foe)/i },
    { cat: 'guide', regex: /(mentor|coach|teacher|sensei|advisor|guide|instructor)/i },
    { cat: 'shadow', regex: /(my darker side|i sabotaged|i messed myself up|self-destructive|my worst self)/i },
    { cat: 'monster', regex: /(demon|beast|creature|the worst version|monster|horror)/i },
    { cat: 'guardian', regex: /(gatekeeper|blocked me|they stopped me|barrier|protector)/i },
    { cat: 'temptation', regex: /(tempted|i almost|i wanted to give in|seduced|lured)/i },
    { cat: 'obstacle', regex: /(struggle|barrier|roadblock|delay|challenge|hurdle)/i },
    { cat: 'quest', regex: /(mission|goal|journey|epic|adventure|quest|purpose)/i },
    { cat: 'prophecy', regex: /(i feel destined|i think i'm meant to|fate|destiny|prophecy)/i },
    { cat: 'symbol', regex: /(symbol|sign|vision|image|recurring|meaningful|represents)/i },
    { cat: 'inner_realm', regex: /(in my world|in my mind|my universe|inner world|mental realm)/i },
  ];

  /**
   * Extract mythological elements from entries
   */
  extract(entries: any[]): MythElement[] {
    const out: MythElement[] = [];

    try {
      for (const entry of entries) {
        if (!entry.text || !entry.id || !entry.timestamp) continue;

        const text = entry.text;

        for (const pattern of this.patterns) {
          if (pattern.regex.test(text)) {
            // Calculate intensity based on emotional words
            const emotionalWords = (text.match(/\b(intense|powerful|overwhelming|deep|strong|fierce)\b/gi) || []).length;
            const intensity = Math.min(1, 0.3 + emotionalWords * 0.15);

            // Calculate symbolic weight based on archetypal language
            const symbolicWords = (text.match(/\b(archetypal|mythical|legendary|epic|timeless|universal)\b/gi) || []).length;
            const symbolic_weight = Math.min(1, 0.4 + symbolicWords * 0.2);

            out.push({
              id: randomUUID(),
              category: pattern.cat,
              text: text,
              evidence: text,
              timestamp: entry.timestamp,
              intensity,
              symbolic_weight,
              confidence: 0.7,
              memory_id: entry.id,
            });
            // Don't break - one entry can have multiple myth elements
          }
        }
      }

      logger.debug({ count: out.length }, 'Extracted myth elements');
    } catch (error) {
      logger.error({ error }, 'Error extracting myth elements');
    }

    return out;
  }
}

