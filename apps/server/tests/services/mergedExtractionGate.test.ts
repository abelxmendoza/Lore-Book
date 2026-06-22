import { describe, it, expect } from 'vitest';
import { shouldRunMergedExtraction } from '../../src/services/ingestion/mergedExtractionGate';

describe('shouldRunMergedExtraction', () => {
  it('skips very short messages', () => {
    expect(shouldRunMergedExtraction('ok')).toBe(false);
  });

  it('runs when quest/skill/interest signals are present', () => {
    expect(shouldRunMergedExtraction('I want to learn guitar')).toBe(true);
  });

  it('runs for longer substantive messages', () => {
    const text =
      'Had a long conversation with my sister about how things have been at work lately.';
    expect(shouldRunMergedExtraction(text)).toBe(true);
  });

  it('skips neutral short lines without signals', () => {
    expect(shouldRunMergedExtraction('sounds good')).toBe(false);
  });
});
