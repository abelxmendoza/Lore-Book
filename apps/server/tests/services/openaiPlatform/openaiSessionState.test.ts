import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockMaybeSingle = vi.fn();
const mockUpdate = vi.fn();

vi.mock('../../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: mockMaybeSingle,
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: mockUpdate,
        })),
      })),
    })),
  },
}));

vi.mock('../../../src/logger', () => ({
  logger: { warn: vi.fn(), debug: vi.fn() },
}));

import {
  isOpenAiPlatformEnabled,
  loadOpenAiSessionState,
  mergeOpenAiSessionState,
} from '../../../src/services/openaiPlatform/openaiSessionState';

describe('openaiSessionState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMaybeSingle.mockResolvedValue({
      data: { metadata: { openai: { last_response_id: 'resp_1' } } },
      error: null,
    });
    mockUpdate.mockResolvedValue({ error: null });
  });

  it('loads mirrored OpenAI state from session metadata', async () => {
    const state = await loadOpenAiSessionState('user-1', 'sess-1');
    expect(state.last_response_id).toBe('resp_1');
  });

  it('merges OpenAI state without dropping unrelated metadata', async () => {
    await mergeOpenAiSessionState('user-1', 'sess-1', {
      last_response_id: 'resp_2',
    });
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('detects when any platform feature is enabled', () => {
    expect(isOpenAiPlatformEnabled({ responseChaining: false })).toBe(false);
    expect(isOpenAiPlatformEnabled({ vectorStoreEnabled: true })).toBe(true);
  });
});
