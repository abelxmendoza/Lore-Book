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
    characters: ['Hell Fairy', 'Goth Tio', 'Baby Bats'],
  });

  it('rejects Hell Fairy when known as character', () => {
    const result = guardCrossBookEntity('Hell Fairy', 'I could have seen Hell Fairy', hellFairyIndex);
    expect(result.allowed).toBe(false);
    expect(result.rejectionReason).toBe('known_as_person');
    expect(result.rejectedAs).toBe('PERSON');
  });

  it('rejects known stage names from project suggestions in full pipeline', () => {
    const text = "I could've seen Goth Tio, Hell Fairy, Baby Bats, Oscuridad.";
    const weak = [
      weakProjectCandidate('Hell Fairy', text, 0.8),
      weakProjectCandidate('Goth Tio', text, 0.75),
      weakProjectCandidate('Baby Bats', text, 0.75),
    ];
    const rejected = processProjectSuggestions(text, { crossBook: hellFairyIndex }, weak).filter(
      s => s.text === 'Hell Fairy' || s.text === 'Goth Tio' || s.text === 'Baby Bats'
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
    const text = 'working on Hell Fairy';
    const weak = [weakProjectCandidate('Hell Fairy', text, 0.9)];
    const out = processProjectSuggestionsForOutput(text, { crossBook: hellFairyIndex }, weak);
    expect(out.some(s => /hell fairy/i.test(s.text))).toBe(false);
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
