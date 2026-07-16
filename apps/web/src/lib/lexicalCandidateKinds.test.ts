import { describe, expect, it } from 'vitest';
import {
  classifyComposerIntent,
  classifyLexicalCandidate,
  isIncompleteFragment,
  isVisibleEntityCandidate,
} from './lexicalCandidateKinds';
import { filterPreviewSpansForStrip } from './composerEntityStrip';
import type { LexicalPreviewSpan } from '../api/lexicalPreview';

function span(text: string, start = 0): LexicalPreviewSpan {
  return {
    text,
    start,
    end: start + text.length,
    type: 'OBJECT',
    colorKey: 'uncertain',
    confidence: 0.4,
    temporary: true,
  };
}

describe('lexical candidate kinds — screenshot regressions', () => {
  it('classifies identity and life-story intents without entity chips', () => {
    expect(classifyComposerIntent('Who am I?')).toBe('identity_query');
    expect(classifyComposerIntent('What do you know about me?')).toBe('longitudinal_profile_query');
    expect(classifyComposerIntent('What kind of person do you think I am?')).toBe(
      'personality_synthesis_query',
    );
    expect(classifyComposerIntent('Tell me my life story.')).toBe('life_story_query');
  });

  it('rejects pronouns, interrogatives, and commands as visible entities', () => {
    for (const t of ['my', 'you', 'What', 'Tell', 'Who', 'me', 'I']) {
      expect(isVisibleEntityCandidate(t), t).toBe(false);
      expect(['self_reference', 'intent', 'rejected']).toContain(classifyLexicalCandidate(t));
    }
  });

  it('rejects incomplete fragments like Up My Degr...', () => {
    expect(isIncompleteFragment('Up My Degr...')).toBe(true);
    expect(isVisibleEntityCandidate('Up My Degr...')).toBe(false);
  });

  it('keeps Northwind and NWU as visible entity candidates', () => {
    expect(isVisibleEntityCandidate('Northwind')).toBe(true);
    expect(isVisibleEntityCandidate('NWU')).toBe(true);
  });

  it('strips junk preview spans while retaining workplace/school entities', () => {
    const text = 'I used to work at Northwind while finishing my degree at NWU.';
    const spans = [
      span('my', text.indexOf('my')),
      span('Northwind', text.indexOf('Northwind')),
      span('What', 0),
      span('Tell', 0),
      span('NWU', text.indexOf('NWU')),
      span('Up My Degr...', 0),
    ];
    const filtered = filterPreviewSpansForStrip(text, [], spans);
    const labels = filtered.map((s) => s.text);
    expect(labels).toEqual(expect.arrayContaining(['Northwind', 'NWU']));
    expect(labels).not.toEqual(expect.arrayContaining(['my', 'What', 'Tell', 'Up My Degr...']));
  });

  it('identity prompts produce no visible junk chips from preview spans', () => {
    const prompts = [
      'Who am I?',
      'What do you know about me?',
      'Tell me my life story.',
      'What kind of person do you think I am?',
    ];
    for (const prompt of prompts) {
      const junk = ['Who', 'What', 'Tell', 'my', 'you', 'me', 'I']
        .filter((t) => prompt.toLowerCase().includes(t.toLowerCase()))
        .map((t) => span(t));
      const filtered = filterPreviewSpansForStrip(prompt, [], junk);
      expect(filtered, prompt).toEqual([]);
      expect(classifyComposerIntent(prompt)).not.toBeNull();
    }
  });
});
