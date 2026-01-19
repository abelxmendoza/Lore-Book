// =====================================================
// EXPRESSION ROUTING SERVICE
// Purpose: Route to appropriate expression mode based on intent and tone profile
// =====================================================

import { logger } from '../logger';

import type { UserIntent } from './intentDetectionService';

export type ExpressionMode =
  | 'SUPPORTIVE'
  | 'SOCIAL_FOCUS'
  | 'FACTUAL'
  | 'ANALYTICAL'
  | 'STRATEGIC'
  | 'MINIMAL';

export type Verbosity = 'LOW' | 'MEDIUM' | 'HIGH';
export type EmotionalDistance = 'CLOSE' | 'NEUTRAL' | 'DISTANT';
export type ReflectionDepth = 'LIGHT' | 'MEDIUM' | 'DEEP';
export type InsightFrequency = 'RARE' | 'OCCASIONAL' | 'FREQUENT';

export interface UserToneProfile {
  verbosity: Verbosity;
  emotional_distance: EmotionalDistance;
  reflection_depth: ReflectionDepth;
  insight_frequency: InsightFrequency;
}

export class ExpressionRoutingService {
  /**
   * Route to expression mode based on intent and tone profile
   */
  routeExpression(intent: UserIntent, toneProfile: UserToneProfile): ExpressionMode {
    switch (intent) {
      case 'VENTING':
        return 'SUPPORTIVE';

      case 'REFLECTION':
        return 'SUPPORTIVE';

      case 'SOCIAL_DISCUSSION':
        return 'SOCIAL_FOCUS';

      case 'FACTUAL_RECALL':
        return 'FACTUAL';

      case 'STRATEGIC_THINKING':
        return 'STRATEGIC';

      case 'PATTERN_INQUIRY':
        return 'ANALYTICAL';

      case 'CASUAL_CHAT':
        if (toneProfile.verbosity === 'LOW') {
          return 'MINIMAL';
        } else {
          return 'FACTUAL';
        }

      default:
        return 'FACTUAL';
    }
  }

  /**
   * Get default tone profile (can be customized per user later)
   */
  getDefaultToneProfile(): UserToneProfile {
    return {
      verbosity: 'MEDIUM',
      emotional_distance: 'NEUTRAL',
      reflection_depth: 'MEDIUM',
      insight_frequency: 'OCCASIONAL',
    };
  }

  /**
   * Humanize expression mode for UI
   */
  humanizeExpressionMode(mode: ExpressionMode): string {
    switch (mode) {
      case 'SUPPORTIVE':
        return 'Supportive';
      case 'SOCIAL_FOCUS':
        return 'Social';
      case 'FACTUAL':
        return 'Factual';
      case 'ANALYTICAL':
        return 'Analytical';
      case 'STRATEGIC':
        return 'Strategic';
      case 'MINIMAL':
        return 'Minimal';
      default:
        return 'Standard';
    }
  }
}

export const expressionRoutingService = new ExpressionRoutingService();

