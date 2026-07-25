import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useCharacterProfileBundle } from './useCharacterProfileBundle';
import { STORY_DATA_UPDATED, type StoryDataUpdatedDetail } from '../lib/storyRefresh';

const cachedFetchJson = vi.fn();
const invalidateCache = vi.fn();

vi.mock('../lib/requestCache', () => ({
  cachedFetchJson: (...args: unknown[]) => cachedFetchJson(...args),
  invalidateCache: (...args: unknown[]) => invalidateCache(...args),
}));

function fireStory(detail: StoryDataUpdatedDetail) {
  window.dispatchEvent(new CustomEvent(STORY_DATA_UPDATED, { detail }));
}

describe('useCharacterProfileBundle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cachedFetchJson.mockResolvedValue({
      success: true,
      bundle: {
        characterId: 'char-1',
        detail: { id: 'char-1', name: 'Mina' },
        knowledgeBase: {},
        loreProfile: {},
        chatMentions: [],
        generatedAt: new Date().toISOString(),
      },
    });
  });

  it('does not flip loading during targeted story refresh after initial load', async () => {
    const { result } = renderHook(() => useCharacterProfileBundle('char-1', true));

    await waitFor(() => {
      expect(result.current.bundle?.detail).toBeTruthy();
      expect(result.current.loading).toBe(false);
    });

    cachedFetchJson.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                success: true,
                bundle: {
                  characterId: 'char-1',
                  detail: { id: 'char-1', name: 'Mina Updated' },
                  knowledgeBase: {},
                  loreProfile: {},
                  chatMentions: [],
                  generatedAt: new Date().toISOString(),
                },
              }),
            30,
          );
        }),
    );

    act(() => {
      fireStory({
        scopes: ['organizations', 'characters'],
        characterIds: ['char-1'],
      });
    });

    // Silent refresh: keep prior bundle and stay non-loading.
    expect(result.current.loading).toBe(false);
    expect((result.current.bundle?.detail as { name?: string })?.name).toBe('Mina');
    expect(invalidateCache).toHaveBeenCalledWith('/api/characters/char-1/profile-bundle');

    await waitFor(() => {
      expect((result.current.bundle?.detail as { name?: string })?.name).toBe('Mina Updated');
    });
    expect(result.current.loading).toBe(false);
  });

  it('ignores story updates for other character ids', async () => {
    const { result } = renderHook(() => useCharacterProfileBundle('char-1', true));
    await waitFor(() => expect(result.current.bundle).toBeTruthy());
    const callsAfterLoad = cachedFetchJson.mock.calls.length;

    act(() => {
      fireStory({
        scopes: ['organizations', 'characters'],
        characterIds: ['char-other'],
      });
    });

    expect(cachedFetchJson.mock.calls.length).toBe(callsAfterLoad);
  });
});
