import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/services/openaiClient', () => ({
  openai: {
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  },
}));

import {
  isOpenAiCircuitOpen,
  recordOpenAiFailure,
  resetOpenAiCircuitBreakerForTests,
} from '../../src/lib/openaiCircuitBreaker';
import { openai } from '../../src/services/openaiClient';
import { locationNicknameService } from '../../src/services/locationNicknameService';

describe('locationNicknameService', () => {
  beforeEach(() => {
    resetOpenAiCircuitBreakerForTests();
    vi.mocked(openai.chat.completions.create).mockReset();
  });

  it('returns early without calling OpenAI when circuit is open', async () => {
    for (let i = 0; i < 5; i += 1) {
      recordOpenAiFailure({ status: 429 });
    }
    expect(isOpenAiCircuitOpen()).toBe(true);

    const result = await locationNicknameService.detectAndGenerateNicknames(
      'user-1',
      'we went to that pizza shop near the park'
    );

    expect(result).toEqual([]);
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });
});
