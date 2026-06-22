import { describe, it, expect } from 'vitest';
import {
  collectNameKeys,
  flagMergedTextSnippets,
  textMentionsOnlySource,
} from '../../src/utils/mergeReview';

describe('mergeReview', () => {
  it('flags text that mentions only the absorbed name', () => {
    const sourceKeys = collectNameKeys('Side Project', 'side project', []);
    const survivorKeys = collectNameKeys('Main Venture', 'main venture', []);
    expect(textMentionsOnlySource('Side Project launched last week.', sourceKeys, survivorKeys)).toBe(true);
    expect(textMentionsOnlySource('Main Venture and Side Project merged.', sourceKeys, survivorKeys)).toBe(false);
  });

  it('collects snippets from merged descriptions', () => {
    const sourceKeys = collectNameKeys('Beta App', 'beta app', []);
    const survivorKeys = collectNameKeys('Alpha App', 'alpha app', []);
    const flags = flagMergedTextSnippets(
      ['Beta App is still in testing.', 'Alpha App ships monthly.'],
      sourceKeys,
      survivorKeys
    );
    expect(flags).toEqual(['Beta App is still in testing.']);
  });
});
