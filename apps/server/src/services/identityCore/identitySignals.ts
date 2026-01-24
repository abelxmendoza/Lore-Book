import { randomUUID } from 'crypto';
import OpenAI from 'openai';

import { config } from '../../config';
import { logger } from '../../logger';

import type { IdentitySignal, IdentitySignalType } from './identityTypes';

const openai = new OpenAI({ apiKey: config.openAiKey });

/**
 * Extracts identity signals from journal entries
 */
export class IdentitySignalExtractor {
  private readonly patterns: Array<{ type: IdentitySignalType; regex: RegExp; negative?: RegExp }> = [
    { 
      type: 'value', 
      regex: /(i value|i believe|important to me|i care about|matters to me|i prioritize|what matters|what i value|my values)/i,
      negative: /(don't value|don't care|doesn't matter)/i
    },
    { 
      type: 'belief', 
      regex: /(i think|i believe that|my philosophy|i hold that|my view is|i'm convinced|i maintain|my stance)/i,
      negative: /(i don't think|i don't believe)/i
    },
    { 
      type: 'desire', 
      regex: /(i want|i wish|i crave|i'm aiming for|i hope for|i long for|i desire|i yearn|i aspire|my goal is)/i,
      negative: /(i don't want|i don't wish)/i
    },
    { 
      type: 'fear', 
      regex: /(i'm afraid|i fear|i worry|i doubt|i'm scared|i'm anxious about|i'm terrified|i dread|i'm concerned)/i,
      negative: /(i'm not afraid|i don't fear)/i
    },
    { 
      type: 'strength', 
      regex: /(i'm good at|i'm strong when|my advantage|i excel at|i'm skilled in|i'm talented|i'm capable|i'm proficient|i master)/i,
      negative: /(i'm not good|i'm bad at)/i
    },
    { 
      type: 'weakness', 
      regex: /(i struggle with|i'm bad at|my weakness|i fail at|i'm terrible at|i'm weak|i can't|i'm unable|i lack)/i,
      negative: /(i'm not bad|i don't struggle)/i
    },
    { 
      type: 'self_label', 
      regex: /(i am|i'm the type|i define myself|i see myself as|i consider myself|i identify as|i'm someone who|i'm a person who)/i,
      negative: /(i'm not|i am not)/i
    },
    { 
      type: 'shadow', 
      regex: /(my dark side|i sabotage|my worst self|my destructive side|i self-destruct|i undermine|my toxic trait|my flaw)/i,
      negative: /(i don't sabotage)/i
    },
    { 
      type: 'aspiration', 
      regex: /(future me|i want to become|my dream self|i aspire to be|i'm working toward|i'm becoming|i'm evolving into|my ideal self)/i,
      negative: /(i don't want to become)/i
    },
    { 
      type: 'identity_statement', 
      regex: /(this is who i am|i realized that i'm|i've learned i'm|i discovered that i|i've come to understand|i know i'm|i recognize that i)/i,
      negative: /(this isn't who i am)/i
    },
  ];

  /**
   * Extract identity signals from entries
   * Uses regex patterns first, then LLM fallback if no signals found
   */
  async extract(entries: any[]): Promise<IdentitySignal[]> {
    const signals: IdentitySignal[] = [];

    try {
      for (const entry of entries) {
        if (!entry.text || !entry.id || !entry.timestamp) continue;

        const text = entry.text;
        let entrySignals: IdentitySignal[] = [];

        // Try regex patterns first
        for (const pattern of this.patterns) {
          // Check negative pattern first (exclude false positives)
          if (pattern.negative && pattern.negative.test(text)) {
            continue; // Skip this pattern if negative match
          }

          if (pattern.regex.test(text)) {
            // Extract sentence containing the pattern
            const sentence = this.extractSentence(text, pattern.regex);
            
            // Calculate weight based on emotional intensity
            const emotionalWords = (sentence.match(/\b(very|extremely|deeply|intensely|profoundly|strongly|really|truly|genuinely)\b/gi) || []).length;
            const weight = Math.min(1, 0.3 + emotionalWords * 0.15);

            // Check for compound statements ("I'm both X and Y")
            const compoundMatch = sentence.match(/(?:both|and|also|plus|as well as)/i);
            const isCompound = !!compoundMatch;

            entrySignals.push({
              id: randomUUID(),
              type: pattern.type,
              text: sentence || text.substring(0, 500),
              evidence: text,
              timestamp: entry.timestamp,
              weight,
              confidence: 0.75,
              memory_id: entry.id,
            });
          }
        }

        // If no signals found with regex, try LLM extraction
        if (entrySignals.length === 0) {
          logger.debug({ entryId: entry.id }, 'No regex signals found, trying LLM extraction');
          const llmSignals = await this.extractWithLLM(entry);
          entrySignals = llmSignals;
        }

        signals.push(...entrySignals);
      }

      logger.debug({ count: signals.length }, 'Extracted identity signals');
    } catch (error) {
      logger.error({ error }, 'Error extracting identity signals');
    }

    return signals;
  }

  /**
   * Extract identity signals using LLM (fallback when regex finds nothing)
   */
  private async extractWithLLM(entry: { id: string; text: string; timestamp: string }): Promise<IdentitySignal[]> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Extract identity signals from this journal entry. Look for:
- Values, beliefs, desires, fears
- Strengths, weaknesses
- Self-labels and identity statements
- Aspirations and future self
- Shadow aspects or destructive patterns
- Implicit identity signals (not just explicit "I am" statements)

Return JSON:
{
  "signals": [
    {
      "type": "value|belief|desire|fear|strength|weakness|self_label|shadow|aspiration|identity_statement",
      "text": "extracted signal text (1-2 sentences)",
      "confidence": 0.0-1.0,
      "isImplicit": true/false
    }
  ]
}

Only extract signals with confidence > 0.5. Be conservative.`
          },
          {
            role: 'user',
            content: entry.text.substring(0, 3000) // Limit length
          }
        ]
      });

      const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
      const extracted = Array.isArray(parsed.signals) ? parsed.signals : [];

      const signals: IdentitySignal[] = [];
      for (const signal of extracted) {
        if (signal.type && signal.text && signal.confidence >= 0.5) {
          signals.push({
            id: randomUUID(),
            type: signal.type as IdentitySignalType,
            text: signal.text,
            evidence: entry.text,
            timestamp: entry.timestamp,
            weight: signal.confidence,
            confidence: signal.confidence,
            memory_id: entry.id,
          });
        }
      }

      logger.debug({ entryId: entry.id, signalCount: signals.length }, 'LLM extracted identity signals');
      return signals;
    } catch (error) {
      logger.debug({ error, entryId: entry.id }, 'LLM extraction failed, returning empty');
      return [];
    }
  }

  /**
   * Extract sentence containing the pattern match
   */
  private extractSentence(text: string, pattern: RegExp): string {
    const sentences = text.split(/[.!?]+/);
    for (const sentence of sentences) {
      if (pattern.test(sentence)) {
        return sentence.trim();
      }
    }
    // Fallback: extract context around match
    const match = text.match(pattern);
    if (match && match.index !== undefined) {
      const start = Math.max(0, match.index - 100);
      const end = Math.min(text.length, match.index + match[0].length + 100);
      return text.substring(start, end).trim();
    }
    return text.substring(0, 200);
  }
}

