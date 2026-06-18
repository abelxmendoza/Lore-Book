import { describe, it, expect } from 'vitest';
import { detectAIUncertainty } from '../../src/utils/aiUncertainty';

describe('detectAIUncertainty', () => {
  it('returns high quality and no markers for confident text', () => {
    const result = detectAIUncertainty('I went to the store and bought milk.');
    expect(result.uncertainty_markers).toEqual([]);
    expect(result.context_quality).toBe('high');
  });

  it('flags medium quality for a single hedge', () => {
    const result = detectAIUncertainty('She is probably at home.');
    expect(result.uncertainty_markers).toContain('probably');
    expect(result.context_quality).toBe('medium');
  });

  it('flags low quality for three or more hedges', () => {
    const result = detectAIUncertainty(
      'I think she might be home, but it is unclear.',
    );
    expect(result.uncertainty_markers.length).toBeGreaterThanOrEqual(3);
    expect(result.context_quality).toBe('low');
  });

  it('detects multi-word markers', () => {
    const result = detectAIUncertainty('It seems like he left.');
    expect(result.uncertainty_markers).toContain('seems like');
  });

  it('does not match markers embedded in larger words (mayor vs may)', () => {
    const result = detectAIUncertainty('The mayor walked into the room.');
    expect(result.uncertainty_markers).not.toContain('may');
    expect(result.context_quality).toBe('high');
  });

  it('is case-insensitive', () => {
    const result = detectAIUncertainty('PERHAPS this is right.');
    expect(result.uncertainty_markers).toContain('perhaps');
  });

  it('handles empty and nullish input without throwing', () => {
    expect(detectAIUncertainty('').context_quality).toBe('high');
    expect(detectAIUncertainty(undefined as unknown as string).uncertainty_markers).toEqual([]);
    expect(detectAIUncertainty(null as unknown as string).context_quality).toBe('high');
  });
});
