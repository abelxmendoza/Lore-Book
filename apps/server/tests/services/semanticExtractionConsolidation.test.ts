import { describe, expect, it } from 'vitest';

import {
  consolidateSemanticUnits,
  semanticExtractionService,
} from '../../src/services/conversationCentered/semanticExtractionService';
import type { ExtractionResult } from '../../src/types/conversationCentered';

function noisyResult(): ExtractionResult {
  return {
    units: [
      { type: 'CLAIM', content: 'same', confidence: 0.7 },
      { type: 'DECISION', content: 'same', confidence: 0.9 },
      { type: 'EXPERIENCE', content: 'same', confidence: 0.95 },
      { type: 'FEELING', content: 'same', confidence: 0.8 },
      { type: 'THOUGHT', content: 'same', confidence: 0.8 },
      { type: 'PERCEPTION', content: 'same', confidence: 0.7 },
      { type: 'DECISION', content: 'duplicate', confidence: 0.6 },
    ],
    extraction_metadata: { method: 'RULE_BASED', processing_time_ms: 1, confidence_threshold: 0.5 },
  };
}

describe('semantic extraction consolidation', () => {
  it('keeps a small set of independently useful meanings', () => {
    const result = consolidateSemanticUnits(
      noisyResult(),
      'I was detained. Right now I am mainly focused on MemoVault.',
    );

    expect(result.units.map((unit) => unit.type)).toEqual(['EXPERIENCE', 'DECISION']);
    expect(result.units).toHaveLength(2);
  });

  it('keeps an explicitly stated feeling but not generic thought or perception noise', () => {
    const result = consolidateSemanticUnits(noisyResult(), 'I feel worried about this.');
    expect(result.units.map((unit) => unit.type)).toEqual(['EXPERIENCE', 'FEELING']);
  });

  it('does not turn recall questions into claims', async () => {
    const result = await semanticExtractionService.extractSemanticUnits(
      'What were the biggest things that happened this month',
    );
    expect(result.units).toEqual([]);
  });

  it('treats agreement as confirmation rather than correction', async () => {
    const result = await semanticExtractionService.extractSemanticUnits("No, that's spot on.");
    expect(result.units).toEqual([]);
    const punctuationFree = await semanticExtractionService.extractSemanticUnits('no thats spot on');
    expect(punctuationFree.units).toEqual([]);
  });
});
