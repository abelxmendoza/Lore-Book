/** Shared LoreBook library routing and demo book helpers. */

export function isDemoBookId(bookId: string): boolean {
  return bookId.startsWith('demo-');
}

export function lorebookReadUrl(bookId: string): string {
  return `/lorebook?book=${encodeURIComponent(bookId)}`;
}

export function lorebookEditUrl(bookId: string): string {
  return `/memoir?book=${encodeURIComponent(bookId)}`;
}
