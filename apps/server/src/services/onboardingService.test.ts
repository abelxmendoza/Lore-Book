import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./memoryService', () => ({
  memoryService: {
    saveEntry: vi.fn(),
    searchEntries: vi.fn(),
  },
}));

import { memoryService } from './memoryService';
import { onboardingService } from './onboardingService';

describe('onboardingService occurrence contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(memoryService.saveEntry).mockResolvedValue({ id: 'entry-1' } as never);
  });

  it('3. profile/onboarding facts do not fabricate an event today', async () => {
    await onboardingService.initialize('user-1');
    expect(memoryService.saveEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        content: expect.stringContaining('Welcome to Lore Book'),
      }),
    );
    expect(vi.mocked(memoryService.saveEntry).mock.calls[0][0].date).toBeUndefined();
  });

  it('4. explicit "started today" is left for write-time classification', async () => {
    await onboardingService.importMemories('user-1', {
      files: [{ name: 'story.txt', content: 'I started this job today at Vanguard Robotics.' }],
    });
    const payload = vi.mocked(memoryService.saveEntry).mock.calls[0][0];
    expect(payload.date).toBeUndefined();
    expect(payload.content).toContain('I started this job today');
  });
});
