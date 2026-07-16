import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearStoryAttempt,
  latestRecoverableStory,
  preserveStoryAttempt,
  readComposerDraft,
  requestStoryRecovery,
  resetStorySafetyVaultForTests,
  saveComposerDraft,
  subscribeStoryRecovery,
} from './storySafetyVault';

describe('storySafetyVault', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStorySafetyVaultForTests();
  });

  it('keeps a draft across a reload until the composer is cleared', () => {
    saveComposerDraft('user-1', 'thread-1', 'A long story I cannot lose');
    expect(readComposerDraft('user-1', 'thread-1')).toBe('A long story I cannot lose');

    saveComposerDraft('user-1', 'thread-1', '');
    expect(readComposerDraft('user-1', 'thread-1')).toBe('');
  });

  it('retains an attempted story until durable persistence is confirmed', () => {
    const result = preserveStoryAttempt({
      id: 'attempt-1',
      ownerId: 'user-1',
      threadId: 'thread-1',
      text: 'The original words',
      createdAt: '2026-07-11T00:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    expect(latestRecoverableStory('user-1', 'thread-1')?.text).toBe('The original words');

    clearStoryAttempt('attempt-1');
    expect(latestRecoverableStory('user-1', 'thread-1')).toBeNull();
  });

  it('reports ok:false when localStorage write fails', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const result = preserveStoryAttempt({
      id: 'attempt-quota',
      ownerId: 'user-1',
      threadId: 'thread-1',
      text: 'Cannot persist locally',
      createdAt: '2026-07-11T00:00:00.000Z',
    });
    expect(result.ok).toBe(false);
    setItem.mockRestore();
  });

  it('notifies the mounted composer when a failed story needs recovery', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStoryRecovery(listener);
    const attempt = {
      id: 'attempt-2',
      ownerId: 'user-1',
      threadId: 'thread-1',
      text: 'Restore me exactly',
      createdAt: '2026-07-11T00:00:00.000Z',
    };

    requestStoryRecovery(attempt);
    expect(listener).toHaveBeenCalledWith(attempt);
    unsubscribe();
  });
});
