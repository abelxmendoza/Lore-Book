import { describe, it, expect } from 'vitest';

import {
  canonicalProjectKey,
  dedupeProjectSuggestions,
} from '../../src/services/lexical/projects/projectDeduplicationService';
import {
  processProjectSuggestionsForOutput,
  weakProjectCandidate,
} from '../../src/services/lexical/projects/projectSuggestionService';
import type { ProjectSuggestion } from '../../src/services/lexical/projects/projectSuggestionTypes';

describe('projectDeduplication', () => {
  it('canonicalizes LoreBook variants to lorebook', () => {
    expect(canonicalProjectKey('LoreBook')).toBe('lorebook');
    expect(canonicalProjectKey('LoreBook project')).toBe('lorebook');
    expect(canonicalProjectKey('the LoreBook app')).toBe('lorebook');
    expect(canonicalProjectKey('my LoreBook system')).toBe('lorebook');
  });

  it('collapses exact duplicate suggestions into one', () => {
    const items: ProjectSuggestion[] = [
      baseSuggestion('LoreBook', 'new', 0.9),
      baseSuggestion('LoreBook project', 'new', 0.85),
    ];
    const out = dedupeProjectSuggestions(items);
    const lorebook = out.filter(s => s.canonicalKey === 'lorebook' && s.status !== 'rejected');
    expect(lorebook).toHaveLength(1);
    expect(lorebook[0].evidencePhrases.length).toBeGreaterThanOrEqual(1);
  });

  it('LoreBook app dedupes against LoreBook in pipeline output', () => {
    const text = 'the LoreBook project and the LoreBook app';
    const names = processProjectSuggestionsForOutput(text).map(s => s.canonicalKey);
    const lorebookCount = names.filter(k => k === 'lorebook').length;
    expect(lorebookCount).toBe(1);
  });

  it('merges AI memory app descriptor evidence into LoreBook parent', () => {
    const text = 'I started building my AI memory app called LoreBook.';
    const accepted = processProjectSuggestionsForOutput(text);
    const lorebook = accepted.find(s => s.canonicalKey === 'lorebook');
    expect(lorebook).toBeDefined();
    expect(
      lorebook!.evidencePhrases.some(p => /ai memory app|called lorebook|building/i.test(p))
    ).toBe(true);
    expect(accepted.filter(s => s.canonicalKey === 'lorebook')).toHaveLength(1);
  });

  it('marks similar duplicate suggestions as possible_duplicate', () => {
    const items: ProjectSuggestion[] = [
      baseSuggestion('LoreBook', 'new', 0.9),
      baseSuggestion('LoreBok', 'new', 0.82),
    ];
    const out = dedupeProjectSuggestions(items);
    expect(out.some(s => s.status === 'possible_duplicate')).toBe(true);
  });

  it('known project history rescue still works after dedupe', () => {
    const text = 'I stayed home and made LoreBook instead.';
    const accepted = processProjectSuggestionsForOutput(text, {
      knownProjects: new Set(['LoreBook']),
      knownProjectIds: new Map([['lorebook', 'proj-1']]),
    });
    expect(accepted.some(s => s.status === 'known' && s.matchedProjectId === 'proj-1')).toBe(true);
  });
});

function baseSuggestion(text: string, status: ProjectSuggestion['status'], confidence: number): ProjectSuggestion {
  return {
    text,
    normalizedText: text.toLowerCase(),
    canonicalKey: canonicalProjectKey(text),
    start: 0,
    end: text.length,
    projectType: 'software_app',
    confidence,
    status,
    boundaryFixes: [],
    evidencePhrases: [text],
    rulesFired: [],
  };
}
