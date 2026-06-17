import { describe, expect, it } from 'vitest';

import { extractProjectsLexical } from '../../src/services/projects/projectExtractor';

describe('projectExtractor lexical', () => {
  it('detects building a named app from chat', () => {
    const hits = extractProjectsLexical('I am working on Atlas Notes and shipping the projects dashboard this week.');
    expect(hits.some((h) => /atlas notes/i.test(h.name))).toBe(true);
    expect(hits[0]?.confidence).toBeGreaterThan(0.7);
  });

  it('detects project milestone language', () => {
    const hits = extractProjectsLexical('We finally shipped LoreBook and deployed the milestone.');
    expect(hits.some((h) => /lorebook/i.test(h.name))).toBe(true);
  });

  it('detects my project called X', () => {
    const hits = extractProjectsLexical('My side project called Atlas Notes is almost ready.');
    expect(hits.some((h) => /atlas notes/i.test(h.name))).toBe(true);
  });

  it('ignores very short noise', () => {
    expect(extractProjectsLexical('hi')).toEqual([]);
  });
});
