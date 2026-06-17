import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyGuestLoreUpdates,
  clearGuestLore,
  getGuestCharacters,
  getGuestEntries,
  getGuestLoreSnapshot,
} from './guestLoreStore';

describe('guestLoreStore', () => {
  const guestId = 'guest_test_lore';

  beforeEach(() => {
    localStorage.clear();
    clearGuestLore(guestId);
  });

  it('creates and merges characters from extraction updates', () => {
    applyGuestLoreUpdates(guestId, {
      characters: [{ name: 'Marcus', role: 'friend', summary: 'College roommate' }],
      entries: [{ content: 'Marcus helped me move apartments today.', summary: 'Moving day with Marcus' }],
    });

    expect(getGuestCharacters(guestId)).toHaveLength(1);
    expect(getGuestCharacters(guestId)[0].name).toBe('Marcus');
    expect(getGuestEntries(guestId)).toHaveLength(1);

    applyGuestLoreUpdates(guestId, {
      characters: [{ name: 'Marcus', summary: 'Now works in finance.' }],
    });

    const marcus = getGuestCharacters(guestId)[0];
    expect(marcus.summary).toContain('College roommate');
    expect(marcus.summary).toContain('finance');
  });

  it('exports snapshot for guest chat API', () => {
    applyGuestLoreUpdates(guestId, {
      characters: [{ name: 'Daisy', alias: ['Hell Fairy'], role: 'DJ' }],
      entries: [{ content: 'Daisy played an incredible set last night.' }],
      locations: [{ name: 'Neon Lounge', summary: 'Downtown venue' }],
    });

    const snapshot = getGuestLoreSnapshot(guestId);
    expect(snapshot.characters[0].name).toBe('Daisy');
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.locations[0].name).toBe('Neon Lounge');
  });
});
