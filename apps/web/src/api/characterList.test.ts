import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../lib/api', () => ({
  fetchJson: vi.fn(),
}));

import { fetchJson } from '../lib/api';
import { fetchCharacterList } from './characterList';

describe('fetchCharacterList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('unwraps books BFF character payload', async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      success: true,
      data: { characters: [{ id: 'c1', name: 'Ada' }] },
      characters: [{ id: 'c1', name: 'Ada' }],
    });

    const list = await fetchCharacterList();
    expect(fetchJson).toHaveBeenCalledWith('/api/books/characters', undefined, undefined);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Ada');
  });
});
