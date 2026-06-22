import { describe, it, expect, vi } from 'vitest';
import { consumeHighlightItemId, resolveBookHighlightItem } from './resolveBookHighlight';

describe('resolveBookHighlightItem', () => {
  it('returns a list match without fetching', async () => {
    const fetchById = vi.fn();
    const result = await resolveBookHighlightItem({
      id: 'a',
      items: [{ id: 'a', name: 'Alpha' }],
      fetchById,
    });
    expect(result).toEqual({ id: 'a', name: 'Alpha' });
    expect(fetchById).not.toHaveBeenCalled();
  });

  it('fetches when the id is not in the list', async () => {
    const fetchById = vi.fn(async () => ({ id: 'b', name: 'Beta' }));
    const result = await resolveBookHighlightItem({
      id: 'b',
      items: [{ id: 'a', name: 'Alpha' }],
      fetchById,
    });
    expect(result).toEqual({ id: 'b', name: 'Beta' });
    expect(fetchById).toHaveBeenCalledWith('b');
  });

  it('returns null when fetch fails', async () => {
    const result = await resolveBookHighlightItem({
      id: 'missing',
      items: [],
      fetchById: vi.fn(async () => {
        throw new Error('not found');
      }),
    });
    expect(result).toBeNull();
  });
});

describe('consumeHighlightItemId', () => {
  it('reads and clears highlightItem from sessionStorage', () => {
    sessionStorage.setItem('highlightItem', 'entity-123');
    expect(consumeHighlightItemId()).toBe('entity-123');
    expect(sessionStorage.getItem('highlightItem')).toBeNull();
  });
});
