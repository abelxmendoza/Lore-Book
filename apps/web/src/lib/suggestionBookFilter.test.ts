import { describe, expect, it } from 'vitest';

import {
  areNicknameVariants,
  collapseSuggestionsByBookMatch,
  filterVisibleSuggestions,
  resolveSuggestionBookMatch,
} from './suggestionBookFilter';

describe('resolveSuggestionBookMatch — nicknames', () => {
  const kiley = [{ id: '3c89d5ba-4929-4903-a8b0-ceef5b9be178', name: 'Kiley Tafur', aliases: ['Kiley'] }];

  it('marks Killa as similar to Kiley Tafur instead of a new person', () => {
    const match = resolveSuggestionBookMatch('Killa', kiley);
    expect(match.status).toBe('similar');
    expect(match.matched_book_id).toBe('3c89d5ba-4929-4903-a8b0-ceef5b9be178');
    expect(match.matched_book_name).toMatch(/Kiley/);
  });

  it('still hides an exact alias as already in the book', () => {
    expect(resolveSuggestionBookMatch('Kiley', kiley).status).toBe('existing');
  });

  it('does not treat unrelated short names as nicknames', () => {
    expect(areNicknameVariants('mark', 'mary')).toBe(false);
    expect(resolveSuggestionBookMatch('Mary', [{ name: 'Mark Johnson' }]).status).toBe('new');
  });
});

describe('skill suggestion visibility', () => {
  it('hides exact book matches and keeps the strongest similar card per book skill', () => {
    const visible = filterVisibleSuggestions(
      [
        { skill_name: 'Front-End Development', match_status: 'existing' as const, confidence: 0.9 },
        {
          skill_name: 'Socializing at night events',
          match_status: 'similar' as const,
          matched_book_id: 'book-social',
          matched_book_name: 'Socializing',
          confidence: 0.88,
        },
        {
          skill_name: 'Meeting people at concerts',
          match_status: 'similar' as const,
          matched_book_id: 'book-social',
          matched_book_name: 'Socializing',
          confidence: 0.93,
        },
        { skill_name: 'Calligraphy', match_status: 'new' as const, confidence: 0.8 },
      ],
      (item) => item.skill_name,
      [{ id: 'book-frontend', name: 'Front-End Development' }],
    );

    expect(visible.map((item) => item.skill_name)).toEqual([
      'Meeting people at concerts',
      'Calligraphy',
    ]);
  });

  it('keeps unmatched new suggestions instead of collapsing them together', () => {
    const collapsed = collapseSuggestionsByBookMatch([
      { match_status: 'new' as const, skill_name: 'Networking', confidence: 0.8 },
      { match_status: 'new' as const, skill_name: 'Self Marketing', confidence: 0.9 },
    ]);
    expect(collapsed).toHaveLength(2);
  });
});
