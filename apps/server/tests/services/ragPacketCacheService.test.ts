import { beforeEach, describe, expect, it } from 'vitest';

import { ragPacketCacheService } from '../../src/services/ragPacketCacheService';

describe('ragPacketCacheService context isolation', () => {
  beforeEach(() => {
    ragPacketCacheService.clearAllCache();
  });

  it('does not reuse the same prompt across different focused entities', () => {
    const prompt = 'What changed?';
    const alexPacket = { target: 'Alex' };

    ragPacketCacheService.cachePacket(
      'user-1',
      prompt,
      alexPacket,
      'thread:thread-1|focus:character:alex',
    );

    expect(
      ragPacketCacheService.getCachedPacket(
        'user-1',
        prompt,
        'thread:thread-1|focus:character:alex',
      ),
    ).toEqual(alexPacket);
    expect(
      ragPacketCacheService.getCachedPacket(
        'user-1',
        prompt,
        'thread:thread-1|focus:character:jordan',
      ),
    ).toBeNull();
  });
});
