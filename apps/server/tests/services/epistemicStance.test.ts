/**
 * UNIT — epistemic (belief/doubt/question/realization) stance detector + merge bridge.
 */
import { describe, expect, it } from 'vitest';

import {
  detectEpistemicStances,
  epistemicCognitionDrafts,
  hasEpistemicCue,
  mergeEpistemicCognitions,
} from '../../src/services/ontology/epistemicStance';

const one = (text: string) => detectEpistemicStances(text)[0];

describe('epistemicStance — belief detection', () => {
  const beliefs = [
    { text: 'I believe that hard work pays off', prop: 'hard work pays off' },
    { text: "I'm convinced that remote work makes me more productive", prop: 'remote work makes me more productive' },
    { text: 'I think that consistency beats talent', prop: 'consistency beats talent' },
  ];
  it.each(beliefs)('BELIEVE: "$text"', ({ text, prop }) => {
    const s = one(text);
    expect(s?.kind).toBe('BELIEVE');
    expect(s?.proposition).toBe(prop);
    expect(s?.attributedToSelf).toBe(true);
  });
});

describe('epistemicStance — doubt detection', () => {
  it('detects explicit doubt', () => {
    const s = one("I don't believe that he has my best interests at heart");
    expect(s?.kind).toBe('DISBELIEVE');
    expect(s?.proposition).toContain('best interests');
  });

  it('detects "don\'t buy that"', () => {
    const s = one("I don't buy that the promotion was fair");
    expect(s?.kind).toBe('DISBELIEVE');
    expect(s?.proposition).toContain('promotion was fair');
  });

  it('negated belief flips to DISBELIEVE', () => {
    const s = one('I do not believe that luck determines everything');
    expect(s?.kind).toBe('DISBELIEVE');
  });
});

describe('epistemicStance — question + realization', () => {
  it('maps wonder-if to QUESTION', () => {
    const s = one('I wonder if I should change careers');
    expect(s?.kind).toBe('QUESTION');
    expect(s?.proposition).toContain('change careers');
  });

  it('maps realized-that to REALIZE', () => {
    const s = one('I realized that I was avoiding the hard conversation');
    expect(s?.kind).toBe('REALIZE');
    expect(s?.proposition).toContain('avoiding the hard conversation');
  });

  it('maps "it hit me that" to REALIZE', () => {
    const s = one('It hit me that the job was draining me');
    expect(s?.kind).toBe('REALIZE');
  });
});

describe('epistemicStance — pollution guards', () => {
  it.each([
    "I'd believe that if I saw proof",
    'I used to believe that success meant money',
    'I believe that',
    'I think so',
    'The weather was nice today.',
  ])('drops: "%s"', (text) => {
    expect(detectEpistemicStances(text)).toEqual([]);
  });

  it('third-party belief is detected but excluded from cognition drafts', () => {
    const stances = detectEpistemicStances('She believes the project will succeed');
    expect(stances[0]?.attributedToSelf).toBe(false);
    expect(epistemicCognitionDrafts('She believes the project will succeed')).toEqual([]);
  });
});

describe('epistemicStance — cognition drafts + cue gate', () => {
  it('maps self beliefs to cognition drafts', () => {
    const drafts = epistemicCognitionDrafts('I believe that family comes first');
    expect(drafts).toContainEqual(
      expect.objectContaining({ cognition_type: 'belief', content: 'family comes first', source: 'lexical' })
    );
  });

  it('hasEpistemicCue is true for journal beliefs', () => {
    expect(hasEpistemicCue('I doubt that things will get easier')).toBe(true);
    expect(hasEpistemicCue('Had coffee and wrote in my journal.')).toBe(false);
  });
});

describe('mergeEpistemicCognitions', () => {
  it('keeps lexical-only cognitions when LLM returns nothing (fallback path)', () => {
    const lexical = epistemicCognitionDrafts('I believe that showing up matters');
    const merged = mergeEpistemicCognitions(lexical, []);
    expect(merged).toHaveLength(1);
    expect(merged[0].cognition_type).toBe('belief');
    expect(merged[0].metadata.source).toBe('lexical');
    expect(merged[0].confidence).toBeGreaterThan(0.5);
  });

  it('boosts confidence when lexical and LLM agree', () => {
    const lexical = epistemicCognitionDrafts('I believe that hard work pays off');
    const merged = mergeEpistemicCognitions(lexical, [
      { cognition_type: 'belief', content: 'Hard work really pays off in the long run' },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].metadata.lexicalConfirmed).toBe(true);
    expect(merged[0].metadata.source).toBe('lexical+llm');
    expect(merged[0].confidence).toBeGreaterThan(lexical[0].confidence);
  });

  it('passes through unmatched LLM cognitions', () => {
    const merged = mergeEpistemicCognitions([], [
      { cognition_type: 'insecurity_triggered', content: 'Maybe I am not good enough' },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].metadata.source).toBe('llm');
  });
});
