import { describe, expect, it } from 'vitest';
import {
  ROMANTIC_LORE_CHARACTERS,
  ROMANTIC_LORE_CHAPTERS,
  ROMANTIC_LORE_TEST_CASES,
  ROMANTIC_LORE_SYNOPSIS,
  getLoreCharacterByName,
  getLoreTestCasesByCategory,
  getLoreTestCasesByFilterTab,
  getLoreLexicalSnippetMap,
} from '../../src/testFixtures/romanticLoreTestCases';

describe('romanticLoreTestCases fixtures', () => {
  it('has a connected synopsis', () => {
    expect(ROMANTIC_LORE_SYNOPSIS.length).toBeGreaterThan(100);
    expect(ROMANTIC_LORE_SYNOPSIS).toMatch(/Alex/);
    expect(ROMANTIC_LORE_SYNOPSIS).toMatch(/Taylor/);
  });

  it('defines four story chapters', () => {
    expect(ROMANTIC_LORE_CHAPTERS).toHaveLength(4);
    expect(ROMANTIC_LORE_CHAPTERS.map((c) => c.chapter)).toEqual([1, 2, 3, 4]);
  });

  it('links every card character to lore', () => {
    const cardNames = ['Alex', 'Jordan', 'Sam', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Nova', 'Elena'];
    for (const name of cardNames) {
      expect(getLoreCharacterByName(name)).toBeDefined();
    }
  });

  it('covers all major filter tabs', () => {
    const tabs = new Set(ROMANTIC_LORE_TEST_CASES.map((tc) => tc.filterTab));
    for (const required of ['active', 'past', 'crushes', 'situationships', 'no_contact', 'reconnection', 'dating', 'high_risk']) {
      expect(tabs.has(required as typeof tabs extends Set<infer T> ? T : never)).toBe(true);
    }
  });

  it('has unique test case ids', () => {
    const ids = ROMANTIC_LORE_TEST_CASES.map((tc) => tc.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('builds lexical snippet map for tracked partners', () => {
    const map = getLoreLexicalSnippetMap();
    expect(map.Alex?.cue).toBe('my girlfriend');
    expect(map.Jordan?.cue).toBeTruthy();
    expect(map.Priya).toBeUndefined();
  });

  it('groups cases by category', () => {
    expect(getLoreTestCasesByCategory('ghosted')).toHaveLength(1);
    expect(getLoreTestCasesByCategory('crush').length).toBeGreaterThanOrEqual(1);
  });

  it('groups cases by filter tab', () => {
    const active = getLoreTestCasesByFilterTab('active');
    expect(active.some((tc) => tc.expectedPartner === 'Alex')).toBe(true);
  });

  it('connects characters in a web', () => {
    const withConnections = ROMANTIC_LORE_CHARACTERS.filter((c) => c.connection.length > 5);
    expect(withConnections.length).toBe(ROMANTIC_LORE_CHARACTERS.length);
  });
});
