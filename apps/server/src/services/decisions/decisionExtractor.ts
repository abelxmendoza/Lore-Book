import { logger } from '../../logger';

import type { Decision, DecisionContext } from './types';

/**
 * Extracts decisions from journal entries
 */
export class DecisionExtractor {
  /**
   * Extract decisions from context
   */
  extract(ctx: DecisionContext): Decision[] {
    const decisions: Decision[] = [];

    try {
      const entries = ctx.entries || [];

      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        if (this.looksLikeDecision(content)) {
          const decision = this.parseDecision(content, entry);
          if (decision) {
            decisions.push(decision);
          }
        }
      }

      logger.debug({ decisions: decisions.length, entries: entries.length }, 'Extracted decisions');

      return decisions;
    } catch (error) {
      logger.error({ error }, 'Failed to extract decisions');
      return [];
    }
  }

  /**
   * Check if text looks like a decision
   */
  private looksLikeDecision(text: string): boolean {
    const content = text.toLowerCase();

    // Decision markers
    const phrases = [
      'i decided to',
      'i chose to',
      'i ended up',
      'i made the choice to',
      "i'm thinking about doing",
      'i might do',
      'i will do',
      'i should do',
      'i need to decide',
      'i have to choose',
      'i opted to',
      'i went with',
      'i picked',
      'i selected',
      'my decision was',
      'i made up my mind',
      'i concluded',
      'i resolved to',
      'i determined',
      'i settled on',
      'i committed to',
      'i plan to',
      'i intend to',
      'i will choose',
      'i am going to',
    ];

    return phrases.some(p => content.includes(p));
  }

  /**
   * Parse decision from text
   */
  private parseDecision(text: string, entry: any): Decision | null {
    try {
      // Extract decision description
      const description = this.extractDecisionDescription(text);
      if (!description) return null;

      // Categorize decision
      const category = this.categorizeDecision(description);

      // Extract alternatives if mentioned
      const alternatives = this.extractAlternatives(text);

      return {
        id: `dec_${entry.id}_${Date.now()}`,
        description,
        timestamp: entry.date || entry.created_at || entry.timestamp || new Date().toISOString(),
        category,
        alternatives_considered: alternatives.length > 0 ? alternatives : undefined,
        metadata: {
          source_entry_id: entry.id,
          extracted_from: text.substring(0, 200),
        },
      };
    } catch (error) {
      logger.error({ error }, 'Failed to parse decision');
      return null;
    }
  }

  /**
   * Extract decision description
   */
  private extractDecisionDescription(text: string): string | null {
    // Look for decision phrases and extract what follows
    const decisionPatterns = [
      /(?:i decided to|i chose to|i ended up|i made the choice to|i opted to|i went with|i picked|i selected|my decision was|i made up my mind|i concluded|i resolved to|i determined|i settled on|i committed to)\s+([^.!?]+)/i,
      /(?:i'm thinking about doing|i might do|i will do|i should do|i plan to|i intend to|i am going to)\s+([^.!?]+)/i,
      /(?:i need to decide|i have to choose)\s+([^.!?]+)/i,
    ];

    for (const pattern of decisionPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim().substring(0, 200);
      }
    }

    // Fallback: take first sentence
    const firstSentence = text.split(/[.!?]/)[0];
    if (firstSentence.length > 10) {
      return firstSentence.trim().substring(0, 200);
    }

    return null;
  }

  /**
   * Categorize decision
   */
  private categorizeDecision(description: string): string {
    const descLower = description.toLowerCase();

    if (descLower.includes('career') || descLower.includes('job') || descLower.includes('work') || descLower.includes('promotion')) {
      return 'career';
    }
    if (descLower.includes('relationship') || descLower.includes('dating') || descLower.includes('marriage') || descLower.includes('breakup')) {
      return 'relationship';
    }
    if (descLower.includes('health') || descLower.includes('exercise') || descLower.includes('diet') || descLower.includes('medical')) {
      return 'health';
    }
    if (descLower.includes('financial') || descLower.includes('money') || descLower.includes('investment') || descLower.includes('purchase') || descLower.includes('buy')) {
      return 'financial';
    }
    if (descLower.includes('education') || descLower.includes('learn') || descLower.includes('study') || descLower.includes('course')) {
      return 'education';
    }
    if (descLower.includes('move') || descLower.includes('relocate') || descLower.includes('travel') || descLower.includes('trip')) {
      return 'location';
    }
    if (descLower.includes('family') || descLower.includes('parent') || descLower.includes('child')) {
      return 'family';
    }
    if (descLower.includes('social') || descLower.includes('friend') || descLower.includes('party') || descLower.includes('event')) {
      return 'social';
    }

    return 'other';
  }

  /**
   * Extract alternatives mentioned
   */
  private extractAlternatives(text: string): string[] {
    const alternatives: string[] = [];
    const content = text.toLowerCase();

    // Look for alternative patterns
    const alternativePatterns = [
      /(?:instead of|rather than|or|either|between)\s+([^.!?]+)/gi,
      /(?:option|choice|alternative)\s+(?:a|b|1|2|one|two)[:\s]+([^.!?]+)/gi,
    ];

    for (const pattern of alternativePatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          const alt = match[1].trim();
          if (alt.length > 5 && alt.length < 100) {
            alternatives.push(alt);
          }
        }
      }
    }

    return alternatives.slice(0, 5); // Limit to 5 alternatives
  }
}

