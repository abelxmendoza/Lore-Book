import { describe, expect, it } from 'vitest';
import { generateMeaningFromText } from '../../src/services/meaning/eventMeaningService';

describe('eventMeaningService', () => {
  it('generates Costco + Abuela meaning', () => {
    const meaning = generateMeaningFromText(
      'Costco trip',
      'The highlight was that my Abuela is still alive. We spent 2.5 hours shopping.',
      []
    );
    expect(meaning).not.toBeNull();
    expect(meaning!.confidence).toBeGreaterThanOrEqual(0.5);
    expect(meaning!.meaningSummary.toLowerCase()).toMatch(/abuela|still alive|highlight/);
  });

  it('returns null when confidence is too low', () => {
    const meaning = generateMeaningFromText('Errand', 'Went out.', []);
    expect(meaning).toBeNull();
  });

  it('is deterministic', () => {
    const text = 'The highlight was spending time with Tio Juan';
    expect(generateMeaningFromText('Family dinner', text, [])).toEqual(
      generateMeaningFromText('Family dinner', text, [])
    );
  });
});
