import { describe, it, expect } from 'vitest';
import { loreBookNoticeBus } from '../../src/services/lorebook/parser/loreBookNoticeBus';
import { publishLoreBookNotice } from '../../src/services/lorebook/parser/loreBookNoticeService';

describe('loreBookNoticeBus integration', () => {
  it('waitFor resolves after publish (long-poll path)', async () => {
    const chatMessageId = `integration-${Date.now()}`;

    const waitPromise = loreBookNoticeBus.waitFor(chatMessageId, 500);

    setTimeout(() => {
      publishLoreBookNotice(chatMessageId, 'user-1', [
        { domain: 'quests', name: 'Ship beta', confidence: 0.9 },
      ]);
    }, 50);

    const event = await waitPromise;
    expect(event).not.toBeNull();
    expect(event?.items[0]?.name).toBe('Ship beta');
  });

  it('get returns cached notice immediately', () => {
    const chatMessageId = `cached-${Date.now()}`;
    publishLoreBookNotice(chatMessageId, 'user-1', [
      { domain: 'skills', name: 'Robotics', confidence: 0.8 },
    ]);
    expect(loreBookNoticeBus.get(chatMessageId)?.items[0]?.domain).toBe('skills');
  });
});
