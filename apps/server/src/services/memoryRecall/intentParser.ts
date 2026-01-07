/**
 * Intent Parser for Memory Recall Engine
 * 
 * Parses natural language queries into structured recall intents.
 */

import { logger } from '../../logger';
import type { RecallQuery, RecallIntent, ConfidenceLevel } from './types';

export class IntentParser {
  /**
   * Parse a natural language query into a structured recall intent
   */
  parseRecallIntent(query: RecallQuery): RecallIntent {
    const text = this.normalizeText(query.raw_text);
    const lowerText = text.toLowerCase();

    // Emotional similarity patterns
    if (
      this.matches(lowerText, [
        'felt like this',
        'same feeling',
        'felt this way',
        'feeling like',
        'similar feeling',
        'again',
        'before',
      ])
    ) {
      return {
        type: 'EMOTIONAL_SIMILARITY',
        emotions: this.extractEmotions(text),
        confidence_level: 'MEDIUM',
      };
    }

    // Pattern lookback patterns
    if (
      this.matches(lowerText, [
        'pattern',
        'always',
        'keeps happening',
        'recurring',
        'repeated',
        'usually',
        'tend to',
      ])
    ) {
      return {
        type: 'PATTERN_LOOKBACK',
        themes: this.extractThemes(text),
        confidence_level: 'MEDIUM',
      };
    }

    // Temporal comparison patterns
    if (
      this.matches(lowerText, [
        'last time',
        'when did',
        'first time',
        'when was',
        'when have',
        'earliest',
        'most recent',
        'previous',
      ])
    ) {
      return {
        type: 'TEMPORAL_COMPARISON',
        confidence_level: 'HIGH',
      };
    }

    // Entity lookup patterns
    if (this.containsEntityReference(text)) {
      return {
        type: 'ENTITY_LOOKUP',
        entities: this.extractEntityReferences(text),
        confidence_level: 'MEDIUM',
      };
    }

    // Event lookup patterns
    if (
      this.matches(lowerText, [
        'what happened',
        'tell me about',
        'remember when',
        'recall',
        'find',
      ])
    ) {
      return {
        type: 'EVENT_LOOKUP',
        confidence_level: 'MEDIUM',
      };
    }

    // Default to general recall
    return {
      type: 'GENERAL_RECALL',
      confidence_level: 'LOW',
    };
  }

  /**
   * Normalize text for parsing
   */
  private normalizeText(text: string): string {
    return text.trim().replace(/\s+/g, ' ');
  }

  /**
   * Check if text matches any of the patterns
   */
  private matches(text: string, patterns: string[]): boolean {
    return patterns.some((pattern) => text.includes(pattern));
  }

  /**
   * Extract emotions from text
   */
  private extractEmotions(text: string): string[] {
    const emotionKeywords: Record<string, string[]> = {
      happy: ['happy', 'joy', 'excited', 'elated', 'cheerful', 'glad'],
      sad: ['sad', 'depressed', 'down', 'melancholy', 'unhappy', 'sorrow'],
      anxious: ['anxious', 'worried', 'nervous', 'stressed', 'uneasy', 'apprehensive'],
      angry: ['angry', 'mad', 'furious', 'irritated', 'annoyed', 'frustrated'],
      calm: ['calm', 'peaceful', 'relaxed', 'serene', 'tranquil', 'at ease'],
      tired: ['tired', 'exhausted', 'drained', 'fatigued', 'weary'],
      confident: ['confident', 'sure', 'certain', 'assured', 'self-assured'],
      scared: ['scared', 'afraid', 'frightened', 'terrified', 'fearful'],
    };

    const lowerText = text.toLowerCase();
    const found: string[] = [];

    for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
      if (keywords.some((keyword) => lowerText.includes(keyword))) {
        found.push(emotion);
      }
    }

    return found;
  }

  /**
   * Extract themes from text
   */
  private extractThemes(text: string): string[] {
    // Common theme keywords
    const themePatterns = [
      'work',
      'relationship',
      'family',
      'health',
      'money',
      'travel',
      'creative',
      'learning',
      'social',
      'alone',
      'conflict',
      'achievement',
      'failure',
      'change',
      'stability',
    ];

    const lowerText = text.toLowerCase();
    return themePatterns.filter((theme) => lowerText.includes(theme));
  }

  /**
   * Check if text contains entity references (people, places, etc.)
   */
  private containsEntityReference(text: string): boolean {
    // Look for capitalized words (potential names)
    const capitalizedWords = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
    return (capitalizedWords?.length ?? 0) > 0;
  }

  /**
   * Extract entity references from text
   */
  private extractEntityReferences(text: string): string[] {
    const capitalizedWords = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
    return capitalizedWords?.map((w) => w.trim()) ?? [];
  }
}

