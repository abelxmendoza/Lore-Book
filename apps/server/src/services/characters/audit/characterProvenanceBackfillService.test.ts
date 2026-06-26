import { describe, it, expect } from 'vitest';
import {
  boundaryRegex,
  extractSnippet,
  hasProvenance,
  recentlyAttemptedEmpty,
} from './characterProvenanceBackfillService';

describe('boundaryRegex', () => {
  it('matches a short name as a whole word but not inside other words', () => {
    const re = () => boundaryRegex('Sol');
    expect(re().test('I was seeing Sol for a while')).toBe(true);
    expect(re().test('the solution was on the console')).toBe(false);
    expect(re().test('absolutely solid')).toBe(false);
  });

  it('matches multi-word and punctuated names', () => {
    expect(boundaryRegex('Baby Bats').test('we went as Baby Bats to the show')).toBe(true);
    expect(boundaryRegex('Mr. Chino').test('then Mr. Chino showed up')).toBe(true);
    expect(boundaryRegex('Mr. Chino').test('a chino fabric')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(boundaryRegex('Abuela').test('my abuela cooked')).toBe(true);
  });
});

describe('extractSnippet', () => {
  it('windows around the first mention and adds ellipses', () => {
    const content =
      'A'.repeat(300) + ' I was seeing this girl Sol a couple times and then she left me on read ' + 'B'.repeat(300);
    const snippet = extractSnippet(content, ['Sol']);
    expect(snippet).toContain('Sol');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet.length).toBeLessThan(content.length);
  });

  it('returns the full short message when it fits', () => {
    const snippet = extractSnippet('Sol left me on read', ['Sol']);
    expect(snippet).toBe('Sol left me on read');
  });

  it('falls back to a leading slice when no term matches', () => {
    const snippet = extractSnippet('no mention here at all', ['Sol']);
    expect(snippet).toBe('no mention here at all');
  });
});

describe('hasProvenance', () => {
  const base = { id: 'c1', name: 'Sol', alias: [], metadata: {}, context_of_mention: null };

  it('is false for a bare card', () => {
    expect(hasProvenance(base)).toBe(false);
  });

  it('is true when context_of_mention is set', () => {
    expect(hasProvenance({ ...base, context_of_mention: 'we talked' })).toBe(true);
  });

  it('is true when metadata carries a summary or source ids', () => {
    expect(hasProvenance({ ...base, metadata: { provenanceSummary: 'x' } })).toBe(true);
    expect(hasProvenance({ ...base, metadata: { sourceMessageIds: ['m1'] } })).toBe(true);
  });
});

describe('recentlyAttemptedEmpty', () => {
  const base = { id: 'c1', name: 'Sol', alias: [], metadata: {}, context_of_mention: null };

  it('is false with no attempt marker', () => {
    expect(recentlyAttemptedEmpty(base)).toBe(false);
  });

  it('is true for a recent empty attempt (within cooldown)', () => {
    const at = new Date(Date.now() - 60_000).toISOString();
    expect(recentlyAttemptedEmpty({ ...base, metadata: { provenanceBackfillAttemptedAt: at } })).toBe(true);
  });

  it('is false once the cooldown has elapsed', () => {
    const at = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    expect(recentlyAttemptedEmpty({ ...base, metadata: { provenanceBackfillAttemptedAt: at } })).toBe(false);
  });
});
