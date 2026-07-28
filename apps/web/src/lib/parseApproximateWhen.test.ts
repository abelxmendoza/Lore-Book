import { describe, expect, it } from 'vitest';

import { parseApproximateWhen, titleFromStory } from './parseApproximateWhen';

describe('parseApproximateWhen', () => {
  it('accepts blank as unanchored', () => {
    expect(parseApproximateWhen('')).toEqual({
      whenText: null,
      startTime: null,
      temporalPrecision: 'unknown',
      temporalStatus: 'unanchored',
    });
  });

  it('parses season + year', () => {
    const result = parseApproximateWhen('summer 2019');
    expect(result.whenText).toBe('summer 2019');
    expect(result.temporalPrecision).toBe('season');
    expect(result.temporalStatus).toBe('approximate');
    expect(result.startTime).toContain('2019');
  });

  it('parses month + year', () => {
    const result = parseApproximateWhen('around June 2019');
    expect(result.temporalPrecision).toBe('month');
    expect(result.temporalStatus).toBe('approximate');
  });

  it('parses year only', () => {
    const result = parseApproximateWhen('2018');
    expect(result.temporalPrecision).toBe('year');
    expect(result.startTime?.startsWith('2018')).toBe(true);
  });

  it('keeps unknown phrases without inventing a date', () => {
    const result = parseApproximateWhen('during that weird era after college');
    expect(result.startTime).toBeNull();
    expect(result.temporalStatus).toBe('unanchored');
    expect(result.whenText).toMatch(/weird era/i);
  });
});

describe('titleFromStory', () => {
  it('uses the first sentence', () => {
    expect(titleFromStory('We went to a backyard show. Then the afterparty.')).toBe(
      'We went to a backyard show.',
    );
  });
});
