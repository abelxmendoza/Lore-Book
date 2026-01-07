/**
 * Memory Recall Engine (MRE)
 * 
 * Main service for natural-language recall of past moments,
 * emotions, patterns, and contexts with confidence gating.
 */

import { logger } from '../../logger';
import { stabilityDetectionService } from '../stabilityDetectionService';
import { IntentParser } from './intentParser';
import { CandidateRetriever } from './candidateRetriever';
import { RankingService } from './rankingService';
import { ResponseBuilder } from './responseBuilder';
import type {
  RecallQuery,
  RecallResult,
  RecallIntent,
  RecallSilenceResponse,
} from './types';

export class MemoryRecallEngine {
  private intentParser: IntentParser;
  private candidateRetriever: CandidateRetriever;
  private rankingService: RankingService;
  private responseBuilder: ResponseBuilder;

  constructor() {
    this.intentParser = new IntentParser();
    this.candidateRetriever = new CandidateRetriever();
    this.rankingService = new RankingService();
    this.responseBuilder = new ResponseBuilder();
  }

  /**
   * Execute recall query and return results
   */
  async executeRecall(query: RecallQuery): Promise<RecallResult> {
    try {
      logger.debug({ userId: query.user_id, query: query.raw_text }, 'Executing recall');

      // 1. Parse intent
      const intent = this.intentParser.parseRecallIntent(query);

      // 2. Check stability/silence gating
      const stability = await this.checkStabilityForRecall(query.user_id, intent);
      if (stability.is_silence) {
        return {
          entries: [],
          events: [],
          confidence: 1.0,
          explanation: stability.response.reason,
          silence: stability.response,
        };
      }

      // 3. Retrieve candidates
      const candidates = await this.candidateRetriever.retrieveCandidates(
        query.user_id,
        intent
      );

      // 4. Rank candidates
      const ranked = await this.rankingService.rankCandidates(
        candidates,
        intent,
        query.raw_text,
        query.user_id
      );

      // 5. Compute confidence
      const confidence = this.rankingService.computeRecallConfidence(ranked);

      // 6. Build explanation
      const result: RecallResult = {
        entries: ranked.entries,
        events: ranked.events,
        confidence,
        explanation: '',
      };

      result.explanation = this.responseBuilder.buildRecallExplanation(intent, result);

      // 7. Shape response based on persona
      const shaped = this.responseBuilder.shapeRecallResponse(result, query.persona);

      logger.debug(
        {
          userId: query.user_id,
          intentType: intent.type,
          resultCount: shaped.entries.length,
          confidence: shaped.confidence,
        },
        'Recall execution completed'
      );

      return shaped;
    } catch (error) {
      logger.error({ error, query }, 'Failed to execute recall');
      return {
        entries: [],
        events: [],
        confidence: 0.0,
        explanation: 'An error occurred while searching your memories.',
      };
    }
  }

  /**
   * Handle recall in chat context
   */
  async handleRecallChat(query: RecallQuery): Promise<string> {
    const result = await this.executeRecall(query);

    if (result.silence) {
      return result.silence.message;
    }

    return await this.responseBuilder.formatRecallForChat(result, query.user_id);
  }

  /**
   * Check stability for recall (silence gating)
   */
  private async checkStabilityForRecall(
    userId: string,
    intent: RecallIntent
  ): Promise<{ is_silence: boolean; response?: RecallSilenceResponse }> {
    // For now, we'll skip strict silence gating for recall
    // Users should be able to query even if patterns are weak
    // This can be enhanced later with more sophisticated gating

    // If confidence is very low and no specific intent, suggest silence
    if (intent.confidence_level === 'LOW' && intent.type === 'GENERAL_RECALL') {
      return {
        is_silence: false, // Still allow, but with low confidence
        response: undefined,
      };
    }

    return { is_silence: false };
  }
}

// Export singleton instance
export const memoryRecallEngine = new MemoryRecallEngine();

