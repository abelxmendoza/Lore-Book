import { describe, it, expect } from 'vitest';
import {
  buildEventSourceFingerprint,
  buildAssemblyFingerprint,
  EVENT_EXTRACTOR_VERSION,
} from '../../../src/services/events/eventSourceIdentity';

describe('eventSourceIdentity', () => {
  const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const messageId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  it('is stable across calls', () => {
    const a = buildEventSourceFingerprint({
      userId,
      sourceMessageId: messageId,
      subject: 'SonicBoomBox afterparty',
    });
    const b = buildEventSourceFingerprint({
      userId,
      sourceMessageId: messageId,
      subject: 'SonicBoomBox afterparty',
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(40);
  });

  it('differs by subject', () => {
    const a = buildEventSourceFingerprint({
      userId,
      sourceMessageId: messageId,
      subject: 'Anime Expo',
    });
    const b = buildEventSourceFingerprint({
      userId,
      sourceMessageId: messageId,
      subject: 'tía house food',
    });
    expect(a).not.toBe(b);
  });

  it('assembly fingerprint ignores unit order', () => {
    const a = buildAssemblyFingerprint({ userId, unitIds: ['u2', 'u1', 'u3'] });
    const b = buildAssemblyFingerprint({ userId, unitIds: ['u1', 'u3', 'u2'] });
    expect(a).toBe(b);
    expect(EVENT_EXTRACTOR_VERSION).toBe('v1');
  });
});
