import { describe, expect, it } from 'vitest';
import { classifyFactStability } from './opinionVsFactClassifier';

describe('classifyFactStability', () => {
  it('routes a one-off attraction reaction to opinion_or_reaction', () => {
    const fact = { fact: 'Wrenlow was attractive', category: 'general', confidence: 0.7 };
    const sentence = 'I thought Wrenlow was attractive when we met at the show.';
    expect(classifyFactStability(fact, sentence)).toBe('opinion_or_reaction');
  });

  it('keeps a stable trait statement as stable_trait', () => {
    const fact = { fact: 'Wrenlow is very organized at work', category: 'personality', confidence: 0.8 };
    const sentence = 'Wrenlow is very organized at work and always plans ahead.';
    expect(classifyFactStability(fact, sentence)).toBe('stable_trait');
  });

  it('routes a momentary emotion reaction to opinion_or_reaction', () => {
    const fact = { fact: 'annoyed at Tobias', category: 'general', confidence: 0.6 };
    const sentence = 'I was annoyed at Tobias for showing up late that one time.';
    expect(classifyFactStability(fact, sentence)).toBe('opinion_or_reaction');
  });

  it('does not flag a durable trait phrased in a personality category without an opinion marker', () => {
    const fact = { fact: 'Ravi is generous with his time', category: 'personality', confidence: 0.75 };
    const sentence = 'Ravi is generous with his time and always helps out.';
    expect(classifyFactStability(fact, sentence)).toBe('stable_trait');
  });
});
