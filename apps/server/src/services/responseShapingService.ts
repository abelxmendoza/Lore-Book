// =====================================================
// RESPONSE SHAPING SERVICE
// Purpose: Shape responses based on expression mode and tone profile
// =====================================================

import { logger } from '../logger';

import type { ExpressionMode, UserToneProfile } from './expressionRoutingService';

type Modifier =
  | 'neutral_language'
  | 'warm_language'
  | 'concise'
  | 'expanded'
  | 'validate_emotion'
  | 'no_advice'
  | 'gentle_questions_optional'
  | 'relationship_language'
  | 'curiosity_without_conclusion'
  | 'avoid_character_judgment'
  | 'neutral_tone'
  | 'cite_events'
  | 'no_inference'
  | 'pattern_language'
  | 'uncertainty_acknowledged'
  | 'no_prescription'
  | 'scenario_framing'
  | 'tradeoff_language'
  | 'never_say_you_should'
  | 'short_response'
  | 'no_extra_insight';

interface ShapingContext {
  baseResponse: string;
  expressionMode: ExpressionMode;
  toneProfile: UserToneProfile;
  intent?: string;
}

export class ResponseShapingService {
  /**
   * Shape response based on expression mode and tone profile
   */
  shapeResponse(context: ShapingContext): string {
    const modifiers = this.buildModifiers(context);
    return this.applyModifiers(context.baseResponse, modifiers, context);
  }

  /**
   * Build modifiers based on expression mode and tone profile
   */
  private buildModifiers(context: ShapingContext): Modifier[] {
    const modifiers: Modifier[] = [];

    // Emotional distance
    if (context.toneProfile.emotional_distance === 'DISTANT') {
      modifiers.push('neutral_language');
    } else if (context.toneProfile.emotional_distance === 'CLOSE') {
      modifiers.push('warm_language');
    }

    // Verbosity
    if (context.toneProfile.verbosity === 'LOW') {
      modifiers.push('concise');
    } else if (context.toneProfile.verbosity === 'HIGH') {
      modifiers.push('expanded');
    }

    // Expression-specific rules
    switch (context.expressionMode) {
      case 'SUPPORTIVE':
        modifiers.push('validate_emotion', 'no_advice', 'gentle_questions_optional');
        break;

      case 'SOCIAL_FOCUS':
        modifiers.push(
          'relationship_language',
          'curiosity_without_conclusion',
          'avoid_character_judgment'
        );
        break;

      case 'FACTUAL':
        modifiers.push('neutral_tone', 'cite_events', 'no_inference');
        break;

      case 'ANALYTICAL':
        modifiers.push('pattern_language', 'uncertainty_acknowledged', 'no_prescription');
        break;

      case 'STRATEGIC':
        modifiers.push('scenario_framing', 'tradeoff_language', 'never_say_you_should');
        break;

      case 'MINIMAL':
        modifiers.push('short_response', 'no_extra_insight');
        break;
    }

    return modifiers;
  }

  /**
   * Apply modifiers to response text
   */
  private applyModifiers(
    response: string,
    modifiers: Modifier[],
    context: ShapingContext
  ): string {
    let shaped = response;

    // Concise: Trim to essential information
    if (modifiers.includes('concise')) {
      shaped = this.makeConcise(shaped);
    }

    // Expanded: Add more context
    if (modifiers.includes('expanded')) {
      shaped = this.expandResponse(shaped, context);
    }

    // Short response: Very brief
    if (modifiers.includes('short_response')) {
      shaped = this.makeShort(shaped);
    }

    // No extra insight: Remove speculative content
    if (modifiers.includes('no_extra_insight')) {
      shaped = this.removeExtraInsights(shaped);
    }

    // Warm language: Add empathetic framing
    if (modifiers.includes('warm_language')) {
      shaped = this.addWarmth(shaped);
    }

    // Neutral language: Remove emotional language
    if (modifiers.includes('neutral_language')) {
      shaped = this.makeNeutral(shaped);
    }

    // Validate emotion: Acknowledge feelings
    if (modifiers.includes('validate_emotion')) {
      shaped = this.validateEmotion(shaped, context);
    }

    // No advice: Remove prescriptive language
    if (modifiers.includes('no_advice') || modifiers.includes('never_say_you_should')) {
      shaped = this.removeAdvice(shaped);
    }

    // No inference: Remove speculative statements
    if (modifiers.includes('no_inference')) {
      shaped = this.removeInference(shaped);
    }

    // No prescription: Remove prescriptive language
    if (modifiers.includes('no_prescription')) {
      shaped = this.removePrescription(shaped);
    }

    return shaped;
  }

