import { describe, expect, it } from 'vitest';

import { consolidateSemanticUnits } from '../../src/services/conversationCentered/semanticExtractionService';
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
});
