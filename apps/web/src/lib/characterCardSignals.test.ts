import { describe, expect, it } from 'vitest';
import { normalizeSignalLabel, getUniqueDisplayTags } from './characterCardSignals';

describe('normalizeSignalLabel', () => {
  it('lowercases and collapses dashes/underscores/whitespace', () => {
    expect(normalizeSignalLabel('Third-Party')).toBe('third party');
    expect(normalizeSignalLabel('mentioned_only')).toBe('mentioned only');
    expect(normalizeSignalLabel('  Family  ')).toBe('family');
    expect(normalizeSignalLabel('GIRLFRIEND')).toBe('girlfriend');
  });
});

describe('getUniqueDisplayTags', () => {
  it('drops tags that exactly restate an already-shown label', () => {
    expect(
      getUniqueDisplayTags(
        ['romantic', 'supportive', 'relationship', 'creative'],
        ['Girlfriend', 'Romantic'],
      ),
    ).toEqual(['supportive', 'relationship', 'creative']);
  });

  it('keeps novel tags untouched, preserving order and casing', () => {
    expect(getUniqueDisplayTags(['creative', 'inspiration'], ['Girlfriend'])).toEqual([
      'creative',
      'inspiration',
    ]);
  });

  it('matches case/dash/underscore-insensitively', () => {
    expect(getUniqueDisplayTags(['THIRD-PARTY', 'mentioned_only', 'novel'], ['Third Party', 'Mentioned Only'])).toEqual([
      'novel',
    ]);
  });

  it('respects max after filtering', () => {
    expect(getUniqueDisplayTags(['a', 'b', 'c', 'd'], [], 2)).toEqual(['a', 'b']);
  });

  it('ignores null/undefined/empty entries in alreadyShown', () => {
    expect(getUniqueDisplayTags(['family'], [null, undefined, '', 'family'])).toEqual([]);
  });

  it('returns an empty array when tags is undefined', () => {
    expect(getUniqueDisplayTags(undefined, ['anything'])).toEqual([]);
  });
});
