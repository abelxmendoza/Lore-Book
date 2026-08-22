import { describe, expect, it } from 'vitest';

import {
  formatWhatsNewDate,
  hasSeenPreviousWhatsNew,
  isWhatsNewSuppressed,
  latestWhatsNewId,
  markWhatsNewSeen,
  unseenWhatsNew,
  WHATS_NEW,
  WHATS_NEW_LEGACY_DISMISS_KEY,
  WHATS_NEW_SEEN_KEY,
  WHATS_NEW_TEST_SUPPRESS,
} from './whatsNew';

function memoryStorage(seed: Record<string, string> = {}) {
  const data = { ...seed };
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
}

describe('whatsNew', () => {
  it('keeps the newest update first with a stable latest id', () => {
    expect(WHATS_NEW.length).toBeGreaterThan(0);
    expect(latestWhatsNewId()).toBe(WHATS_NEW.map((entry) => entry.id).join('+'));
  });

  it('formats dates for non-technical readers', () => {
    expect(formatWhatsNewDate('2026-08-20')).toBe('August 2026');
  });

  it('treats first visit as unseen for every update', () => {
    expect(unseenWhatsNew(null).map((entry) => entry.id)).toEqual(WHATS_NEW.map((entry) => entry.id));
  });

  it('only highlights updates newer than the last seen id', () => {
    const older = WHATS_NEW[2]?.id ?? '';
    const unseen = unseenWhatsNew(older);
    expect(unseen.map((entry) => entry.id)).toEqual(WHATS_NEW.slice(0, 2).map((entry) => entry.id));
  });

  it('reopens for returning users when a newer id ships', () => {
    const storage = memoryStorage({ [WHATS_NEW_SEEN_KEY]: WHATS_NEW[1]?.id ?? '' });
    expect(isWhatsNewSuppressed(storage)).toBe(false);
    expect(hasSeenPreviousWhatsNew(storage)).toBe(true);
  });

  it('stays closed after the latest update is marked seen', () => {
    const storage = memoryStorage();
    markWhatsNewSeen(storage);
    expect(isWhatsNewSuppressed(storage)).toBe(true);
  });

  it('lets automated tests suppress the modal without blocking real returning users', () => {
    const tests = memoryStorage({ [WHATS_NEW_SEEN_KEY]: WHATS_NEW_TEST_SUPPRESS });
    const legacy = memoryStorage({ [WHATS_NEW_LEGACY_DISMISS_KEY]: 'true' });
    expect(isWhatsNewSuppressed(tests)).toBe(true);
    expect(isWhatsNewSuppressed(legacy)).toBe(false);
    expect(hasSeenPreviousWhatsNew(legacy)).toBe(true);
  });
});
