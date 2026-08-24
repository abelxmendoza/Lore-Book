import { describe, expect, it } from 'vitest';

import {
  areNicknameVariants,
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
