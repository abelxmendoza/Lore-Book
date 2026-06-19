/** Shared LoreBook library routing and demo book helpers. */

export const LOREBOOK_LIBRARY_PATH = '/lorebook/library';
export const LOREBOOK_LIBRARY_LEGACY_PATH = '/lorebookLibrary';

export function isDemoBookId(bookId: string): boolean {
  return bookId.startsWith('demo-');
}

export function isLorebookLibraryRoute(pathname: string): boolean {
  const path = pathname.split('?')[0].split('#')[0];
  return path === LOREBOOK_LIBRARY_PATH || path === LOREBOOK_LIBRARY_LEGACY_PATH;
}

export function lorebookLibraryUrl(): string {
  return LOREBOOK_LIBRARY_PATH;
}

export function lorebookReadUrl(bookId: string): string {
  return `/lorebook?book=${encodeURIComponent(bookId)}`;
}

export function lorebookEditUrl(bookId: string): string {
  return `/memoir?book=${encodeURIComponent(bookId)}`;
}

export function resolveDefaultEditorBookId(
  compiledBooks: Array<{ id: string; is_core_lorebook?: boolean }>,
): string | null {
  const core = compiledBooks.find((book) => book.is_core_lorebook);
  return (core ?? compiledBooks[0])?.id ?? null;
}

export function isCompiledLorebook(
  bookId: string,
  compiledBooks: Array<{ id: string }>,
): boolean {
  return compiledBooks.some((book) => book.id === bookId);
}

/** Editor URL for the first compiled book, or bare `/memoir` when none exist yet. */
export function lorebookEditorUrlForCompiledBooks(
  compiledBooks: Array<{ id: string; is_core_lorebook?: boolean }>,
): string {
  const bookId = resolveDefaultEditorBookId(compiledBooks);
  return bookId ? lorebookEditUrl(bookId) : '/memoir';
}
