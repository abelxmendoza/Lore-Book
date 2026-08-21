import { describe, expect, it } from 'vitest';
import type { Character } from '../components/characters/CharacterProfileCard';
import {
  buildBookCategoryMetadataPatch,
  characterBelongsInFamilyBook,
  decideFamilyBookMembership,
  familyTreeCardIds,
  inferredBookCategory,
} from './characterBookCategory';

function char(partial: Partial<Character>): Character {
  return {
    id: 'c1',
    name: 'Jamie',
    ...partial,
  };
}

describe('characterBelongsInFamilyBook', () => {
  it('keeps titled kin in Family', () => {
    expect(characterBelongsInFamilyBook(char({ name: 'Tía Maya', archetype: 'family' }))).toBe(true);
    expect(characterBelongsInFamilyBook(char({ name: 'Mom', archetype: 'family' }))).toBe(true);
  });

  it('keeps an explicit “my cousin …” alias in Family', () => {
    expect(
      characterBelongsInFamilyBook(
        char({ name: 'Jamie', alias: ['my cousin Jamie'], archetype: 'family' }),
      ),
    ).toBe(true);
  });

  it('does not treat a crush as family even with a stale family stamp', () => {
    const crush = char({
      name: 'Renna',
      archetype: 'unrequited_crush',
      tags: ['family'],
      metadata: { relationship_type: 'family', categories: ['family'] },
    });
    const decision = decideFamilyBookMembership(crush);
    expect(decision.matches).toBe(false);
    expect(decision.reason).toMatch(/crush/i);
  });

  it('does not treat a Dating & Romance person as family', () => {
    expect(
      characterBelongsInFamilyBook(char({ name: 'Alex', archetype: 'friend' }), { hasDatingRow: true }),
    ).toBe(false);
  });

  it('ignores a generic family relationship_type without kinship evidence', () => {
    expect(
      characterBelongsInFamilyBook(
        char({
          name: 'Alex',
          archetype: 'family',
          metadata: { relationship_type: 'family', categories: ['family'] },
        }),
      ),
    ).toBe(false);
  });

  it('honors a user pin and a not-family mark', () => {
    expect(
      characterBelongsInFamilyBook(
        char({
          name: 'Alex',
          metadata: { book_category: 'family', book_category_source: 'user_confirmed' },
        }),
      ),
    ).toBe(true);
    expect(
      characterBelongsInFamilyBook(
        char({
          name: 'Tía Maya',
          archetype: 'family',
          metadata: { family_excluded: { value: true, reason: 'book_category:friends' } },
        }),
      ),
    ).toBe(false);
  });

  it('lets a tree-only cousin into Family even without a titled name', () => {
    expect(
      characterBelongsInFamilyBook(char({ name: 'Jamie', archetype: 'friend' }), { onFamilyTree: true }),
    ).toBe(true);
  });

  it('keeps family_excluded off Family even if the card is still pinned', () => {
    expect(
      characterBelongsInFamilyBook(
        char({
          name: 'Alex',
          metadata: {
            book_category: 'family',
            book_category_source: 'user_confirmed',
            family_excluded: { value: true, reason: 'tree_remove' },
          },
        }),
      ),
    ).toBe(false);
  });

  it('keeps a cousin role in Family', () => {
    expect(characterBelongsInFamilyBook(char({ name: 'Jamie', role: 'cousin' }))).toBe(true);
  });
});

describe('familyTreeCardIds', () => {
  it('keeps real cards and skips You / placeholders / synthetic ids', () => {
    const ids = familyTreeCardIds({
      members: [
        { id: 'you', is_self: true },
        { id: 'cousin-jamie', has_card: true },
        { id: '__inferred_parent_unknown__', is_placeholder: true },
        { id: 'name-3' },
        { id: 'head-x' },
        { id: 'group-y' },
        { id: 'tia-maya', has_card: false },
      ],
    });
    expect([...ids]).toEqual(['cousin-jamie']);
  });
});

describe('inferredBookCategory', () => {
  it('routes a crush to Romantic instead of Family', () => {
    const result = inferredBookCategory(
      char({ name: 'Renna', archetype: 'unrequited_crush', metadata: { relationship_type: 'family' } }),
    );
    expect(result.category).toBe('romantic');
  });
});

describe('buildBookCategoryMetadataPatch', () => {
  it('pins a correction and excludes Family when the user picks another tab', () => {
    const patch = buildBookCategoryMetadataPatch({
      nextRaw: 'romantic',
      previousCategory: 'family',
    });
    expect(patch.book_category).toBe('romantic');
    expect(patch.book_category_source).toBe('user_confirmed');
    expect(patch.family_excluded).toEqual(
      expect.objectContaining({ value: true, reason: 'book_category:romantic' }),
    );
  });

  it('marks a Family pin as reviewed so the tree keeps them', () => {
    const patch = buildBookCategoryMetadataPatch({ nextRaw: 'family', previousCategory: 'romantic' });
    expect(patch.family_excluded).toBeNull();
    expect(patch.family_reviewed).toBe(true);
  });

  it('clears a pin so auto can run again', () => {
    const patch = buildBookCategoryMetadataPatch({
      nextRaw: 'auto',
      previousCategory: 'romantic',
      previousExcluded: { value: true, reason: 'book_category:romantic', at: '2026-01-01' },
    });
    expect(patch.book_category).toBeNull();
    expect(patch.book_category_source).toBe('user_cleared');
    expect(patch.family_excluded).toBeNull();
  });
});
