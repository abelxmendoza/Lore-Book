// =====================================================
// PERSONA CONTROLLER
// Purpose: Enforce persona rules (hard constraints)
// Now uses Sensemaking Contracts (Phase 3)
// =====================================================

import { logger } from '../logger';
import type { SensemakingContract } from '../contracts/sensemakingContract';
import { ARCHIVIST_CONTRACT, ANALYST_CONTRACT, REFLECTOR_CONTRACT } from '../contracts/sensemakingContract';

export type Persona = 'DEFAULT' | 'ARCHIVIST' | 'REFLECTOR';

export interface PersonaRules {
  allow_interpretation: boolean;
  allow_advice: boolean;
  allow_emotional_framing: boolean;
  allow_predictions: boolean;
}

/**
 * Map persona to contract
 * 
 * Personas are now views, not agents.
 * They bind to contracts that govern memory access.
 */
export function getContractForPersona(persona: Persona): SensemakingContract {
  switch (persona) {
    case 'ARCHIVIST':
      return ARCHIVIST_CONTRACT;
    case 'REFLECTOR':
      return REFLECTOR_CONTRACT;
    case 'DEFAULT':
    default:
      // Default uses Reflector contract (allows more types)
      return REFLECTOR_CONTRACT;
  }
}

/**
 * Legacy persona rules (for backward compatibility)
 * These are now derived from contracts
 */
export const ARCHIVIST_RULES: PersonaRules = {
  allow_interpretation: false,
  allow_advice: false,
  allow_emotional_framing: false,
  allow_predictions: false,
};

export const DEFAULT_RULES: PersonaRules = {
  allow_interpretation: true,
  allow_advice: true,
  allow_emotional_framing: true,
  allow_predictions: true,
};

export interface PersonaResponse {
  text: string;
  tone: string;
  footer?: string;
}

export class PersonaController {
  /**
   * Get contract for persona
   */
  getContract(persona: Persona): SensemakingContract {
    return getContractForPersona(persona);
  }

  /**
   * Apply persona rules to response
   * 
   * Now uses contracts to determine what's allowed
   */
  applyPersona(response: { text: string; tone?: string }, persona: Persona): PersonaResponse {
    const contract = getContractForPersona(persona);
    const rules = persona === 'ARCHIVIST' ? ARCHIVIST_RULES : DEFAULT_RULES;

    let processedText = response.text;

    if (persona === 'ARCHIVIST') {
      // Strip interpretation
      if (!rules.allow_interpretation) {
        processedText = this.stripInterpretation(processedText);
      }

      // Strip advice
      if (!rules.allow_advice) {
        processedText = this.stripAdvice(processedText);
      }

      // Strip speculation/predictions
      if (!rules.allow_predictions) {
        processedText = this.stripSpeculation(processedText);
      }

      // Remove emotional framing
      if (!rules.allow_emotional_framing) {
        processedText = this.stripEmotionalFraming(processedText);
      }

      return {
        text: processedText,
        tone: 'FACTUAL',
        footer: 'Archivist mode: factual recall only.',
      };
    }

    return {
      text: processedText,
      tone: response.tone || 'CONVERSATIONAL',
    };
  }

  /**
   * Strip interpretation from text
   */
  private stripInterpretation(text: string): string {
    // Remove phrases like "This suggests...", "It seems...", "This indicates..."
    const interpretationPatterns = [
      /(This suggests|It suggests|This indicates|It indicates|This implies|It implies|This means|It means|This shows|It shows|This reveals|It reveals)[^.]*\./gi,
      /(I think|I believe|I feel|In my opinion|From my perspective)[^.]*\./gi,
    ];

    let cleaned = text;
    for (const pattern of interpretationPatterns) {
      cleaned = cleaned.replace(pattern, '');
    }

    return cleaned.trim();
  }

  /**
   * Strip advice from text
   */
  private stripAdvice(text: string): string {
    // Remove phrases like "You should...", "I recommend...", "Try...", "Consider..."
    const advicePatterns = [
      /(You should|You could|You might|I recommend|I suggest|Try|Consider|Maybe you|Perhaps you|I'd suggest|I'd recommend)[^.]*\./gi,
      /(Why don't you|How about|What if you)[^.]*\./gi,
    ];

    let cleaned = text;
    for (const pattern of advicePatterns) {
      cleaned = cleaned.replace(pattern, '');
    }

    return cleaned.trim();
  }

  /**
   * Strip speculation/predictions from text
   */
  private stripSpeculation(text: string): string {
    // Remove phrases like "This might...", "It could...", "Perhaps...", "Maybe..."
    const speculationPatterns = [
      /(This might|It might|This could|It could|This may|It may|Perhaps|Maybe|Possibly|Potentially)[^.]*\./gi,
      /(I predict|I expect|I anticipate|It's likely|It's possible)[^.]*\./gi,
    ];

    let cleaned = text;
    for (const pattern of speculationPatterns) {
      cleaned = cleaned.replace(pattern, '');
    }

    return cleaned.trim();
  }

  /**
   * Strip emotional framing from text
   */
  private stripEmotionalFraming(text: string): string {
    // Remove emotional language, keep factual content
    // This is a simplified version - in production, use more sophisticated NLP
    const emotionalPatterns = [
      /\b(I'm sorry|I understand|That must be|That sounds|I can imagine|I feel for you)\b/gi,
      /\b(Unfortunately|Sadly|Thankfully|Luckily|Happily)\b/gi,
    ];

    let cleaned = text;
    for (const pattern of emotionalPatterns) {
      cleaned = cleaned.replace(pattern, '');
    }

    return cleaned.trim();
  }
}

export const personaController = new PersonaController();

