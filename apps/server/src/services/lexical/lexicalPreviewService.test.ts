import { describe, expect, it } from 'vitest';

import {
  classifyComposerIntent,
  isLexicalNoiseToken,
  upgradeProperNounSpans,
  type LexicalPreviewSpan,
} from './lexicalPreviewService';

describe('isLexicalNoiseToken', () => {
  it('rejects pronouns, interrogatives, and command verbs', () => {
    for (const t of ['my', 'you', 'What', 'Tell', 'who', 'me', 'About']) {
      expect(isLexicalNoiseToken(t), t).toBe(true);
    }
  });

  it('rejects truncated fragments', () => {
    expect(isLexicalNoiseToken('Up My Degr...')).toBe(true);
  });

  it('keeps real entity surfaces', () => {
    for (const t of ['Northwind', 'NWU', 'Marcus']) {
      expect(isLexicalNoiseToken(t), t).toBe(false);
    }
  });
});

describe('classifyComposerIntent', () => {
  it('detects identity and life-story queries', () => {
    expect(classifyComposerIntent('Who am I?')).toBe('identity_query');
    expect(classifyComposerIntent('What do you know about me?')).toBe('longitudinal_profile_query');
    expect(classifyComposerIntent('Tell me my life story.')).toBe('life_story_query');
    expect(classifyComposerIntent('What kind of person do you think I am?')).toBe(
      'personality_synthesis_query',
    );
  });
});

function span(text: string, partial: Partial<LexicalPreviewSpan> = {}): LexicalPreviewSpan {
  return {
    text,
    start: 0,
    end: text.length,
    type: 'OBJECT',
    subtype: 'PROPER_NOUN',
    colorKey: 'uncertain',
    confidence: 0.5,
    temporary: true,
    ...partial,
  };
}

describe('upgradeProperNounSpans', () => {
  const text = 'I flew to Tokyo with Maria from Google and met the team at Stanford.';

  it('types a place proper noun left as OBJECT/uncertain', () => {
    const [s] = upgradeProperNounSpans(text, [span('Tokyo')]);
    expect(s.type).toBe('PLACE');
    expect(s.colorKey).toBe('place');
  });

  it('types an organization proper noun', () => {
    const [s] = upgradeProperNounSpans(text, [span('Google')]);
    expect(s.type).toBe('ORGANIZATION');
    expect(s.colorKey).toBe('organization');
  });

  it('leaves a genuinely ambiguous bare name uncertain (keeps person default)', () => {
    const [s] = upgradeProperNounSpans(text, [span('Maria')]);
    expect(s.colorKey).toBe('uncertain');
  });

  it('never overrides a span the analyzer already typed', () => {
    const typed = span('Stanford', { type: 'PERSON', colorKey: 'person', subtype: undefined });
    const [s] = upgradeProperNounSpans(text, [typed]);
    expect(s.type).toBe('PERSON');
  });
});
