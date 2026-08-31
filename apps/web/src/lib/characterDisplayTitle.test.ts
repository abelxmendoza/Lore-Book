import { describe, expect, it } from 'vitest';
import { getCharacterAliases, getCharacterDisplayTitle, getCharacterSubtitle } from './characterDisplayTitle';

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

  it('does not compose an unpinned theme epithet onto the protagonist', () => {
    expect(
      getCharacterDisplayTitle({
        name: 'Jamie Rivera',
        first_name: 'Jamie',
        last_name: 'Rivera',
        alias: ['Isolation And Resilience', 'Jamie Rivera the Isolation And Resilience'],
        metadata: {
          is_self: true,
          epithet: 'Isolation And Resilience',
        },
      } as any),
    ).toBe('Jamie Rivera');
  });

  it('drops theme-shaped and composed aliases on the protagonist', () => {
    expect(
      getCharacterAliases({
        name: 'Jamie Rivera',
        alias: ['Jamie', 'Isolation And Resilience', 'Jamie Rivera the Isolation And Resilience'],
        metadata: { is_self: true, epithet: 'Isolation And Resilience' },
      } as any),
    ).toEqual(['Jamie']);
  });
});

describe('characterDisplayTitle alias edits', () => {
  it('drops a stale nickname title after the alias is removed', () => {
    expect(
      getCharacterDisplayTitle({
        name: 'Jamie Rivera',
        first_name: 'Jamie',
        last_name: 'Rivera',
        alias: [],
        metadata: {
          display_title: {
            primaryTitle: 'WrongNick (Jamie Rivera)',
            stability: 'stable',
            aliases: [{ value: 'WrongNick' }],
          },
        },
      } as any),
    ).toBe('Jamie Rivera');
  });

  it('does not resurrect removed aliases from stale display_title metadata', () => {
    expect(
      getCharacterAliases({
        alias: ['Tay'],
        metadata: {
          display_title: {
            aliases: [{ value: 'WrongNick' }, { value: 'Tay' }],
          },
        },
      } as any),
    ).toEqual(['Tay']);
  });
});
