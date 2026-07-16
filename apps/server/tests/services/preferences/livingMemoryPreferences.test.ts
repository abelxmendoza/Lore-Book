import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIVING_MEMORY_PREFERENCES,
  loadLivingMemoryPreferences,
  saveLivingMemoryPreferences,
} from '../../../src/services/preferences/livingMemoryPreferences';

describe('livingMemoryPreferences', () => {
  it('returns defaults for empty user id', async () => {
    await expect(loadLivingMemoryPreferences('')).resolves.toEqual(
      DEFAULT_LIVING_MEMORY_PREFERENCES,
    );
  });

  it('round-trips in-memory when profile write is unavailable', async () => {
    const userId = `living-memory-test-${Date.now()}`;
    const saved = await saveLivingMemoryPreferences(userId, {
      useLivingMemory: false,
      ambientCapturePaused: true,
    });

    expect(saved.useLivingMemory).toBe(false);
    expect(saved.writeLivingMemory).toBe(true);
    expect(saved.ambientCapturePaused).toBe(true);
    expect(saved.externalContextWrites).toBe(true);

    const loaded = await loadLivingMemoryPreferences(userId);
    expect(loaded).toEqual(saved);
  });
});
