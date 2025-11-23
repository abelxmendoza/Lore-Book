import OpenAI from 'openai';
import { logger } from '../../logger';
import type { Conflict, ConflictBeat, ConflictParticipant } from './types';

/**
 * Parses text into structured conflict data using LLM
 * V1: Uses OpenAI to extract structured conflict information
 */
export class ConflictParser {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Parse text into structured conflict
   */
  async parse(text: string): Promise<Conflict> {
    try {
      const prompt = `Analyze the following memory for CONFLICT.

Only return JSON, no markdown:

{
  "type": "One of: physical, verbal, social, emotional, internal",
  "setting": "Location (e.g., 'venue', 'home', 'gym', 'street', 'work')",
  "trigger": "What started the conflict",
  "escalation": "How it escalated (e.g., 'verbal → physical', 'argument → meltdown')",
  "participants": [{"name": "Name or description", "role": "antagonist|ally|bystander|victim"}],
  "intensity": 0.0-1.0,
  "conflictBeats": [{"stage": "What happened (e.g., 'verbal escalation', 'push', 'swing', 'retreat')", "intensity": 0.0-1.0}],
  "emotionalImpact": {
    "before": "Emotional state before conflict",
    "during": "Emotional state during conflict",
    "after": "Emotional state after conflict"
  },
  "outcome": "How it ended",
  "summary": "One paragraph summary of the conflict"
}

Focus on:
- fights
- arguments
- confrontations
- venue drama
- aggression
- manipulation
- social intimidation
- group attacks
- BJJ/fight scenes
- emotional breakdowns
- internal conflict
- regret/aftershock

Text:
${text}`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a conflict analyst. Extract structured conflict information from journal entries. Return only valid JSON.',
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
        type: parsed.type || 'general',
        setting: parsed.setting || 'Unknown',
        trigger: parsed.trigger || '',
        escalation: parsed.escalation || '',
        participants: Array.isArray(parsed.participants) ? parsed.participants : [],
        intensity: parsed.intensity || 0,
        conflictBeats: Array.isArray(parsed.conflictBeats) ? parsed.conflictBeats : [],
        emotionalImpact: {
          before: parsed.emotionalImpact?.before || '',
          during: parsed.emotionalImpact?.during || '',
          after: parsed.emotionalImpact?.after || '',
        },
        outcome: parsed.outcome || '',
        summary: parsed.summary || '',
        embedding: [], // Will be set later
        timestamp: '', // Will be set later
      };
    } catch (error) {
      logger.error({ error, text: text.substring(0, 100) }, 'Error parsing conflict');
      // Return default conflict on error
      return {
        type: 'general',
        setting: 'Unknown',
        trigger: '',
        escalation: '',
        participants: [],
        intensity: 0,
        conflictBeats: [],
        emotionalImpact: {
          before: '',
          during: '',
          after: '',
        },
        outcome: '',
        summary: text.substring(0, 200),
        embedding: [],
        timestamp: '',
      };
    }
  }
}

