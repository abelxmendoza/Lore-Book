import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }),
    },
  },
}));

vi.mock('./security', () => ({
  addCsrfHeaders: (h: Record<string, string>) => h,
  acquireCsrfToken: vi.fn(),
  getCsrfToken: () => 'csrf',
}));

vi.mock('../config/env', () => ({
  config: { api: { url: 'http://api.test' } },
}));

import { compileLorebookFromTopic, compileLorebookFromQuery } from './lorebookCompile';

describe('lorebookCompile topic path', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('posts topicId to /generate, not /search', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ biography: { id: 'b1' }, biographyId: 'b1', persisted: true }),
    } as Response);

    await compileLorebookFromTopic('professional');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/biography/generate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ topicId: 'professional', force: false }),
      }),
    );
  });

  it('includes characterId for person topics', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ biography: { id: 'b2' }, biographyId: 'b2', persisted: true }),
    } as Response);

    const characterId = '22222222-2222-4222-8222-222222222222';
    await compileLorebookFromTopic('character_book', { characterId });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/biography/generate',
      expect.objectContaining({
        body: JSON.stringify({
          topicId: 'character_book',
          force: false,
          characterId,
        }),
      }),
    );
  });

  it('includes organizationId for career focus', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ biography: { id: 'b4' }, biographyId: 'b4', persisted: true }),
    } as Response);

    const organizationId = '44444444-4444-4444-8444-444444444444';
    await compileLorebookFromTopic('professional', { organizationId });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/biography/generate',
      expect.objectContaining({
        body: JSON.stringify({
          topicId: 'professional',
          force: false,
          organizationId,
        }),
      }),
    );
  });

  it('query compile still uses /search', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ biography: { id: 'b3' } }),
    } as Response);

    await compileLorebookFromQuery('my music journey');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/biography/search',
      expect.anything(),
    );
  });
});
