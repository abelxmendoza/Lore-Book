// =====================================================
// MULTI-EVENT SPLITTING SERVICE
// Purpose: Split single entries into multiple distinct events
// =====================================================

import { logger } from '../../logger';
import { config } from '../../config';
import OpenAI from 'openai';
import type { ExtractedUnit } from '../../types/conversationCentered';

const openai = new OpenAI({ apiKey: config.openAiKey });

export interface SplitEvent {
  id: string;
  content: string;
  type: 'social' | 'celebration' | 'work' | 'conflict' | 'personal' | 'other';
  characters: string[];
  location?: string;
  activities: string[];
  temporal_markers?: string[];
  emotional_context?: string;
  confidence: number;
  start_index: number;
  end_index: number;
}

export interface EventSplittingResult {
  events: SplitEvent[];
  original_text: string;
  language_detected: string;
  spanish_terms?: string[];
}

/**
 * Splits a single entry into multiple distinct events
 * Handles: temporal boundaries, character groups, location changes, activity changes
 */
export class MultiEventSplittingService {
  /**
   * Split entry into multiple events
   */
  async splitEntryIntoEvents(
    text: string,
    language?: string
  ): Promise<EventSplittingResult> {
    try {
      // First, detect if this is a multi-event entry
      const isMultiEvent = this.detectMultiEvent(text);
      
      if (!isMultiEvent) {
        // Single event - return as-is
        return {
          events: [{
            id: 'event-0',
            content: text,
            type: 'other',
            characters: [],
            activities: [],
            confidence: 1.0,
            start_index: 0,
            end_index: text.length,
          }],
          original_text: text,
          language_detected: language || 'en',
        };
      }

      // Use LLM to split into multiple events
      return await this.llmSplitEvents(text, language);
    } catch (error) {
      logger.error({ error, text }, 'Failed to split entry into events');
      // Fallback: return as single event
      return {
        events: [{
          id: 'event-0',
          content: text,
          type: 'other',
          characters: [],
          activities: [],
          confidence: 0.5,
          start_index: 0,
          end_index: text.length,
        }],
        original_text: text,
        language_detected: language || 'en',
      };
    }
  }

  /**
   * Detect if entry contains multiple events
   */
  private detectMultiEvent(text: string): boolean {
    const lowerText = text.toLowerCase();
    
    // Temporal markers that suggest multiple events
    const temporalMarkers = [
      /\b(then|after|afterwards|later|meanwhile|while|during|before|previously|next|subsequently|after that|then we|then i|then they)\b/gi,
      /\b(also|and then|and after|and later|and while)\b/gi,
    ];

    // Multiple character groups
    const characterGroupPatterns = [
      /\b(we|they|he|she)\s+[^.]+\.[\s]+(i|we|they|he|she)\s+/gi,
      /\b([A-Z][a-z]+)\s+[^.]+\.[\s]+([A-Z][a-z]+)\s+/g,
    ];

    // Multiple activities
    const activityPatterns = [
      /\b(ate|watched|sang|worked|cleaned|drank)\b.*\b(and|then|while|during)\b.*\b(ate|watched|sang|worked|cleaned|drank)\b/gi,
    ];

    // Check for multiple sentences with different subjects
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length >= 2) {
      // Check if sentences have different subjects/activities
      const subjects = sentences.map(s => {
        const match = s.match(/^(I|We|They|He|She|[A-Z][a-z]+)/);
        return match ? match[0] : null;
      }).filter(Boolean);
      
      if (subjects.length >= 2 && new Set(subjects).size >= 2) {
        return true;
      }
    }

    // Check temporal markers
    if (temporalMarkers.some(pattern => pattern.test(text))) {
      return true;
    }

    // Check activity patterns
    if (activityPatterns.some(pattern => pattern.test(text))) {
      return true;
    }

