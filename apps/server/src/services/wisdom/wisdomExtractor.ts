import OpenAI from 'openai';

import { config } from '../../config';
import { logger } from '../../logger';

import type {
  WisdomStatement,
  WisdomCategory,
  WisdomSource,
} from './types';

const openai = new OpenAI({ apiKey: config.openAiKey });

/**
 * Wisdom Extraction Service
 * Extracts wisdom statements from journal entries using rule-based patterns first,
 * then LLM fallback for complex cases
 */
export class WisdomExtractor {
  // Wisdom indicator patterns (rule-based, FREE)
  private readonly wisdomPatterns = {
    life_lesson: [
      /\b(i learned|i've learned|i learned that|lesson learned|the lesson|teach me|taught me)\b/gi,
      /\b(what i learned|key takeaway|takeaway|main lesson)\b/gi,
      /\b(never again|always remember|remember this|don't forget)\b/gi,
    ],
    insight: [
      /\b(i realized|i've realized|realization|insight|i see now|now i understand)\b/gi,
      /\b(it dawned on me|it hit me|suddenly i|i noticed that|i observed)\b/gi,
      /\b(the key insight|the insight|my insight)\b/gi,
    ],
    realization: [
      /\b(i understand now|now i get it|it makes sense|i see|i finally)\b/gi,
      /\b(epiphany|aha moment|lightbulb moment|clicked)\b/gi,
      /\b(i came to realize|i've come to realize|i've come to understand)\b/gi,
    ],
    principle: [
      /\b(principle|rule|guideline|i believe|i think|my philosophy|philosophy)\b/gi,
      /\b(always|never|should|must|important to|crucial to)\b/gi,
      /\b(one thing i|the key is|the secret is|the truth is)\b/gi,
    ],
    philosophy: [
      /\b(life is|the meaning of|purpose|what matters|what's important)\b/gi,
      /\b(i think life|i believe life|my view|my perspective|worldview)\b/gi,
      /\b(deep down|at the core|fundamentally|essentially)\b/gi,
    ],
    advice: [
      /\b(advice|i would tell|if i could|to anyone|remember to|don't)\b/gi,
      /\b(should|shouldn't|must|mustn't|always|never)\b/gi,
      /\b(if you|when you|before you|after you)\b/gi,
    ],
    observation: [
      /\b(i noticed|i've noticed|observation|i see that|it seems|appears to)\b/gi,
      /\b(pattern|trend|tendency|usually|often|always happens)\b/gi,
      /\b(i observe|i've observed|my observation)\b/gi,
    ],
    truth: [
      /\b(the truth is|honestly|frankly|in reality|actually|in fact)\b/gi,
      /\b(what's really|what really|the real|genuinely|truly)\b/gi,
      /\b(i know that|i know|certainly|definitely|absolutely)\b/gi,
    ],
  };

  /**
   * Extract wisdom from content
   */
  async extractWisdom(
    content: string,
    source: WisdomSource,
    sourceId: string,
    sourceDate: string
  ): Promise<WisdomStatement[]> {
    const wisdom: WisdomStatement[] = [];

    // First, try rule-based extraction (FREE)
    const ruleBasedWisdom = this.extractRuleBased(content, source, sourceId, sourceDate);
    wisdom.push(...ruleBasedWisdom);

    // If rule-based found something, use it
    if (ruleBasedWisdom.length > 0) {
      logger.debug(
        { count: ruleBasedWisdom.length, source },
        'Extracted wisdom using rule-based patterns'
      );
      return wisdom;
    }

    // If rule-based found nothing and content is substantial, try LLM
    if (content.length > 200) {
      try {
        const llmWisdom = await this.extractLLM(content, source, sourceId, sourceDate);
        wisdom.push(...llmWisdom);
        logger.debug(
          { count: llmWisdom.length, source },
          'Extracted wisdom using LLM'
        );
      } catch (error) {
        logger.warn({ error, source }, 'Failed to extract wisdom using LLM');
      }
    }

    return wisdom;
  }

  /**
   * Rule-based wisdom extraction (FREE, no API calls)
   */
  private extractRuleBased(
    content: string,
    source: WisdomSource,
    sourceId: string,
    sourceDate: string
  ): WisdomStatement[] {
    const wisdom: WisdomStatement[] = [];
    const lowerContent = content.toLowerCase();

    // Check each category
    for (const [category, patterns] of Object.entries(this.wisdomPatterns)) {
      for (const pattern of patterns) {
        const matches = Array.from(lowerContent.matchAll(pattern));
        if (matches.length > 0) {
          // Extract the sentence or paragraph containing the wisdom
          const wisdomText = this.extractWisdomText(content, matches[0].index || 0);
          
          if (wisdomText && wisdomText.length > 20) {
            const confidence = this.calculateConfidence(wisdomText, category as WisdomCategory);
            
            if (confidence > 0.4) {
              wisdom.push({
                id: '', // Will be set by storage service
                user_id: '', // Will be set by storage service
                category: category as WisdomCategory,
                statement: wisdomText,
                context: this.extractContext(content, matches[0].index || 0),
                confidence,
                source,
                source_id: sourceId,
                source_date: sourceDate,
                tags: [],
                related_experiences: [],
                related_patterns: [],
                recurrence_count: 1,
                first_seen: sourceDate,
                last_seen: sourceDate,
                evolution: [],
                metadata: {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            }
          }
        }
      }
    }

    return wisdom;
  }

  /**
   * Extract wisdom text from content around a match
   */
  private extractWisdomText(content: string, matchIndex: number): string {
    // Find sentence boundaries
    const sentenceEnd = /[.!?]\s+/g;
    const sentences: { start: number; end: number; text: string }[] = [];
    
    let lastIndex = 0;
    let match;
    while ((match = sentenceEnd.exec(content)) !== null) {
      sentences.push({
        start: lastIndex,
        end: match.index + match[0].length,
        text: content.substring(lastIndex, match.index + match[0].length).trim(),
      });
      lastIndex = match.index + match[0].length;
    }
    
    // Add final sentence if content doesn't end with punctuation
    if (lastIndex < content.length) {
      sentences.push({
        start: lastIndex,
        end: content.length,
        text: content.substring(lastIndex).trim(),
      });
    }

    // Find sentence containing the match
    const containingSentence = sentences.find(
      s => matchIndex >= s.start && matchIndex < s.end
    );

    if (containingSentence) {
      // Return sentence plus next sentence if it's short
      const sentenceIndex = sentences.indexOf(containingSentence);
      if (sentenceIndex < sentences.length - 1) {
        const nextSentence = sentences[sentenceIndex + 1];
        if (nextSentence.text.length < 100) {
          return (containingSentence.text + ' ' + nextSentence.text).trim();
        }
      }
      return containingSentence.text;
    }

    // Fallback: extract 200 chars around match
    const start = Math.max(0, matchIndex - 100);
    const end = Math.min(content.length, matchIndex + 100);
    return content.substring(start, end).trim();
  }

  /**
   * Extract context around wisdom
   */
  private extractContext(content: string, matchIndex: number): string {
    const start = Math.max(0, matchIndex - 150);
    const end = Math.min(content.length, matchIndex + 150);
    return content.substring(start, end).trim();
  }

  /**
   * Calculate confidence score for wisdom statement
   */
  private calculateConfidence(text: string, category: WisdomCategory): number {
    let confidence = 0.5; // Base confidence

    // Boost confidence for longer, more thoughtful statements
    if (text.length > 50) confidence += 0.1;
    if (text.length > 100) confidence += 0.1;

    // Boost for certain phrases
    const highConfidencePhrases = [
      'i learned',
      'i realized',
      'the truth is',
      'i understand',
      'lesson',
      'insight',
      'principle',
    ];

    const lowerText = text.toLowerCase();
    for (const phrase of highConfidencePhrases) {
      if (lowerText.includes(phrase)) {
        confidence += 0.1;
        break;
      }
    }

    // Reduce confidence for questions
    if (text.includes('?')) confidence -= 0.1;

    // Reduce confidence for very short statements
    if (text.length < 30) confidence -= 0.2;

    return Math.max(0.3, Math.min(0.9, confidence));
  }

  /**
   * LLM-based wisdom extraction (fallback for complex cases)
   */
  private async extractLLM(
    content: string,
    source: WisdomSource,
    sourceId: string,
    sourceDate: string
  ): Promise<WisdomStatement[]> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a wisdom extraction system. Analyze the following journal entry and extract any wisdom statements, life lessons, insights, realizations, principles, or philosophical observations.

Return a JSON object with a "wisdom" array. Each wisdom object should have:
- category: one of "life_lesson", "insight", "realization", "principle", "philosophy", "advice", "observation", "truth"
- statement: the wisdom statement itself (concise, 1-2 sentences)
- context: brief context about what led to this wisdom
- confidence: 0.0-1.0 confidence score

Only extract wisdom that is:
1. Generalizable (not just a specific event)
2. Reflective or philosophical
3. Potentially useful for future reference
4. A lesson learned or insight gained

If no wisdom is found, return {"wisdom": []}.`,
          },
          {
            role: 'user',
            content: content.substring(0, 3000), // Limit to avoid token limits
          },
        ],
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      const wisdomArray = response.wisdom || [];

      return wisdomArray.map((w: any) => ({
        id: '',
        user_id: '',
        category: w.category || 'insight',
        statement: w.statement || '',
        context: w.context || '',
        confidence: w.confidence || 0.6,
        source,
        source_id: sourceId,
        source_date: sourceDate,
        tags: [],
        related_experiences: [],
        related_patterns: [],
        recurrence_count: 1,
        first_seen: sourceDate,
        last_seen: sourceDate,
        evolution: [],
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to extract wisdom using LLM');
      return [];
    }
  }
}