  /**
   * Make response concise
   */
  private makeConcise(text: string): string {
    // Remove filler words and trim to essential points
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length > 3) {
      return sentences.slice(0, 3).join('. ') + '.';
    }
    return text;
  }

  /**
   * Expand response with more context
   */
  private expandResponse(text: string, context: ShapingContext): string {
    // For now, just return as-is
    // In production, could add more context or examples
    return text;
  }

  /**
   * Make response very short
   */
  private makeShort(text: string): string {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length > 1) {
      return sentences[0] + '.';
    }
    return text;
  }

  /**
   * Remove extra insights
   */
  private removeExtraInsights(text: string): string {
    // Remove speculative phrases
    const patterns = [
      /(?:it seems|it appears|perhaps|maybe|possibly|likely).*?[.!?]/gi,
      /(?:this suggests|this indicates|this might).*?[.!?]/gi,
    ];

    let cleaned = text;
    patterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });

    return cleaned.trim() || text;
  }

  /**
   * Add warmth to response
   */
  private addWarmth(text: string): string {
    // Don't add warmth if already present
    if (text.toLowerCase().includes('understand') || text.toLowerCase().includes('feel')) {
      return text;
    }

    // Add empathetic opening if appropriate
    if (!text.toLowerCase().startsWith('i understand') && !text.toLowerCase().startsWith('i see')) {
      return text; // Keep original for now
    }

    return text;
  }

  /**
   * Make language neutral
   */
  private makeNeutral(text: string): string {
    // Remove emotional language
    const emotionalReplacements: [RegExp, string][] = [
      [/i understand how you feel/gi, 'based on the information'],
      [/i can see why/gi, 'considering'],
      [/that must be/gi, 'that is'],
    ];

    let neutral = text;
    emotionalReplacements.forEach(([pattern, replacement]) => {
      neutral = neutral.replace(pattern, replacement);
    });

    return neutral;
  }

  /**
   * Validate emotion in response
   */
  private validateEmotion(text: string, context: ShapingContext): string {
    // Add validation if not present
    if (!text.toLowerCase().includes('understand') && !text.toLowerCase().includes('makes sense')) {
      // Don't add if already factual
      if (context.expressionMode === 'FACTUAL') {
        return text;
      }
      // Could prepend validation, but for now keep original
    }
    return text;
  }

  /**
   * Remove advice from response
   */
  private removeAdvice(text: string): string {
    const advicePatterns = [
      /you should\s+[^.!?]*[.!?]/gi,
      /you need to\s+[^.!?]*[.!?]/gi,
      /i recommend\s+[^.!?]*[.!?]/gi,
      /you might want to\s+[^.!?]*[.!?]/gi,
      /consider\s+[^.!?]*[.!?]/gi,
    ];

    let cleaned = text;
    advicePatterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });

    return cleaned.trim() || text;
  }

  /**
   * Remove inference from response
   */
  private removeInference(text: string): string {
    const inferencePatterns = [
      /(?:this suggests|this indicates|this implies|this means).*?[.!?]/gi,
      /(?:it seems|it appears|likely|probably).*?[.!?]/gi,
    ];

    let cleaned = text;
    inferencePatterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });

    return cleaned.trim() || text;
  }

  /**
   * Remove prescription from response
   */
  private removePrescription(text: string): string {
    return this.removeAdvice(text);
  }

  /**
   * Build "why" statement for transparency
   */
  buildWhyStatement(intent: string, expressionMode: ExpressionMode): string {
    const intentMap: Record<string, string> = {
      VENTING: 'Because you were expressing emotions',
      REFLECTION: 'Because you were reflecting',
      SOCIAL_DISCUSSION: 'Because you were discussing relationships',
      FACTUAL_RECALL: 'Because you asked for facts',
      STRATEGIC_THINKING: 'Because you were thinking strategically',
      PATTERN_INQUIRY: 'Because you asked about patterns',
      CASUAL_CHAT: 'Based on your conversation',
    };

    const modeMap: Record<string, string> = {
      SUPPORTIVE: 'in a supportive way',
      SOCIAL_FOCUS: 'with a social focus',
      FACTUAL: 'factually',
      ANALYTICAL: 'analytically',
      STRATEGIC: 'strategically',
      MINIMAL: 'briefly',
    };

    const intentWhy = intentMap[intent] || 'Based on your message';
    const modeWhy = modeMap[expressionMode] || '';

    return modeWhy ? `${intentWhy}, ${modeWhy}` : intentWhy;
  }
}

export const responseShapingService = new ResponseShapingService();

