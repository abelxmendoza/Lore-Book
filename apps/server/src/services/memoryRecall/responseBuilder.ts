/**
 * Response Builder for Memory Recall Engine
 * 
 * Builds confidence-aware explanations and shapes responses
 * based on persona mode.
 */

import { logger } from '../../logger';
import { beliefRealityReconciliationService } from '../beliefRealityReconciliationService';
import type { RecallResult, RecallIntent, PersonaMode } from './types';

export class ResponseBuilder {
  /**
   * Build explanation for recall result
   */
  buildRecallExplanation(intent: RecallIntent, results: RecallResult): string {
    if (results.entries.length === 0 && results.events.length === 0) {
      return "I don't see a clear match in past records.";
    }

    if (intent.confidence_level === 'LOW') {
      return 'This is a tentative recall based on limited similarity.';
    }

    if (results.confidence < 0.5) {
      return 'This recall is based on partial similarity to past moments.';
    }

    if (intent.type === 'EMOTIONAL_SIMILARITY') {
      return `Found ${results.entries.length} past moment${results.entries.length > 1 ? 's' : ''} with similar emotional context.`;
    }

    if (intent.type === 'TEMPORAL_COMPARISON') {
      return `Found ${results.entries.length} relevant past moment${results.entries.length > 1 ? 's' : ''} in chronological order.`;
    }

    if (intent.type === 'PATTERN_LOOKBACK') {
      return `Found ${results.entries.length} past moment${results.entries.length > 1 ? 's' : ''} that may relate to this pattern.`;
    }

    return `Found ${results.entries.length} relevant past moment${results.entries.length > 1 ? 's' : ''} based on similarity.`;
  }

  /**
   * Shape recall response based on persona
   */
  shapeRecallResponse(result: RecallResult, persona?: PersonaMode): RecallResult {
    if (persona === 'ARCHIVIST') {
      return this.stripInterpretiveLanguage(result);
    }

    if (result.confidence < 0.5) {
      return this.softenLanguage(result);
    }

    return result;
  }

  /**
   * Strip interpretive language for Archivist persona
   */
  private stripInterpretiveLanguage(result: RecallResult): RecallResult {
    // Archivist mode: only factual statements
    const archivistExplanation = result.entries.length > 0
      ? `Found ${result.entries.length} record${result.entries.length > 1 ? 's' : ''} matching your query.`
      : 'No records found matching your query.';

    return {
      ...result,
      explanation: archivistExplanation,
    };
  }

  /**
   * Soften language for low confidence
   */
  private softenLanguage(result: RecallResult): RecallResult {
    const softenedExplanation = result.entries.length > 0
      ? `This appears to match ${result.entries.length} past moment${result.entries.length > 1 ? 's' : ''}, though the connection may be tentative.`
      : "I don't see a strong match, but there may be related moments I'm not confident about.";

    return {
      ...result,
      explanation: softenedExplanation,
    };
  }

  /**
   * Format recall result for chat display
   */
  async formatRecallForChat(result: RecallResult, userId?: string): Promise<string> {
    if (result.silence) {
      return result.silence.message;
    }

    const parts: string[] = [];

    // Add explanation
    parts.push(result.explanation);

    // Add confidence indicator if low
    if (result.confidence < 0.6) {
      parts.push(`(Confidence: ${this.humanizeConfidence(result.confidence)})`);
    }

    // Add entry summaries with epistemic awareness
    if (result.entries.length > 0) {
      parts.push('\n\n**Relevant moments:**');
      const entries = result.entries.slice(0, 3);
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index];
        const date = new Date(entry.date).toLocaleDateString();
        const preview = entry.content.substring(0, 100);
        const knowledgeType = entry.metadata?.knowledge_type as string | undefined;
        
        // Add epistemic context if available
        let typeLabel = '';
        if (knowledgeType === 'EXPERIENCE') {
          typeLabel = ' (from your experience)';
        } else if (knowledgeType === 'FEELING') {
          typeLabel = ' (from what you felt)';
        } else if (knowledgeType === 'BELIEF') {
          typeLabel = ' (from what you thought)';
          
          // BRRE: Add belief resolution context
          const beliefUnitId = entry.metadata?.knowledge_unit_id as string | undefined;
          if (beliefUnitId && userId) {
            try {
              const resolution = await beliefRealityReconciliationService.getResolutionForBelief(
                userId,
                beliefUnitId
              ).catch(() => null);
              
              if (resolution) {
                const resolutionLanguage = beliefRealityReconciliationService.getBeliefLanguage(resolution);
                if (resolution.status === 'CONTRADICTED') {
                  typeLabel += ` — ${resolutionLanguage}`;
                }
              }
            } catch (error) {
              // Fail silently
            }
          }
        } else if (knowledgeType === 'FACT') {
          typeLabel = ' (verifiable fact)';
        }
        
        parts.push(`${index + 1}. [${date}]${typeLabel} ${preview}${entry.content.length > 100 ? '...' : ''}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Humanize confidence score
   */
  private humanizeConfidence(confidence: number): string {
    if (confidence >= 0.8) return 'high';
    if (confidence >= 0.6) return 'moderate';
    if (confidence >= 0.4) return 'low';
    return 'very low';
  }
}

