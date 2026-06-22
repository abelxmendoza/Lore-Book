/**
 * Resolve a deep-link id against a loaded book list, falling back to a single-entity fetch.
 */
export async function resolveBookHighlightItem<T>(options: {
  id: string;
  items: T[];
  match?: (item: T, id: string) => boolean;
  fetchById: (id: string) => Promise<T>;
}): Promise<T | null> {
  const { id, items, fetchById } = options;
  const matcher =
    options.match ??
    ((item: T, needle: string) => (item as { id?: string }).id === needle);

  const found = items.find((item) => matcher(item, id));
  if (found) return found;

  try {
    return await fetchById(id);
  } catch {
    return null;
  }
}

/** Read and clear `highlightItem` from sessionStorage (chat → book navigation). */
export function consumeHighlightItemId(): string | null {
  if (typeof window === 'undefined') return null;
  const id = sessionStorage.getItem('highlightItem');
  if (!id) return null;
  sessionStorage.removeItem('highlightItem');
  return id;
}
