// =====================================================
// SELF-AWARENESS SERVICE
// Purpose: Detect uncertainty and shape responses with appropriate tone
// =====================================================

import { logger } from '../logger';

export type UncertaintyLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

interface UncertaintySignals {
  hasContradictions: boolean;
  lowConfidence: boolean;
  limitedData: boolean;
  conflictingSources: boolean;
}

interface UncertaintyDetection {
  level: UncertaintyLevel;
  signals: string[];
}

interface ConfidenceDetection {
  level: ConfidenceLevel;
  reason: string;
}

interface ToneModifiers {
  soft_language: boolean;
  acknowledge_alternatives: boolean;
  avoid_assertions: boolean;
  tentative_language: boolean;
  explicit_uncertainty: boolean;
  neutral_observational: boolean;
}

interface SelfAwarenessContext {
  event?: {
    confidence: number;
    source_count: number;
  };
  hasContradictions?: boolean;
  sources?: Array<{ confidence: number }>;
  scope?: 'EVENT' | 'GENERAL' | 'ENTITY';
  triggeredByPattern?: boolean;
  linkedToGoal?: boolean;
}

export class SelfAwarenessService {
  /**
   * Detect uncertainty in context
   */
  detectUncertainty(context: SelfAwarenessContext): UncertaintyDetection {
    const signals: string[] = [];
    const uncertaintySignals: UncertaintySignals = {
      hasContradictions: context.hasContradictions || false,
      lowConfidence: context.event ? context.event.confidence < 0.5 : false,
      limitedData: context.event ? context.event.source_count < 2 : false,
      conflictingSources: false,
    };

    // Check for conflicting sources
    if (context.sources && context.sources.length > 1) {
      const confidences = context.sources.map(s => s.confidence);
      const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
      const variance = confidences.reduce((sum, c) => sum + Math.pow(c - avgConfidence, 2), 0) / confidences.length;
      if (variance > 0.1) {
        uncertaintySignals.conflictingSources = true;
        signals.push('CONFLICTING_SOURCES');
      }
    }

    if (uncertaintySignals.hasContradictions) {
      signals.push('CONTRADICTION');
    }

    if (uncertaintySignals.lowConfidence) {
      signals.push('LOW_CONFIDENCE');
    }

    if (uncertaintySignals.limitedData) {
      signals.push('LIMITED_DATA');
    }

    // Derive level
    let level: UncertaintyLevel = 'LOW';
    if (signals.length >= 3 || uncertaintySignals.hasContradictions) {
      level = 'HIGH';
    } else if (signals.length >= 2) {
      level = 'MEDIUM';
    }

    return { level, signals };
  }

  /**
   * Detect confidence level
   */
  detectConfidence(context: SelfAwarenessContext): ConfidenceDetection {
    if (!context.event) {
      return {
        level: 'MEDIUM',
        reason: 'No specific event context',
      };
    }

    const confidence = context.event.confidence;
    let level: ConfidenceLevel;
    let reason: string;

    if (confidence >= 0.7) {
      level = 'HIGH';
      reason = `High confidence based on ${context.event.source_count} sources`;
    } else if (confidence >= 0.4) {
      level = 'MEDIUM';
      reason = `Mixed confidence from ${context.event.source_count} sources`;
    } else {
      level = 'LOW';
      reason = `Low confidence - still forming from limited data`;
    }

    return { level, reason };
  }

  /**
   * Build self-awareness tone modifiers
   */
  buildSelfAwarenessTone(
    uncertainty: UncertaintyDetection,
    confidence: ConfidenceDetection
  ): ToneModifiers {
    const modifiers: ToneModifiers = {
      soft_language: false,
      acknowledge_alternatives: false,
      avoid_assertions: false,
      tentative_language: false,
      explicit_uncertainty: false,
      neutral_observational: true,
    };

    if (uncertainty.level === 'HIGH') {
      modifiers.soft_language = true;
      modifiers.acknowledge_alternatives = true;
      modifiers.avoid_assertions = true;
      modifiers.explicit_uncertainty = true;
      modifiers.neutral_observational = false;
    } else if (uncertainty.level === 'MEDIUM') {
      modifiers.tentative_language = true;
      modifiers.explicit_uncertainty = true;
    } else if (confidence.level === 'LOW') {
      modifiers.tentative_language = true;
      modifiers.explicit_uncertainty = true;
    }

    return modifiers;
  }

  /**
   * Apply tone modifiers to text
   */
  applyTone(text: string, modifiers: ToneModifiers): string {
    let modified = text;

    if (modifiers.explicit_uncertainty) {
      modified = `This appears to be the case, though it may not capture everything. ${modified}`;
    }

    if (modifiers.acknowledge_alternatives) {
      modified = `${modified} There may be other interpretations based on context.`;
    }

    if (modifiers.tentative_language && !modified.includes('appears') && !modified.includes('seems')) {
      // Add tentative language if not already present
      modified = modified.replace(/^([A-Z])/, (match) => {
        return match.toLowerCase();
      });
      modified = `It seems ${modified}`;
    }

    return modified;
  }

  /**
   * Build "why am I seeing this?" statement
   */
  buildWhyStatement(context: SelfAwarenessContext): string {
    const reasons: string[] = [];

    if (context.scope === 'EVENT') {
      reasons.push('Because you were discussing this specific moment');
    }

    if (context.triggeredByPattern) {
      reasons.push('Because this pattern appeared multiple times');
    }

    if (context.linkedToGoal) {
      reasons.push('Because this relates to a declared goal');
    }

    if (reasons.length === 0) {
      return 'Based on your conversations and memories';
    }

    return reasons.join(' · ');
  }

  /**
   * Humanize confidence level
   */
  humanizeConfidence(confidence: number): string {
    if (confidence >= 0.7) {
      return 'High confidence';
    } else if (confidence >= 0.4) {
      return 'Mixed confidence';
    } else {
      return 'Still forming';
    }
  }
}

export const selfAwarenessService = new SelfAwarenessService();

