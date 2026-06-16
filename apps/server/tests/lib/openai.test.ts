import { describe, expect, it } from 'vitest';

import { modelSupportsCustomTemperature, normalizeOpenAIChatParams } from '../../src/lib/openai';

describe('normalizeOpenAIChatParams', () => {
  it('strips temperature for gpt-5.x models', () => {
    expect(normalizeOpenAIChatParams({ model: 'gpt-5.5', temperature: 0.7 })).toEqual({
      model: 'gpt-5.5',
    });
  });

  it('strips temperature for o-series models', () => {
    expect(normalizeOpenAIChatParams({ model: 'o3-mini', temperature: 0.7 })).toEqual({
      model: 'o3-mini',
    });
  });

  it('keeps temperature for gpt-4o models', () => {
    expect(normalizeOpenAIChatParams({ model: 'gpt-4o', temperature: 0.7 })).toEqual({
      model: 'gpt-4o',
      temperature: 0.7,
    });
  });

  it('maps max_tokens to max_completion_tokens for gpt-5.x', () => {
    expect(normalizeOpenAIChatParams({ model: 'gpt-5.5', max_tokens: 500, temperature: 0.7 })).toEqual({
      model: 'gpt-5.5',
      max_completion_tokens: 500,
    });
  });
});

describe('modelSupportsCustomTemperature', () => {
  it('returns false for gpt-5 and o-series', () => {
    expect(modelSupportsCustomTemperature('gpt-5.5')).toBe(false);
    expect(modelSupportsCustomTemperature('o1-preview')).toBe(false);
  });

  it('returns true for gpt-4 family', () => {
    expect(modelSupportsCustomTemperature('gpt-4o-mini')).toBe(true);
  });
});
