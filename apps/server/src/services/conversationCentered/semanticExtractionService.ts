// =====================================================
// SEMANTIC UNIT EXTRACTION SERVICE
// Purpose: Extract EXPERIENCE, FEELING, THOUGHT, etc. from normalized text
// =====================================================

import { logger } from '../../logger';
import { config } from '../../config';
import OpenAI from 'openai';
import type { ExtractedUnitType, ExtractionResult } from '../../types/conversationCentered';

const openai = new OpenAI({ apiKey: config.openAiKey });

/**
 * Extracts semantic units from normalized text
 */
export class SemanticExtractionService {
  /**
   * Extract semantic units from normalized text
   * @param isAIMessage - Whether this text is from an AI response
   */
  async extractSemanticUnits(
    normalizedText: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
    isAIMessage: boolean = false
  ): Promise<ExtractionResult> {
    try {
      // Try rule-based extraction first (free, fast)
      const ruleBasedUnits = this.ruleBasedExtraction(normalizedText);
      
      // For AI messages, reduce confidence
      if (isAIMessage && ruleBasedUnits.units.length > 0) {
        ruleBasedUnits.units.forEach(unit => {
          unit.confidence = Math.max(0.3, unit.confidence * 0.7);
        });
      }
      
      // If we got good results, use them
      if (ruleBasedUnits.units.length > 0 && ruleBasedUnits.units.some(u => u.confidence >= 0.7)) {
        return ruleBasedUnits;
      }

      // Otherwise, use LLM for complex cases
      return await this.llmExtraction(normalizedText, conversationHistory, isAIMessage);
    } catch (error) {
      logger.error({ error, text: normalizedText }, 'Failed to extract semantic units');
      // Fallback to rule-based
      const fallback = this.ruleBasedExtraction(normalizedText);
      if (isAIMessage && fallback.units.length > 0) {
        fallback.units.forEach(unit => {
          unit.confidence = Math.max(0.3, unit.confidence * 0.7);
        });
      }
      return fallback;
    }
  }

