import { describe, expect, it } from 'vitest';

import { isLorebookLibraryRoute } from './lorebookLibrary';

describe('isLorebookLibraryRoute', () => {
  it.each([
    '/lorebook/library',
    '/lorebookLibrary',
    '/demo/lorebook/library',
    '/demo/lorebookLibrary',
  ])('recognizes %s as the LoreBooks Library', (pathname) => {
    expect(isLorebookLibraryRoute(pathname)).toBe(true);
  });

  it('does not treat the book reader as the Library', () => {
    expect(isLorebookLibraryRoute('/demo/lorebook?book=demo-1')).toBe(false);
  });
});
