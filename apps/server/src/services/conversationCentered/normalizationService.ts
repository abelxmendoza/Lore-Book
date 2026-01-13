// =====================================================
// TEXT NORMALIZATION SERVICE
// Purpose: Clean and normalize messy conversational input
// =====================================================

import { logger } from '../../logger';
import type { NormalizationResult, RefinementLevel } from '../../types/conversationCentered';

/**
 * Normalizes text for semantic extraction
 * Handles: spelling, abbreviations, slang, grammar
 * Supports different refinement levels to preserve user's original language
 */
export class NormalizationService {
  /**
   * Normalize text while preserving original meaning
   * @param originalText - The original text to normalize
   * @param refinementLevel - How aggressively to normalize (default: 'light' for user messages)
   */
  async normalizeText(
    originalText: string,
    refinementLevel: RefinementLevel = 'light'
  ): Promise<NormalizationResult> {
    const corrections: NormalizationResult['corrections'] = [];
    let normalized = originalText;

    // Skip abbreviation expansion if preserve mode
    if (refinementLevel === 'preserve') {
      // Only fix critical run-ons and major grammar issues
      normalized = this.fixCriticalIssuesOnly(normalized, corrections);
      
      return {
        normalized_text: normalized,
        corrections,
        language: this.detectLanguage(normalized),
        spanish_terms: this.detectLanguage(normalized).includes('es') ? this.extractSpanishTerms(normalized) : undefined,
        refinement_level: refinementLevel,
        original_preserved: true,
      };
    }

    // Common abbreviations expansion (skip if preserve or light)
    if (refinementLevel !== 'light') {
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

    // Expand abbreviations (skip if preserve or light mode)
    if (refinementLevel !== 'light' && refinementLevel !== 'preserve') {
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

    // Detect language (enhanced with Spanish support)
    const language = this.detectLanguage(normalized);
    
    // Extract Spanish terms if detected
    const spanishTerms = language.includes('es') ? this.extractSpanishTerms(normalized) : [];

    return {
      normalized_text: normalized,
      corrections,
      language,
      spanish_terms: spanishTerms.length > 0 ? spanishTerms : undefined,
      refinement_level: refinementLevel,
      original_preserved: refinementLevel === 'preserve' || corrections.length === 0,
    };
  }

  /**
   * Fix only critical issues: run-on sentences and major grammar problems
   * This preserves user's original language while fixing readability issues
   */
  private fixCriticalIssuesOnly(
    text: string,
    corrections: NormalizationResult['corrections']
  ): string {
    let fixed = text;

    // Fix run-on sentences (multiple sentences without proper punctuation)
    // Pattern: sentence ending with lowercase letter followed by capital letter
    // But not if it's intentional (like "I" or proper nouns)
    const runOnPattern = /([.!?])\s*([a-z])([A-Z])/g;
    const runOnMatches = [...text.matchAll(runOnPattern)];
    if (runOnMatches.length > 0) {
      // Add period and space between sentences
      fixed = fixed.replace(runOnPattern, '$1 $2$3');
      corrections.push({
        original: 'run-on sentence',
        corrected: 'separated sentences',
        type: 'grammar',
      });
    }

    // Fix extremely long sentences (over 200 chars without punctuation)
    // Split at natural break points
    const veryLongSentencePattern = /([^.!?]{200,})/g;
    const longMatches = text.match(veryLongSentencePattern);
    if (longMatches && longMatches.length > 0) {
      // Try to split at conjunctions or commas
      for (const match of longMatches) {
        const splitAt = match.match(/\s+(and|but|or|so|because|when|while|then)\s+/i);
        if (splitAt && splitAt.index) {
          const before = match.substring(0, splitAt.index);
          const after = match.substring(splitAt.index + splitAt[0].length);
          fixed = fixed.replace(match, `${before}. ${after}`);
          corrections.push({
            original: 'very long sentence',
            corrected: 'split into sentences',
            type: 'grammar',
          });
        }
      }
    }

    // Fix double spaces (always fix this - it's not changing meaning)
    fixed = fixed.replace(/\s{2,}/g, ' ');

    return fixed;
  }

  /**
   * Enhanced language detection with Spanish support
   */
  private detectLanguage(text: string): string {
    // Spanish word patterns
    const spanishPatterns = [
      /\b(el|la|los|las|un|una|unos|unas|de|del|en|con|por|para|que|es|son|está|están|fue|fueron|tiene|tienen|hace|hacen|puede|pueden|dice|dicen|más|menos|muy|mucho|muchos|poco|pocos|todo|todos|toda|todas|este|esta|estos|estas|ese|esa|esos|esas|aquel|aquella|aquellos|aquellas)\b/gi,
      /\b(tía|tío|abuela|abuelo|mamá|papá|hermano|hermana|primo|prima|sobrino|sobrina|familia)\b/gi,
      /\b(pozole|tamales|tacos|burritos|enchiladas|quesadillas|mole|salsa|guacamole|tortilla|frijoles|arroz|plátano|aguacate|chile|jalapeño)\b/gi,
      /\b(mugroso|mugrosa|mugrosos|mugrosas|sucio|sucia|sucios|sucias|limpio|limpia|limpios|limpias|ayuda|ayudar|ayudan|ayudamos|ayudé|ayudó|nadie|nadie|nadie|nadie|nadie)\b/gi,
      /\b(sí|no|gracias|por favor|perdón|disculpa|hola|adiós|buenos días|buenas tardes|buenas noches|qué|cómo|cuándo|dónde|por qué|quién|quiénes)\b/gi,
    ];

    // Count Spanish indicators
    let spanishScore = 0;
    for (const pattern of spanishPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        spanishScore += matches.length;
      }
    }

    // Spanish character names (common patterns)
    const spanishNames = /\b([A-Z][a-z]+)\s+(Lourdes|Gabriel|Chava|Maria|Jose|Carlos|Ana|Luis|Miguel|Francisco|Carmen|Rosa|Antonio|Manuel|Pedro|Juan|Fernando|Ricardo|Alejandro|Roberto|Daniel|Javier|Sergio|Eduardo|Alberto|Andres|Raul|Oscar|Mario|Rafael|Enrique|Jorge|Alfredo|Armando|Felipe|Victor|Ramon|Salvador|Hector|Arturo|Ignacio|Guillermo|Gustavo|Rodrigo|Pablo|Adrian|Julio|Esteban|Diego|Emilio|Cesar|Alonso|Gerardo|Marco|Ivan|Leonardo|Nicolas|Sebastian|Gabriel|Santiago|Matias|Benjamin|Samuel|David|Isaac|Aaron|Elias|Noah|Lucas|Daniel|Mateo|Santiago|Sebastian|Benjamin|Samuel|David|Isaac|Aaron|Elias|Noah|Lucas)\b/g;
    const nameMatches = text.match(spanishNames);
    if (nameMatches) {
      spanishScore += nameMatches.length * 2;
    }

    // Calculate ratio
    const wordCount = text.split(/\s+/).length;
    const spanishRatio = spanishScore / Math.max(wordCount, 1);

    // Determine language
    if (spanishRatio > 0.1) {
      // Significant Spanish content
      if (spanishRatio > 0.3) {
        return 'es'; // Primarily Spanish
      }
      return 'en-es'; // Mixed English-Spanish
    }

    return 'en'; // Primarily English
  }

  /**
   * Extract Spanish terms from text
   */
  extractSpanishTerms(text: string): string[] {
    const terms: string[] = [];
    
    // Common Spanish family terms
    const familyTerms = /\b(tía|tío|abuela|abuelo|mamá|papá|hermano|hermana|primo|prima|sobrino|sobrina|familia)\b/gi;
    const familyMatches = text.match(familyTerms);
    if (familyMatches) {
      terms.push(...familyMatches.map(m => m.toLowerCase()));
    }

    // Common Spanish food terms
    const foodTerms = /\b(pozole|tamales|tacos|burritos|enchiladas|quesadillas|mole|salsa|guacamole|tortilla|frijoles|arroz|plátano|aguacate|chile|jalapeño)\b/gi;
    const foodMatches = text.match(foodTerms);
    if (foodMatches) {
      terms.push(...foodMatches.map(m => m.toLowerCase()));
    }

    // Common Spanish descriptive terms
    const descriptiveTerms = /\b(mugroso|mugrosa|mugrosos|mugrosas|sucio|sucia|sucios|sucias|limpio|limpia|limpios|limpias)\b/gi;
    const descMatches = text.match(descriptiveTerms);
    if (descMatches) {
      terms.push(...descMatches.map(m => m.toLowerCase()));
    }

    // Common Spanish action terms
    const actionTerms = /\b(ayuda|ayudar|ayudan|ayudamos|ayudé|ayudó|nadie|nadie)\b/gi;
    const actionMatches = text.match(actionTerms);
    if (actionMatches) {
      terms.push(...actionMatches.map(m => m.toLowerCase()));
    }

    // Remove duplicates
    return Array.from(new Set(terms));
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

