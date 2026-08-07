import { describe, it, expect, vi } from 'vitest';
import { retryWithExponentialBackoff } from '../../src/lib/openaiRetry';

/**
 * Pins the exact retry contract ingestionPipelineClass.ts's entity
 * extraction/resolution step relies on: maxAttempts 2, shouldRetry always
 * true (not the default rate-limit-only predicate), a short base delay.
 * Before this, a single transient failure here set entityResolutionFailed
 * with no recovery for the rest of that message.
 */
describe('entity extraction/resolution retry contract', () => {
  const options = {
    maxAttempts: 2,
    baseDelayMs: 1,
    shouldRetry: () => true,
  };

  it('recovers from one transient failure and returns the second attempt result', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient DB blip'))
      .mockResolvedValueOnce({ candidateEntities: [], resolved: [{ id: 'e1', type: 'PERSON' }] });

    const result = await retryWithExponentialBackoff(fn, options);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(result.resolved).toEqual([{ id: 'e1', type: 'PERSON' }]);
  });

  it('still throws (preserving entityResolutionFailed) when both attempts fail', async () => {
    const persistentError = new Error('still broken');
    const fn = vi.fn().mockRejectedValue(persistentError);

    await expect(retryWithExponentialBackoff(fn, options)).rejects.toThrow('still broken');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('succeeds on the first attempt without retrying when there is no error', async () => {
    const fn = vi.fn().mockResolvedValueOnce({ candidateEntities: [], resolved: [] });

    await retryWithExponentialBackoff(fn, options);

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
