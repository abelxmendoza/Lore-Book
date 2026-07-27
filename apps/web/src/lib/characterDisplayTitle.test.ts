import { describe, expect, it } from 'vitest';
import { getCharacterDisplayTitle, getCharacterSubtitle } from './characterDisplayTitle';

describe('characterDisplayTitle epithets', () => {
  it('composes Name the Epithet from metadata.epithet', () => {
    expect(
      getCharacterDisplayTitle({
        name: 'Aunt Maribel',
        first_name: 'Maribel',
        alias: ['Hallway Guardian'],
        metadata: { epithet: 'Hallway Guardian' },
      } as any),
    ).toBe('Aunt Maribel the Hallway Guardian');
  });

  it('does not repeat epithet as subtitle', () => {
    expect(
      getCharacterSubtitle({
        name: 'Aunt Maribel',
        metadata: { epithet: 'Hallway Guardian' },
      } as any),
    ).toBeNull();
  });

  it('honors epithet_disabled', () => {
    expect(
      getCharacterDisplayTitle({
        name: 'Aunt Maribel',
        first_name: 'Maribel',
        metadata: { epithet: 'Hallway Guardian', epithet_disabled: true },
      } as any),
    ).toBe('Maribel');
  });
});
