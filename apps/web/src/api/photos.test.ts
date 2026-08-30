import { describe, expect, it, vi } from 'vitest';

import { fetchJson } from '../lib/api';

import { photosApi } from './photos';

vi.mock('../lib/api', () => ({
  fetchJson: vi.fn(),
}));

describe('photosApi', () => {
  it('queries photo descriptions and metadata through the API', async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      success: true,
      result: {
        query: 'beach',
        photos: [],
        total: 0,
        warnings: [],
      },
    });

    await expect(photosApi.query({ query: 'beach', limit: 10 })).resolves.toMatchObject({
      query: 'beach',
      total: 0,
    });
    expect(fetchJson).toHaveBeenCalledWith('/api/photos/query', {
      method: 'POST',
      body: JSON.stringify({ query: 'beach', limit: 10 }),
    });
  });
});
