// =====================================================
// TEXT NORMALIZATION SERVICE
// Purpose: Clean and normalize messy conversational input
// =====================================================

import { logger } from '../../logger';
import type { NormalizationResult } from '../../types/conversationCentered';

/**
 * Normalizes text for semantic extraction
 * Handles: spelling, abbreviations, slang, grammar
 */
export class NormalizationService {
  /**
   * Normalize text while preserving original meaning
   */
  async normalizeText(originalText: string): Promise<NormalizationResult> {
    const corrections: NormalizationResult['corrections'] = [];
    let normalized = originalText;

    // Common abbreviations expansion
    const abbreviations: Record<string, string> = {
      "i'm": "I am",
      "i've": "I have",
      "i'll": "I will",
      "i'd": "I would",
      "you're": "you are",
      "you've": "you have",
      "you'll": "you will",
      "you'd": "you would",
      "we're": "we are",
      "we've": "we have",
      "we'll": "we will",
      "we'd": "we would",
      "they're": "they are",
      "they've": "they have",
      "they'll": "they will",
      "they'd": "they would",
      "it's": "it is",
      "it'll": "it will",
      "it'd": "it would",
      "that's": "that is",
      "that'll": "that will",
      "that'd": "that would",
      "what's": "what is",
      "what'll": "what will",
      "what'd": "what would",
      "who's": "who is",
      "who'll": "who will",
      "who'd": "who would",
      "where's": "where is",
      "where'll": "where will",
      "where'd": "where would",
      "when's": "when is",
      "when'll": "when will",
      "when'd": "when would",
      "why's": "why is",
      "why'll": "why will",
      "why'd": "why would",
      "how's": "how is",
      "how'll": "how will",
      "how'd": "how would",
      "can't": "cannot",
      "won't": "will not",
      "don't": "do not",
      "doesn't": "does not",
      "didn't": "did not",
      "isn't": "is not",
      "aren't": "are not",
      "wasn't": "was not",
      "weren't": "were not",
      "hasn't": "has not",
      "haven't": "have not",
      "hadn't": "had not",
      "wouldn't": "would not",
      "couldn't": "could not",
      "shouldn't": "should not",
      "mustn't": "must not",
      "mightn't": "might not",
      "gonna": "going to",
      "wanna": "want to",
      "gotta": "got to",
      "lemme": "let me",
      "gimme": "give me",
      "kinda": "kind of",
      "sorta": "sort of",
      "outta": "out of",
      "lotsa": "lots of",
      "lotta": "lot of",
    };

    // Expand abbreviations
    for (const [abbrev, expanded] of Object.entries(abbreviations)) {
      const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
      if (regex.test(normalized)) {
        normalized = normalized.replace(regex, expanded);
        corrections.push({
          original: abbrev,
          corrected: expanded,
          type: 'abbreviation',
        });
      }
    }

    // Common slang normalization (preserve meaning)
    const slang: Record<string, string> = {
      "yeah": "yes",
      "yep": "yes",
      "nope": "no",
      "nah": "no",
      "yup": "yes",
      "yay": "yes",
      "cool": "good",
      "awesome": "excellent",
      "sick": "excellent", // context-dependent, but common usage
      "dope": "excellent",
      "lit": "exciting",
      "fire": "excellent",
      "bet": "agreed",
      "fr": "for real",
      "tbh": "to be honest",
      "imo": "in my opinion",
      "imho": "in my humble opinion",
      "fyi": "for your information",
      "idk": "I do not know",
      "idc": "I do not care",
      "lol": "laughing out loud",
      "omg": "oh my god",
      "wtf": "what the f***",
      "smh": "shaking my head",
      "tbh": "to be honest",
    };

    // Normalize slang (case-insensitive)
    for (const [slangTerm, normalizedTerm] of Object.entries(slang)) {
      const regex = new RegExp(`\\b${slangTerm}\\b`, 'gi');
      if (regex.test(normalized)) {
        normalized = normalized.replace(regex, normalizedTerm);
        corrections.push({
          original: slangTerm,
          corrected: normalizedTerm,
          type: 'slang',
        });
      }
    }

    // Basic grammar fixes (capitalize first letter, fix double spaces)
    normalized = normalized.trim();
    if (normalized.length > 0) {
      normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
    }
    normalized = normalized.replace(/\s+/g, ' ');

    // Detect language (simple heuristic for now)
    const language = this.detectLanguage(normalized);

    return {
      normalized_text: normalized,
      corrections,
      language,
    };
  }

  /**
   * Simple language detection (can be enhanced with proper library)
   */
  private detectLanguage(text: string): string {
    // Simple heuristic - can be replaced with proper language detection
    // For now, assume English
    return 'en';
  }

  /**
   * Split message into utterances (sentences/phrases)
   */
  splitIntoUtterances(text: string): string[] {
    // Split by sentence boundaries, but preserve context
    const sentences = text
      .split(/([.!?]+[\s\n]+)/)
      .filter(s => s.trim().length > 0)
      .map(s => s.trim());

    // If no sentence boundaries, treat as single utterance
    if (sentences.length === 0) {
      return [text.trim()];
    }

    // Recombine punctuation with sentences
    const utterances: string[] = [];
    for (let i = 0; i < sentences.length; i += 2) {
      const sentence = sentences[i];
      const punctuation = sentences[i + 1] || '';
      if (sentence) {
        utterances.push(sentence + punctuation);
      }
    }

    return utterances.length > 0 ? utterances : [text.trim()];
  }
}

export const normalizationService = new NormalizationService();

