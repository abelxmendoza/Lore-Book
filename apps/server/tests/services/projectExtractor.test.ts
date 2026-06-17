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

  it('classifies a creative project from context', () => {
    const hits = extractProjectsLexical('I am recording Midnight Static, my new album, in the studio this month.');
    const album = hits.find((h) => /midnight static/i.test(h.name));
    expect(album?.type).toBe('creative');
  });

  it('classifies a fitness project from context', () => {
    const hits = extractProjectsLexical('Building my Marathon Prep, a training plan with daily runs at the gym.');
    const prep = hits.find((h) => /marathon prep/i.test(h.name));
    expect(prep?.type).toBe('fitness');
  });

  it('infers completed status from shipping language', () => {
    const hits = extractProjectsLexical('We finally shipped LoreBook and released the first version.');
    const lb = hits.find((h) => /lorebook/i.test(h.name));
    expect(lb?.status).toBe('completed');
  });

  it('infers paused status from on-hold language', () => {
    const hits = extractProjectsLexical('I put my side project called Atlas Notes on hold for now.');
    const atlas = hits.find((h) => /atlas notes/i.test(h.name));
    expect(atlas?.status).toBe('paused');
  });

  it('defaults to active status when no lifecycle cue is present', () => {
    const hits = extractProjectsLexical('I am working on Atlas Notes this week.');
    const atlas = hits.find((h) => /atlas notes/i.test(h.name));
    expect(atlas?.status).toBe('active');
  });
});
