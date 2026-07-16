import { afterEach, describe, expect, it } from 'vitest';

import {
  chatSendCooldownNotice,
  chatSendCooldownRemainingSec,
  noteChatSendRateLimit,
  resetChatSendRateLimitForTests,
} from './chatSendRateLimit';

afterEach(() => {
  resetChatSendRateLimitForTests();
});

describe('chatSendRateLimit', () => {
  it('arms cooldown from 429 retryAfter', () => {
    const now = 1_000_000;
    expect(noteChatSendRateLimit({ status: 429, retryAfter: 120 }, now)).toBe(true);
    expect(chatSendCooldownRemainingSec(now)).toBe(120);
    expect(chatSendCooldownRemainingSec(now + 60_000)).toBe(60);
  });

  it('ignores non-429 errors', () => {
    expect(noteChatSendRateLimit({ status: 500 }, 0)).toBe(false);
    expect(chatSendCooldownRemainingSec(0)).toBe(0);
  });

  it('caps cooldown at 15 minutes', () => {
    const now = 0;
    noteChatSendRateLimit({ status: 429, retryAfter: 99_999 }, now);
    expect(chatSendCooldownRemainingSec(now)).toBe(15 * 60);
  });

  it('formats a clear wait notice', () => {
    expect(chatSendCooldownNotice(14)).toMatch(/1 minute/);
    expect(chatSendCooldownNotice(90)).toMatch(/2 minutes/);
    expect(chatSendCooldownNotice(840)).toMatch(/14 minutes/);
  });
});
