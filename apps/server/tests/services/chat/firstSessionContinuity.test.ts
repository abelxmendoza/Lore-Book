import { describe, it, expect } from 'vitest';
import {
  detectFirstSessionCallback,
  extractSalientEntities,
  shouldRunFirstSessionCallback,
} from '../../../src/services/chat/firstSessionContinuity';

describe('extractSalientEntities', () => {
  it('extracts proper nouns and drops sentence-initial stopwords', () => {
    const ents = extractSalientEntities('I think Tony works at SpaceX now.');
    expect(ents).toContain('Tony');
    expect(ents).toContain('SpaceX');
    expect(ents).not.toContain('I');
  });

  it('keeps multi-word entities and prefers them (longest first)', () => {
    const ents = extractSalientEntities('We went to Whittier Christian Middle School.');
    expect(ents[0]).toBe('Whittier Christian Middle School');
  });
});

describe('detectFirstSessionCallback', () => {
  it('recalls an entity the user mentioned in an earlier turn', () => {
    const cb = detectFirstSessionCallback('Did I tell you Tony got promoted?', [
      'My friend Tony works at SpaceX.',
    ]);
    expect(cb).not.toBeNull();
    expect(cb!.entity).toBe('Tony');
    expect(cb!.quote).toContain('Tony works at SpaceX');
    expect(cb!.calloutText).toMatch(/Earlier you mentioned Tony/);
  });

  it('returns null when nothing recurs', () => {
    expect(
      detectFirstSessionCallback('How is the weather?', ['My friend Tony works at SpaceX.']),
    ).toBeNull();
  });

  it('returns null when there is no prior history', () => {
    expect(detectFirstSessionCallback('My friend Tony works at SpaceX.', [])).toBeNull();
  });

  it('prefers the earliest prior mention as provenance', () => {
    const cb = detectFirstSessionCallback('Tony again', [
      'Tony is my oldest friend.',
      'I saw Tony yesterday.',
    ]);
    expect(cb!.priorMessageIndex).toBe(0);
  });
});

describe('shouldRunFirstSessionCallback', () => {
  it('fires only inside the early-session window', () => {
    expect(shouldRunFirstSessionCallback(1)).toBe(true);
    expect(shouldRunFirstSessionCallback(12)).toBe(true);
    expect(shouldRunFirstSessionCallback(13)).toBe(false);
    expect(shouldRunFirstSessionCallback(0)).toBe(false);
  });
});
