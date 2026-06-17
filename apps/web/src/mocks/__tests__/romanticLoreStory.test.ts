import { describe, expect, it } from 'vitest';
import {
  ROMANTIC_LORE_SYNOPSIS,
  ROMANTIC_LORE_TEST_CASES,
  getLoreLexicalSnippetMap,
} from '../romanticLoreStory';
import { getMockRomanticLexicalInsights, getMockRomanticGlossaryCues } from '../romanticLexicalInsights';
import { getMockRomanticRelationships } from '../romanticRelationships';

describe('romanticLoreStory (web)', () => {
  it('re-exports lore synopsis', () => {
    expect(ROMANTIC_LORE_SYNOPSIS).toContain('Alex');
  });

  it('lexical insights align with lore fixtures', () => {
    const insights = getMockRomanticLexicalInsights();
    const cardCases = ROMANTIC_LORE_TEST_CASES.filter((tc) => !tc.isSuggestion);
    expect(insights.length).toBe(cardCases.length);
    expect(insights.every((i) => i.storyBeat && i.chapter)).toBe(true);
  });

  it('glossary cues are unique', () => {
    const cues = getMockRomanticGlossaryCues();
    const labels = cues.map((c) => c.cue);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('mock relationships carry lexical lore metadata', () => {
    const rels = getMockRomanticRelationships();
    const alex = rels.find((r) => r.person_name === 'Alex');
    expect(alex?.metadata?.lexical_evidence).toBeTruthy();
    expect(alex?.metadata?.glossary_cues).toBeTruthy();
    expect(alex?.metadata?.lore_chapter).toBe(3);
  });

  it('snippet map matches relationship names', () => {
    const map = getLoreLexicalSnippetMap();
    const names = getMockRomanticRelationships().map((r) => r.person_name);
    for (const name of names) {
      expect(map[name]).toBeDefined();
    }
  });
});
