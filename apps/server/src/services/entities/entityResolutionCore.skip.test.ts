import { describe, it, expect } from 'vitest';
import { resolveMention } from './entityResolutionCore';

// "Ink" / "Sol" / "Genni" are real personal names that classifyEntity cannot
// type without context — they classify UNKNOWN in isolation. Before the fix,
// resolveMention skipped (and ingestion dropped) such a mention even when the
// extractor had already typed it PERSON.
describe('resolveMention — honor extractor-provided type (no-match branch)', () => {
  it('skips an unclassifiable bare name when no type is provided', () => {
    const r = resolveMention('Ink', []);
    expect(r.action).toBe('skip');
    expect(r.recommendation).toBe('skip');
  });

  it('creates instead of skipping when the extractor typed it PERSON', () => {
    const r = resolveMention('Ink', [], {}, 'PERSON');
    expect(r.action).toBe('create');
    expect(r.resolvedId).toBeNull();
  });

  it('still skips when the provided type is itself UNKNOWN', () => {
    const r = resolveMention('Ink', [], {}, 'UNKNOWN');
    expect(r.action).toBe('skip');
  });

  it('creates a self-classifiable mention regardless of provided type', () => {
    // A glossary/honorific-typable mention creates on its own merits.
    const r = resolveMention('Tío Juan', []);
    expect(r.action).toBe('create');
  });
});
