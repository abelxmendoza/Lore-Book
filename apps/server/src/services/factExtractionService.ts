import OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';

export type ClaimType = 'date' | 'location' | 'character' | 'event' | 'relationship' | 'attribute' | 'other';

export type ExtractedFact = {
  claim_type: ClaimType;
  subject: string;
  attribute: string;
  value: string;
  confidence: number;
  context?: string;
};

export type FactExtractionResult = {
  facts: ExtractedFact[];
  extraction_confidence: number;
};

class FactExtractionService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: config.openAiKey });
  }

  /**
   * Extract factual claims from journal entry text
   */
  async extractFacts(content: string): Promise<FactExtractionResult> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.1, // Low temperature for consistent extraction
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a fact extraction system. Extract factual claims from journal entry text.
Return a JSON object with:
- "facts": array of fact objects, each with:
  - "claim_type": one of "date", "location", "character", "event", "relationship", "attribute", "other"
  - "subject": the entity the fact is about (person name, "I", location name, etc.)
  - "attribute": what property is being claimed (e.g., "birthday", "location", "met_at", "relationship")
  - "value": the claimed value (e.g., "1990-01-15", "Seattle", "friend")
  - "confidence": float 0-1 indicating extraction confidence
  - "context": optional brief context from the text
- "extraction_confidence": overall confidence in extraction (0-1)

Focus on:
- Dates and times (when things happened)
- Locations (where things happened)
- Character mentions and attributes (who, their properties)
- Events (what happened)
- Relationships (connections between people)
- Attributes (characteristics, properties)

Only extract clear factual claims, not opinions or feelings.`
          },
          {
            role: 'user',
            content: `Extract facts from this journal entry:\n\n${content}`
          }
        ]
      });

      const response = completion.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(response) as {
        facts?: ExtractedFact[];
        extraction_confidence?: number;
      };

      const facts = parsed.facts ?? [];
      const extractionConfidence = parsed.extraction_confidence ?? 0.5;

      // Validate and clean facts
      const validatedFacts = facts
        .filter(fact => fact.subject && fact.attribute && fact.value)
        .map(fact => ({
          ...fact,
          confidence: Math.max(0, Math.min(1, fact.confidence ?? 0.5)),
          claim_type: fact.claim_type || 'other'
        }));

      return {
        facts: validatedFacts,
        extraction_confidence: Math.max(0, Math.min(1, extractionConfidence))
      };
    } catch (error) {
      logger.error({ error }, 'Failed to extract facts from entry');
      return {
        facts: [],
        extraction_confidence: 0
      };
    }
  }

  /**
   * Extract facts from multiple entries (batch processing)
   */
  async extractFactsBatch(contents: string[]): Promise<FactExtractionResult[]> {
    return Promise.all(contents.map(content => this.extractFacts(content)));
  }
}

export const factExtractionService = new FactExtractionService();

