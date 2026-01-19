import OpenAI from 'openai';

import { logger } from '../../logger';

import type { ToxicityEvent } from './types';

/**
 * Parses text into structured toxicity data using LLM
 * V1: Uses OpenAI to extract structured toxicity information
 */
export class ToxicityParser {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Parse text into structured toxicity event
   */
  async parse(text: string): Promise<ToxicityEvent> {
    try {
      const prompt = `Identify any toxic or dangerous dynamics in the following memory.

Return ONLY JSON, no markdown:

{
  "entityType": "One of: person, place, situation",
  "entityName": "Name or identifier (e.g., 'Noah', 'Triunfo', 'Tom Tom', 'nightlife scene')",
  "category": "One of: jealousy, manipulation, aggression, chaos, betrayal, disrespect, hostility, instability, sabotage, dominance, danger",
  "redFlags": ["List of specific red flags observed"],
  "severity": 0.0-1.0,
  "pattern": "Summary of repeated behavior or pattern",
  "prediction": "Likely future outcomes if this continues",
  "summary": "One paragraph summary of the toxic dynamic"
}

Focus on:
- jealousy / envy
- disrespect
- group hostility
- unstable people
- venues that escalate
- manipulation
- blame shifting
- social sabotage
- dominance moves
- dangerous environments
- people who put you at risk
- gaslighting
- narcissistic behavior
- abusive patterns

Text:
${text}`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a toxicity analyst. Identify toxic dynamics, red flags, and dangerous patterns from journal entries. Return only valid JSON.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      // Parse JSON response
      const parsed = JSON.parse(content);

      // Validate and set defaults
      return {
        entityType: parsed.entityType || 'general',
        entityName: parsed.entityName || 'unknown',
        category: parsed.category || 'general',
        redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags : [],
        severity: parsed.severity || 0,
        pattern: parsed.pattern || '',
        prediction: parsed.prediction || '',
        summary: parsed.summary || '',
        embedding: [], // Will be set later
        timestamp: '', // Will be set later
      };
    } catch (error) {
      logger.error({ error, text: text.substring(0, 100) }, 'Error parsing toxicity');
      // Return default event on error
      return {
        entityType: 'general',
        entityName: 'unknown',
        category: 'general',
        redFlags: [],
        severity: 0,
        pattern: '',
        prediction: '',
        summary: text.substring(0, 200),
        embedding: [],
        timestamp: '',
      };
    }
  }
}