  /**
   * Rule-based extraction (free, fast)
   */
  private ruleBasedExtraction(text: string): ExtractionResult {
    const units: ExtractionResult['units'] = [];
    const lowerText = text.toLowerCase();

    // EXPERIENCE patterns (past tense, action verbs)
    const experiencePatterns = [
      /\b(i|we|they|he|she)\s+(went|did|met|saw|visited|attended|completed|finished|started|began|achieved|accomplished|had|got|received|gave|took|made|created|built|wrote|read|watched|listened|played|worked|studied|learned|taught|helped|solved|fixed|broke|lost|found|bought|sold|moved|traveled|arrived|left|returned|joined|left|quit|started|ended)\b/gi,
    ];
    
    if (experiencePatterns.some(pattern => pattern.test(text))) {
      units.push({
        type: 'EXPERIENCE',
        content: text,
        confidence: 0.7,
      });
    }

    // FEELING patterns (emotional language)
    const feelingPatterns = [
      /\b(i|i'm|i am|i feel|feeling|felt|feels)\s+(happy|sad|angry|excited|nervous|anxious|worried|scared|afraid|confident|proud|ashamed|embarrassed|disappointed|frustrated|grateful|thankful|relieved|stressed|overwhelmed|calm|peaceful|content|satisfied|unsatisfied|lonely|connected|loved|hated|jealous|envious|guilty|shameful|hopeful|hopeless|optimistic|pessimistic)\b/gi,
      /\b(emotion|emotions|emotional|mood|moods|feeling|feelings)\b/gi,
    ];

    if (feelingPatterns.some(pattern => pattern.test(text))) {
      units.push({
        type: 'FEELING',
        content: text,
        confidence: 0.7,
      });
    }

    // THOUGHT patterns (cognitive, reflective)
    const thoughtPatterns = [
      /\b(i|i'm|i am|i think|thinking|thought|thoughts|i believe|i realize|realized|realization|i understand|understanding|i see|i notice|noticed|i wonder|wondering|i guess|guessing|i suppose|supposing|i imagine|imagining|i consider|considering|i reflect|reflecting|reflection|insight|insights|perspective|perspectives)\b/gi,
    ];

    if (thoughtPatterns.some(pattern => pattern.test(text))) {
      units.push({
        type: 'THOUGHT',
        content: text,
        confidence: 0.7,
      });
    }

    // PERCEPTION patterns (beliefs, assumptions, hearsay)
    const perceptionPatterns = [
      /\b(i heard|i was told|someone said|they said|people say|rumor|rumors|gossip|i believe|i assume|assuming|i think|i suspect|suspected|i guess|i imagine|supposedly|apparently|allegedly|reportedly)\b/gi,
    ];

    if (perceptionPatterns.some(pattern => pattern.test(text))) {
      units.push({
        type: 'PERCEPTION',
        content: text,
        confidence: 0.6,
      });
    }

    // CLAIM patterns (factual assertions)
    const claimPatterns = [
      /\b(is|are|was|were|has|have|had|does|did|will|would|can|could|should|must|always|never|every|all|none|some|many|most|few|fact|facts|true|truth|real|reality|actually|really|definitely|certainly|absolutely)\b/gi,
    ];

    if (claimPatterns.some(pattern => pattern.test(text)) && !lowerText.includes('i think') && !lowerText.includes('i believe')) {
      units.push({
        type: 'CLAIM',
        content: text,
        confidence: 0.6,
      });
    }

    // DECISION patterns (choices, commitments, intents)
    const decisionPatterns = [
      /\b(i|i'm|i am|i will|i'll|i'm going to|i'm gonna|i decided|decided|decision|decisions|i choose|chose|choosing|choice|choices|i plan|planning|plans|i intend|intending|intention|intentions|i commit|committing|commitment|commitments|i promise|promising|promise|promises|i will|i'll|i'm going to|i'm gonna|i'm planning to|i'm planning on)\b/gi,
    ];

    if (decisionPatterns.some(pattern => pattern.test(text))) {
      units.push({
        type: 'DECISION',
        content: text,
        confidence: 0.7,
      });
    }

    // CORRECTION patterns (revisions, retractions)
    const correctionPatterns = [
      /\b(actually|wait|no|never mind|scratch that|ignore that|forget that|i was wrong|i made a mistake|correction|corrected|i meant|i mean|let me rephrase|let me correct|i take that back|retract|retraction)\b/gi,
    ];

    if (correctionPatterns.some(pattern => pattern.test(text))) {
      units.push({
        type: 'CORRECTION',
        content: text,
        confidence: 0.8,
      });
    }

    // If no units found, default to EXPERIENCE with low confidence
    if (units.length === 0) {
      units.push({
        type: 'EXPERIENCE',
        content: text,
        confidence: 0.4,
      });
    }

    return { units };
  }

  /**
   * LLM-based extraction (for complex cases)
   * @param isAIMessage - Whether this text is from an AI response (affects extraction strategy)
   */
  private async llmExtraction(
    text: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
    isAIMessage: boolean = false
  ): Promise<ExtractionResult> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      {
        role: 'system',
        content: `You are analyzing text to extract semantic units. Extract one or more units from the text.

${isAIMessage ? `IMPORTANT: This text is from an AI assistant response. AI responses are interpretations, not facts.
- Extract insights, connections, and questions (THOUGHT, PERCEPTION types)
- Do NOT extract EXPERIENCE units from AI responses (AI didn't experience anything)
- Mark confidence lower (0.4-0.6 range) since these are interpretations
- Note uncertainty markers (might, seems, appears, etc.)
- Extract connections and insights the AI is making` : `IMPORTANT: A single text may contain MULTIPLE distinct events or experiences. Split them when:`}
- Different activities occur (eating, watching, working, cleaning, etc.)
- Different character groups are involved
- Different locations or contexts
- Temporal markers indicate sequence (then, after, while, meanwhile)
- Different emotional contexts

Unit types:
- EXPERIENCE: Something that happened (past tense actions, events)
- FEELING: Emotional reactions or states
- THOUGHT: Cognitive processes, reflections, realizations
- PERCEPTION: Beliefs, assumptions, things heard (not directly experienced)
- CLAIM: Factual assertions or statements of fact
- DECISION: Choices, commitments, intentions, plans
- CORRECTION: Revisions, retractions, corrections of previous statements

LANGUAGE HANDLING:
- Preserve Spanish words and phrases (pozole, tia, mugroso, nadien, ayuden, etc.)
- Recognize Spanish names (Gabriel, Chava, Lourdes, etc.)
- Understand mixed English-Spanish text
- Extract Spanish terms as metadata

CHARACTER ATTRIBUTES:
- When text describes character traits (e.g., "Gabriel is a drunk", "always drinking"), extract as:
  - EXPERIENCE unit for the observation
  - Include character attributes in metadata (e.g., "drinking_problem", "between_jobs", "debt", "unemployed")
- When user mentions their own status (e.g., "I'm unemployed", "I don't have a job"), extract:
  - FEELING or THOUGHT unit for the emotional/mental state
  - Include employment_status: "unemployed" in metadata for the user entity
- Extract concerns and anxieties (e.g., "don't want to let them know" → FEELING unit with anxiety/concern)

Return JSON:
{
  "units": [
    {
      "type": "EXPERIENCE|FEELING|THOUGHT|PERCEPTION|CLAIM|DECISION|CORRECTION",
      "content": "extracted content",
      "confidence": 0.0-1.0,
      "temporal_context": {},
      "entity_ids": [],
      "metadata": {
        "spanish_terms": ["pozole", "tia", "mugroso"],
        "characters": ["Gabriel", "Chava", "Tia Lourdes"],
        "character_attributes": {"Gabriel": ["drinking_problem", "between_jobs", "debt"]}
      }
    }
  ]
}

Be precise. Split multiple events when appropriate. Preserve Spanish terms. Extract character attributes.`,
      },
    ];

    if (conversationHistory) {
      messages.push(...conversationHistory.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })));
    }

    messages.push({
      role: 'user',
      content: `Extract semantic units from: "${text}"`,
    });

    const completion = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0.3,
      messages,
      response_format: { type: 'json_object' },
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response from LLM');
    }

    const parsed = JSON.parse(response);
    return {
      units: parsed.units || [],
    };
  }
}

export const semanticExtractionService = new SemanticExtractionService();

