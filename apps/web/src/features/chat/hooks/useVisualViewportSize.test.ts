import { describe, it, expect } from 'vitest';
import { getComposerStats } from './useVisualViewportSize';

describe('getComposerStats', () => {
  it('counts words and paragraphs in journal text', () => {
    const text = 'First paragraph here.\n\nSecond paragraph with more words.';
    expect(getComposerStats(text)).toEqual({
      chars: text.length,
      words: 8,
      paragraphs: 2,
    });
  });

  it('returns zeros for empty input', () => {
    expect(getComposerStats('')).toEqual({ chars: 0, words: 0, paragraphs: 0 });
  });
});
