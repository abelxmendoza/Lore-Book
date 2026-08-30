import { describe, expect, it } from 'vitest';
import {
  composeDisplayNameWithEpithet,
  hasPersonNameEpithet,
  isThemeShapedEpithet,
  resolveStoredEpithet,
  splitPersonNameEpithet,
  stripPersonNameEpithet,
} from './personNameEpithet';

describe('personNameEpithet', () => {
  it('splits kinship + epithet into base name and title', () => {
    expect(splitPersonNameEpithet('Aunt Maribel the Hallway Guardian')).toEqual({
      baseName: 'Aunt Maribel',
      epithet: 'Hallway Guardian',
    });
    expect(stripPersonNameEpithet('Reese the Recruiter')).toBe('Reese');
  });

  it('leaves scene "from the …" tails alone', () => {
    expect(splitPersonNameEpithet('Neon Pixie from the Underground Scene')).toEqual({
      baseName: 'Neon Pixie from the Underground Scene',
      epithet: null,
    });
    expect(hasPersonNameEpithet('Neon Pixie from the Underground Scene')).toBe(false);
  });

  it('is a no-op for ordinary names', () => {
    expect(splitPersonNameEpithet('Tía Grace')).toEqual({
      baseName: 'Tía Grace',
      epithet: null,
    });
  });

  it('composes intentional display names from stored epithet', () => {
    expect(composeDisplayNameWithEpithet('Aunt Maribel', 'Hallway Guardian')).toBe(
      'Aunt Maribel the Hallway Guardian',
    );
    expect(composeDisplayNameWithEpithet('Aunt Maribel the Hallway Guardian', 'Hallway Guardian')).toBe(
      'Aunt Maribel the Hallway Guardian',
    );
  });

  it('ignores unpinned theme-shaped chapter titles', () => {
    expect(isThemeShapedEpithet('Isolation And Resilience')).toBe(true);
    expect(isThemeShapedEpithet('Hallway Guardian')).toBe(false);
    expect(resolveStoredEpithet({ epithet: 'Isolation And Resilience' })).toBeNull();
    expect(
      resolveStoredEpithet({ epithet: 'Isolation And Resilience', epithet_pinned: true }),
    ).toBe('Isolation And Resilience');
  });

  it('reads epithet from metadata with disable flag', () => {
    expect(resolveStoredEpithet({ epithet: 'Hallway Guardian' })).toBe('Hallway Guardian');
    expect(resolveStoredEpithet({ contextual_title: 'Bootcamp Mentor' })).toBe('Bootcamp Mentor');
    expect(resolveStoredEpithet({ epithet: 'Hallway Guardian', epithet_disabled: true })).toBeNull();
  });
});
