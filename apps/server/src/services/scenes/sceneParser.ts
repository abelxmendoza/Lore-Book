import OpenAI from 'openai';
import { logger } from '../../logger';
import type { Scene, SceneBeat, SceneCharacter, SceneInteraction } from './types';

/**
 * Parses text into structured scene data using LLM
 * V1: Uses OpenAI to extract structured scene information
 */
export class SceneParser {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Parse text into structured scene
   */
  async parse(text: string): Promise<Scene> {
    try {
      const prompt = `Convert the following memory into a structured SCENE.

Return JSON only, no markdown:

{
  "title": "Short descriptive title (e.g., 'Fight outside venue', 'First rolling session')",
  "type": "One of: social, fight, nightlife, work, training, family, romantic, general",
  "setting": "Location or environment (e.g., 'Hollywood bar', 'Triunfo BJJ', 'Restaurant')",
  "timeContext": "Time context (e.g., 'night', 'morning', 'weekend', 'after work')",
  "mood": "Overall mood (e.g., 'tense', 'hype', 'angry', 'calm', 'excited')",
  "emotionalArc": ["Brief description of emotional progression through the scene"],
  "beats": [{"action": "What happened", "intensity": 0.0-1.0}],
  "characters": [{"name": "Name or description", "role": "protagonist|antagonist|ally|bystander|love_interest|mentor|other", "description": "Brief description"}],
  "interactions": [{"speaker": "Who", "target": "To whom", "action": "What happened", "emotion": "Emotion"}],
  "outcome": "How it ended (e.g., 'got kicked out', 'won the spar', 'awkward ending')",
  "summary": "One paragraph summary of the scene"
}

Text:
${text}`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a narrative analyst. Extract structured scene information from journal entries. Return only valid JSON.',
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
        title: parsed.title || 'Untitled Scene',
        type: parsed.type || 'general',
        setting: parsed.setting || 'Unknown',
        timeContext: parsed.timeContext || 'Unknown',
        mood: parsed.mood || 'neutral',
        emotionalArc: Array.isArray(parsed.emotionalArc) ? parsed.emotionalArc : [],
        beats: Array.isArray(parsed.beats) ? parsed.beats : [],
        characters: Array.isArray(parsed.characters) ? parsed.characters : [],
        interactions: Array.isArray(parsed.interactions) ? parsed.interactions : [],
        outcome: parsed.outcome || '',
        summary: parsed.summary || '',
        embedding: [], // Will be set later
        timestamp: '', // Will be set later
      };
    } catch (error) {
      logger.error({ error, text: text.substring(0, 100) }, 'Error parsing scene');
      // Return default scene on error
      return {
        title: 'Untitled Scene',
        type: 'general',
        setting: 'Unknown',
        timeContext: 'Unknown',
        mood: 'neutral',
        emotionalArc: [],
        beats: [],
        characters: [],
        interactions: [],
        outcome: '',
        summary: text.substring(0, 200),
        embedding: [],
        timestamp: '',
      };
    }
  }
}