    return false;
  }

  /**
   * Use LLM to split text into multiple events
   */
  private async llmSplitEvents(
    text: string,
    language?: string
  ): Promise<EventSplittingResult> {
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      {
        role: 'system',
        content: `You are analyzing text to identify and split multiple distinct events.

A single entry may contain multiple events when:
- Different activities occur (eating, watching, working, cleaning, gym, BJJ, emailing)
- Different character groups are involved
- Different locations or contexts (gym, BJJ, LA, UK)
- Temporal markers indicate sequence (then, after, while, meanwhile, still, already)
- Different emotional contexts
- Different time periods (morning, afternoon, evening)
- Communication events (emailed, called, texted, heard from, didn't hear from)

For each distinct event, extract:
- content: The specific text describing this event
- type: social, celebration, work, conflict, personal, or other
- characters: Names or pronouns mentioned (Gabriel, Chava, Tia Lourdes, I, we, they, etc.)
- location: Where it happened (if mentioned)
- activities: What activities occurred (eating pozole, watching football, singing, working, cleaning, etc.)
- temporal_markers: Time/sequence words (then, after, while, etc.)
- emotional_context: Emotional tone (tension, celebration, frustration, etc.)
- start_index: Character position where event starts in original text
- end_index: Character position where event ends in original text

IMPORTANT:
- Preserve Spanish words and phrases (pozole, mugroso, tia, nadien, ayuden, etc.)
- Each event should be a distinct, complete experience
- Events can overlap in time but should be conceptually separate
- Include character attributes mentioned (e.g., "Gabriel is a drunk" → extract as character attribute, not separate event)

Return JSON:
{
  "events": [
    {
      "content": "We ate pozole and they watched the football game outside",
      "type": "social",
      "characters": ["I", "we", "they", "Gabriel"],
      "location": "outside",
      "activities": ["eating pozole", "watching football"],
      "temporal_markers": [],
      "emotional_context": null,
      "start_index": 0,
      "end_index": 60
    }
  ],
  "spanish_terms": ["pozole", "tia", "mugroso", "nadien", "ayuden"]
}

Be precise with indices. Split by distinct experiences, not just sentences.`,
      },
      {
        role: 'user',
        content: `Split this text into distinct events:\n\n"${text}"`,
      },
    ];

    const completion = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0.2,
      messages,
      response_format: { type: 'json_object' },
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response from LLM');
    }

    const parsed = JSON.parse(response);
    
    // Validate and fix indices
    const events: SplitEvent[] = (parsed.events || []).map((event: any, index: number) => ({
      id: `event-${index}`,
      content: event.content || '',
      type: event.type || 'other',
      characters: Array.isArray(event.characters) ? event.characters : [],
      location: event.location,
      activities: Array.isArray(event.activities) ? event.activities : [],
      temporal_markers: Array.isArray(event.temporal_markers) ? event.temporal_markers : [],
      emotional_context: event.emotional_context,
      confidence: event.confidence || 0.8,
      start_index: Math.max(0, Math.min(event.start_index || 0, text.length)),
      end_index: Math.max(0, Math.min(event.end_index || text.length, text.length)),
    }));

    return {
      events,
      original_text: text,
      language_detected: language || 'en',
      spanish_terms: parsed.spanish_terms || [],
    };
  }

  /**
   * Convert split events to extracted units
   */
  convertToExtractedUnits(
    splitResult: EventSplittingResult,
    baseMetadata?: Record<string, any>
  ): ExtractedUnit[] {
    return splitResult.events.map((event, index) => ({
      id: `unit-${Date.now()}-${index}`,
      type: 'EXPERIENCE' as const,
      content: event.content,
      confidence: event.confidence,
      temporal_context: {
        start_time: new Date().toISOString(), // Will be updated by pipeline
      },
      entity_ids: [], // Will be populated by entity extraction
      metadata: {
        ...baseMetadata,
        event_type: event.type,
        characters: event.characters,
        location: event.location,
        activities: event.activities,
        temporal_markers: event.temporal_markers,
        emotional_context: event.emotional_context,
        original_start_index: event.start_index,
        original_end_index: event.end_index,
        spanish_terms: splitResult.spanish_terms,
        language: splitResult.language_detected,
        split_from_multi_event: true,
      },
    }));
  }
}

export const multiEventSplittingService = new MultiEventSplittingService();
