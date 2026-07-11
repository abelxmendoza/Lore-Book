import { describe, it, expect } from 'vitest';

import {
  createCrossBookIndex,
  guardCrossBookEntity,
} from '../../src/services/lexical/projects/projectCrossBookGuard';
import {
  processProjectSuggestions,
  processProjectSuggestionsForOutput,
  weakProjectCandidate,
} from '../../src/services/lexical/projects/projectSuggestionService';

describe('projectCrossBookGuard', () => {
  const hellFairyIndex = createCrossBookIndex({
    characters: ['Moth Queen', 'Goth Tio', 'Neon Newts'],
  });

  it('rejects Moth Queen when known as character', () => {
    const result = guardCrossBookEntity('Moth Queen', 'I could have seen Moth Queen', hellFairyIndex);
    expect(result.allowed).toBe(false);
    expect(result.rejectionReason).toBe('known_as_person');
    expect(result.rejectedAs).toBe('PERSON');
  });

  it('rejects known stage names from project suggestions in full pipeline', () => {
    const text = "I could've seen Goth Tio, Moth Queen, Neon Newts, Obscurio.";
    const weak = [
      weakProjectCandidate('Moth Queen', text, 0.8),
      weakProjectCandidate('Goth Tio', text, 0.75),
      weakProjectCandidate('Neon Newts', text, 0.75),
    ];
    const rejected = processProjectSuggestions(text, { crossBook: hellFairyIndex }, weak).filter(
      s => s.text === 'Moth Queen' || s.text === 'Goth Tio' || s.text === 'Neon Newts'
    );
    expect(rejected.every(s => s.status === 'rejected')).toBe(true);
    expect(rejected.some(s => s.rejectionReason === 'known_as_person')).toBe(true);
    expect(acceptedNames(text, { crossBook: hellFairyIndex }, weak)).toEqual([]);
  });

  it('known project history rescue beats cross-book person guess for LoreBook', () => {
    const index = createCrossBookIndex({ characters: ['LoreBook'] });
    const result = guardCrossBookEntity('LoreBook', 'made LoreBook instead', index, {
      knownProjects: new Set(['LoreBook']),
    });
    expect(result.allowed).toBe(true);
    expect(result.rulesFired).toContain('known_project_rescue');
  });

  it('cross-book known non-project beats lexical project guess', () => {
    const text = 'working on Moth Queen';
    const weak = [weakProjectCandidate('Moth Queen', text, 0.9)];
    const out = processProjectSuggestionsForOutput(text, { crossBook: hellFairyIndex }, weak);
    expect(out.some(s => /moth queen/i.test(s.text))).toBe(false);
  });

  it('still accepts LoreBook as valid project', () => {
    const text = 'I stayed home and made LoreBook instead.';
    const names = acceptedNames(text);
    expect(names.some(n => /lorebook/i.test(n))).toBe(true);
  });
});

function acceptedNames(
  text: string,
  options?: { crossBook?: ReturnType<typeof createCrossBookIndex>; knownProjects?: Set<string> },
  weak: ReturnType<typeof weakProjectCandidate>[] = []
): string[] {
  return processProjectSuggestionsForOutput(text, options, weak).map(s => s.text);
}
