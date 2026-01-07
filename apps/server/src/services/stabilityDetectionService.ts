// =====================================================
// STABILITY DETECTION SERVICE
// Purpose: Detect when nothing notable exists and prevent over-interpretation
// =====================================================

import { logger } from '../logger';

export type StabilityState =
  | 'STABLE_EMPTY'
  | 'STABLE_CONTINUATION'
  | 'UNSTABLE_UNCLEAR'
  | 'SIGNAL_PRESENT';

export interface StabilitySignals {
  event_count: number;
  contradictions: number;
  confidence_variance: number;
  new_entities: number;
  pattern_strength: number;
}

export interface SilenceResponse {
  type: 'SILENCE';
  message: string;
  confidence: 'HIGH';
  why: string;
  stability_state: StabilityState;
}

interface StabilityContext {
  events: Array<{ confidence: number }>;
  hasContradictions?: boolean;
  newEntities?: Array<any>;
  patternStrength?: number;
}

export class StabilityDetectionService {
  private readonly LOW_THRESHOLD = 0.3;
  private readonly LOW_VARIANCE = 0.1;
  private readonly HIGH_VARIANCE = 0.3;

  /**
   * Detect stability state from context
   */
  detectStability(context: StabilityContext): StabilityState {
    const signals = this.extractSignals(context);

    // Empty state: no events at all
    if (signals.event_count === 0) {
      return 'STABLE_EMPTY';
    }

    // Stable continuation: low pattern strength, no new entities, low variance
    if (
      signals.pattern_strength < this.LOW_THRESHOLD &&
      signals.new_entities === 0 &&
      signals.confidence_variance < this.LOW_VARIANCE
    ) {
      return 'STABLE_CONTINUATION';
    }

    // Unstable unclear: contradictions present and high variance
    if (signals.contradictions > 0 && signals.confidence_variance > this.HIGH_VARIANCE) {
      return 'UNSTABLE_UNCLEAR';
    }

    // Signal present: something notable exists
    return 'SIGNAL_PRESENT';
  }

  /**
   * Extract stability signals from context
   */
  private extractSignals(context: StabilityContext): StabilitySignals {
    const event_count = context.events?.length || 0;
    const contradictions = context.hasContradictions ? 1 : 0;
    const new_entities = context.newEntities?.length || 0;
    const pattern_strength = context.patternStrength || 0;

    // Calculate confidence variance
    let confidence_variance = 0;
    if (context.events && context.events.length > 0) {
      const confidences = context.events.map(e => e.confidence || 0.5);
      const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
      const varianceSum = confidences.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0);
      confidence_variance = varianceSum / confidences.length;
    }

    return {
      event_count,
      contradictions,
      confidence_variance,
      new_entities,
      pattern_strength,
    };
  }

  /**
   * Gate response based on stability
   */
  gateResponse(context: StabilityContext): SilenceResponse | null {
    const stability = this.detectStability(context);

    switch (stability) {
      case 'STABLE_EMPTY':
        return {
          type: 'SILENCE',
          message: 'Nothing notable stands out during this period.',
          confidence: 'HIGH',
          why: 'No events or data points were found in this timeframe.',
          stability_state: stability,
        };

      case 'STABLE_CONTINUATION':
        return {
          type: 'SILENCE',
          message: 'This period appears stable and consistent.',
          confidence: 'HIGH',
          why: 'No strong patterns, new entities, or significant changes detected.',
          stability_state: stability,
        };

      case 'UNSTABLE_UNCLEAR':
        return {
          type: 'SILENCE',
          message: "There isn't enough clarity yet to draw conclusions.",
          confidence: 'HIGH',
          why: 'Conflicting information and high variance detected. More data needed.',
          stability_state: stability,
        };

      case 'SIGNAL_PRESENT':
        return null; // Allow normal response

      default:
        return null;
    }
  }

  /**
   * Get stability message for UI
   */
  getStabilityMessage(stability: StabilityState): string {
    switch (stability) {
      case 'STABLE_EMPTY':
        return 'Nothing notable stands out during this period.';
      case 'STABLE_CONTINUATION':
        return 'This period appears stable and consistent.';
      case 'UNSTABLE_UNCLEAR':
        return "There isn't enough clarity yet to draw conclusions.";
      case 'SIGNAL_PRESENT':
        return 'Notable patterns and changes detected.';
      default:
        return 'Stability state unknown.';
    }
  }

  /**
   * Get stability explanation
   */
  getStabilityExplanation(stability: StabilityState): string {
    switch (stability) {
      case 'STABLE_EMPTY':
        return 'The system did not detect any events or data points in this timeframe.';
      case 'STABLE_CONTINUATION':
        return 'The system did not detect strong changes or patterns. This is normal and indicates stability.';
      case 'UNSTABLE_UNCLEAR':
        return 'The system detected conflicting information and needs more clarity before drawing conclusions.';
      case 'SIGNAL_PRESENT':
        return 'The system detected notable patterns, changes, or events.';
      default:
        return 'Stability state could not be determined.';
    }
  }
}

export const stabilityDetectionService = new StabilityDetectionService();

