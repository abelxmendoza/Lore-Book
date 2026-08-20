import { describe, expect, it } from 'vitest';
import type { Character } from '../components/characters/CharacterProfileCard';
import {
  characterCreatedAt,
  characterFirstMentionedAt,
  compareCharactersByName,
  formatCharacterDate,
  withCharacterTimelineDates,
} from './characterTimeline';

function char(partial: Partial<Character>): Character {
  return { id: 'c1', name: 'Jamie', ...partial };
}

describe('characterTimeline', () => {
  it('prefers first_appearance, then metadata first_mentioned', () => {
    expect(
      characterFirstMentionedAt(
        char({ first_appearance: '2024-11-15', metadata: { first_mentioned: '2024-01-01' } }),
      ),
    ).toBe('2024-11-15');
    expect(
      characterFirstMentionedAt(char({ metadata: { first_mentioned: '2024-11-20' } })),
    ).toBe('2024-11-20');
  });

  it('uses created_at for when the card was made, falling back to first mention', () => {
    expect(characterCreatedAt(char({ created_at: '2026-08-01T12:00:00.000Z' }))).toBe(
      '2026-08-01T12:00:00.000Z',
    );
    expect(characterCreatedAt(char({ first_appearance: '2024-09-10' }))).toBe('2024-09-10');
  });

  it('sorts names alphabetically, case-insensitive', () => {
    const names = [char({ name: 'Renna' }), char({ name: 'alex' }), char({ name: 'Tía Maya' })]
      .sort(compareCharactersByName)
      .map((row) => row.name);
    expect(names).toEqual(['alex', 'Renna', 'Tía Maya']);
  });

  it('hydrates missing first_appearance and created_at from metadata', () => {
    const hydrated = withCharacterTimelineDates(
      char({ metadata: { first_mentioned: '2024-11-15', generated_at: '2024-11-16T00:00:00.000Z' } }),
    );
    expect(hydrated.first_appearance).toBe('2024-11-15');
    expect(hydrated.created_at).toBe('2024-11-16T00:00:00.000Z');
  });

  it('formats a readable date', () => {
    expect(formatCharacterDate('2024-11-15')).toMatch(/Nov 15, 2024/);
    expect(formatCharacterDate('not-a-date')).toBeNull();
  });
});
