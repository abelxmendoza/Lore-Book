import { describe, expect, it } from 'vitest';
import { parseResumeHeuristics, extractLanguages } from './resumeHeuristicParser';

describe('parseResumeHeuristics — extractLanguages', () => {
  it('parses a normal comma-separated languages line', () => {
    const text = 'Languages: English, Spanish, French';
    expect(parseResumeHeuristics(text).languages).toEqual(['English', 'Spanish', 'French']);
  });

  it('discards a pathologically long single segment without erroring (CodeQL js/loop-bound-injection)', () => {
    const hugeSegment = 'a'.repeat(50_000);
    const text = `Languages: ${hugeSegment}`;
    const result = parseResumeHeuristics(text);
    // Longer than the 40-char filter regardless of the internal cap, so it's dropped.
    expect(result.languages).toEqual([]);
  });

  it('bounds a huge paren-nested segment to a fixed amount of work', () => {
    // Regression for the loop-bound fix itself: without the cap this loop ran
    // once per character of the untrusted segment (unbounded by input size).
    const hugeSegment = '('.repeat(50_000) + 'x';
    const start = Date.now();
    extractLanguages(`Languages: ${hugeSegment}`);
    expect(Date.now() - start).toBeLessThan(50);
  });
});
