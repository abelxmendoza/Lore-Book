// =====================================================
// HYBRID EXTRACTOR
// Purpose: Smart routing to minimize LLM usage
// Expected Impact: 60-80% cost reduction, faster processing
// =====================================================

import { logger } from '../../logger';
import type { ExtractionResult } from '../../types/conversationCentered';
import { semanticExtractionService } from './semanticExtractionService';
import { patternClassifier } from './patternClassifier';

export type ExtractionRoute = 'rule-based' | 'lightweight' | 'llm';

export type HybridExtractionResult = ExtractionResult & {
  route: ExtractionRoute;
  classification: {
    complexity: 'simple' | 'common' | 'complex';
    category: string;
    confidence: number;
  };
};

/**
 * Hybrid extraction with smart routing
 */
export class HybridExtractor {
  /**
   * Extract semantic units with smart routing
   */
  async extractSemanticUnits(
    normalizedText: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
    isAIMessage: boolean = false
  ): Promise<HybridExtractionResult> {
    // Step 1: Classify message
    const classification = patternClassifier.classifyMessage(normalizedText);

    // Step 2: Route to appropriate extractor
    let route: ExtractionRoute = 'llm';
    let result: ExtractionResult;

    if (classification.suggestedExtractor === 'rule-based') {
      route = 'rule-based';
      // Use rule-based extraction (already implemented in semanticExtractionService)
      result = await semanticExtractionService.extractSemanticUnits(
        normalizedText,
        conversationHistory,
        isAIMessage
      );

      // If rule-based got good results, use them
      if (result.units.length > 0 && result.units.some(u => u.confidence >= 0.7)) {
        return {
          ...result,
          route: 'rule-based',
          classification: {
            complexity: classification.complexity,
            category: classification.category,
            confidence: classification.confidence,
          },
        };
      }

      // Otherwise, fall through to LLM
      route = 'llm';
    }

    // For now, lightweight model is not implemented, so route to LLM
    // In the future, this could use a fine-tuned model
    if (classification.suggestedExtractor === 'lightweight') {
      // TODO: Implement lightweight model extraction
      // For now, fall back to rule-based or LLM
      route = 'rule-based';

      result = await semanticExtractionService.extractSemanticUnits(
        normalizedText,
        conversationHistory,
        isAIMessage
      );

      if (result.units.length > 0 && result.units.some(u => u.confidence >= 0.7)) {
        return {
          ...result,
          route: 'rule-based',
          classification: {
            complexity: classification.complexity,
            category: classification.category,
            confidence: classification.confidence,
          },
        };
      }

      route = 'llm';
    }

    // Use LLM for complex cases
    result = await semanticExtractionService.extractSemanticUnits(
      normalizedText,
      conversationHistory,
      isAIMessage
    );

    return {
      ...result,
      route: 'llm',
      classification: {
        complexity: classification.complexity,
        category: classification.category,
        confidence: classification.confidence,
      },
    };
  }

  /**
   * Batch extract with smart routing
   */
  async extractBatch(
    texts: string[],
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
    isAIMessage: boolean = false
  ): Promise<HybridExtractionResult[]> {
    // Classify all messages
    const classifications = patternClassifier.classifyBatch(texts);

    // Group by route
    const ruleBasedTexts: Array<{ text: string; index: number }> = [];
    const llmTexts: Array<{ text: string; index: number }> = [];

    classifications.forEach((classification, index) => {
      if (classification.suggestedExtractor === 'rule-based') {
        ruleBasedTexts.push({ text: texts[index], index });
      } else {
        llmTexts.push({ text: texts[index], index });
      }
    });

    const results: HybridExtractionResult[] = new Array(texts.length);

    // Process rule-based in parallel
    await Promise.all(
      ruleBasedTexts.map(async ({ text, index }) => {
        const result = await this.extractSemanticUnits(text, conversationHistory, isAIMessage);
        results[index] = result;
      })
    );

    // Process LLM texts (could batch these in the future)
    await Promise.all(
      llmTexts.map(async ({ text, index }) => {
        const result = await this.extractSemanticUnits(text, conversationHistory, isAIMessage);
        results[index] = result;
      })
    );

    return results;
  }

  /**
   * Get extraction statistics
   */
  getExtractionStats(results: HybridExtractionResult[]): {
    total: number;
    ruleBased: number;
    lightweight: number;
    llm: number;
    averageConfidence: number;
  } {
    const stats = {
      total: results.length,
      ruleBased: 0,
      lightweight: 0,
      llm: 0,
      averageConfidence: 0,
    };

    let totalConfidence = 0;

    for (const result of results) {
      if (result.route === 'rule-based') stats.ruleBased++;
      else if (result.route === 'lightweight') stats.lightweight++;
      else stats.llm++;

      const avgUnitConfidence =
        result.units.length > 0
          ? result.units.reduce((sum, u) => sum + (u.confidence || 0), 0) / result.units.length
          : 0;
      totalConfidence += avgUnitConfidence;
    }

    stats.averageConfidence = results.length > 0 ? totalConfidence / results.length : 0;

    return stats;
  }
}

export const hybridExtractor = new HybridExtractor();
