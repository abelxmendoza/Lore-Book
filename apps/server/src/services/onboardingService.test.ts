import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./memoryService', () => ({
  memoryService: { saveEntry: vi.fn().mockResolvedValue({ id: 'entry-1', date: null }) },
}));

import { onboardingService } from './onboardingService';
import { memoryService } from './memoryService';

describe('onboardingService journal occurrence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fabricate an occurrence date for profile/onboarding facts', async () => {
    await onboardingService.initialize('user-maya');
    await onboardingService.importMemories('user-maya', {
      files: [{ name: 'notes.txt', content: 'I work in robotics.' }],
    });

    const calls = vi.mocked(memoryService.saveEntry).mock.calls.map((c) => c[0]);
    expect(calls.length).toBeGreaterThan(0);
    for (const payload of calls) {
      expect(payload.date).toBeUndefined();
    }
  });
});
