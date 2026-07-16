import { describe, expect, it } from 'vitest';
import { displayChipName, formatSelfChipLabel, isSelfBleedLabel } from './selfChipLabel';

describe('isSelfBleedLabel', () => {
  it('flags bare self pronouns', () => {
    expect(isSelfBleedLabel('You')).toBe(true);
    expect(isSelfBleedLabel('me')).toBe(true);
    expect(isSelfBleedLabel('Myself')).toBe(true);
  });

  it('flags connective + you sentence bleed', () => {
    expect(isSelfBleedLabel('And You')).toBe(true);
    expect(isSelfBleedLabel('Also You')).toBe(true);
    expect(isSelfBleedLabel('But You')).toBe(true);
    expect(isSelfBleedLabel('and you')).toBe(true);
  });

  it('does not flag real people', () => {
    expect(isSelfBleedLabel('Ink')).toBe(false);
    expect(isSelfBleedLabel('Andre')).toBe(false);
    expect(isSelfBleedLabel('Youcef')).toBe(false);
    expect(isSelfBleedLabel('Abel Mendoza')).toBe(false);
  });
});

describe('formatSelfChipLabel', () => {
  it('renders And You as You (Firstname) when real name is known', () => {
    expect(
      formatSelfChipLabel('And You', {
        name: 'And You',
        metadata: { is_self: true, real_name: 'Abel Mendoza', first_name: 'Abel' },
      }),
    ).toBe('You (Abel)');
  });

  it('falls back to You without a first name', () => {
    expect(formatSelfChipLabel('And You')).toBe('You');
    expect(formatSelfChipLabel('Also You')).toBe('You');
  });

  it('leaves unrelated names alone', () => {
    expect(formatSelfChipLabel('Ink')).toBeNull();
    expect(displayChipName('Ink')).toBe('Ink');
  });
});
