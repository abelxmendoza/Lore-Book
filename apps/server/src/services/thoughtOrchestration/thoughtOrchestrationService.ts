/**
 * Thought Orchestration Service
 * 
 * Main entry point for handling passing thoughts.
 * Coordinates classification, insecurity matching, and response generation.
 * 
 * Target: <300ms end-to-end
 */

import { logger } from '../../logger';
import { thoughtClassificationService } from '../thoughtClassification/thoughtClassificationService';
import { insecurityGraphService } from '../insecurityGraph/insecurityGraphService';
import { thoughtResponseService } from '../thoughtResponse/thoughtResponseService';

export interface ThoughtProcessingResult {
  classification: {
    type: string;
    confidence: number;
  };
  insecurity_matches: Array<{
    theme: string;
    domain: string;
    frequency: number;
    match_confidence: number;
  }>;
  response: {
    posture: string;
    text: string;
  };
  processing_time_ms: number;
}

class ThoughtOrchestrationService {
  /**
   * Process a passing thought end-to-end
   * 
   * Steps:
   * 1. Classify thought type (<100ms)
   * 2. Check insecurity graph (<50ms)
   * 3. Determine response posture (<50ms)
   * 4. Generate response (<100ms)
   * 
   * Total target: <300ms
   */
  async processThought(
    userId: string,
    thoughtText: string,
    options?: {
      entryId?: string;
      messageId?: string;
    }
  ): Promise<ThoughtProcessingResult> {
    const startTime = Date.now();

    try {
      // Step 1: Classify thought
      const classification = await thoughtClassificationService.classifyThought(
        userId,
        thoughtText,
        options
      );

      // Step 2: Check insecurity graph (if it's an insecurity)
      let insecurityMatches: Array<{
        theme: string;
        domain: string;
        frequency: number;
        match_confidence: number;
      }> = [];

      if (classification.thought_type === 'insecurity' || classification.thought_type === 'mixed') {
        const matches = await insecurityGraphService.findMatchingPatterns(
          userId,
          classification
        );

        // Record the insecurity pattern
        if (matches.length > 0) {
          await insecurityGraphService.recordInsecurity(
            userId,
            classification,
            matches
          );
        }

        insecurityMatches = matches.map(m => ({
          theme: m.pattern.theme,
          domain: m.pattern.domain,
          frequency: m.pattern.frequency,
          match_confidence: m.match_confidence,
        }));
      }

      // Step 3 & 4: Generate response
      const response = await thoughtResponseService.generateResponse(
        userId,
        classification,
        insecurityMatches.map(m => ({
          pattern: {
            id: '',
            user_id: userId,
            theme: m.theme,
            domain: m.domain,
            frequency: m.frequency,
            first_seen_at: '',
            last_seen_at: '',
            intensity_trend: 'stable',
            average_intensity: 0.5,
            related_themes: [],
            context_patterns: {},
            metadata: {},
            created_at: '',
            updated_at: '',
          },
          match_confidence: m.match_confidence,
        }))
      );

      const processingTime = Date.now() - startTime;

      logger.debug(
        { 
          userId, 
          thoughtType: classification.thought_type,
          posture: response.response_posture,
          processingTime 
        },
        'Thought processed'
      );

      return {
        classification: {
          type: classification.thought_type,
          confidence: classification.confidence,
        },
        insecurity_matches: insecurityMatches,
        response: {
          posture: response.response_posture,
          text: response.response_text,
        },
        processing_time_ms: processingTime,
      };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to process thought');
      throw error;
    }
  }

  /**
   * Quick classification only (for real-time UI feedback)
   */
  async quickClassify(
    userId: string,
    thoughtText: string
  ): Promise<{ type: string; confidence: number }> {
    const classification = await thoughtClassificationService.classifyThought(
      userId,
      thoughtText
    );

    return {
      type: classification.thought_type,
      confidence: classification.confidence,
    };
  }
}

export const thoughtOrchestrationService = new ThoughtOrchestrationService();
