import { describe, it, expect } from 'vitest';

import {
  deriveRosterEntries,
  applyRosterOverrides,
  activeRoster,
  rosterKey,
  rosterRole,
} from './threadRosterService';
import type { ThreadMessageRow } from './threadContentService';

function msg(
  id: string,
  turn: number,
  reply: number,
  mentioned: Array<{ id?: string; name: string; type?: string }>,
): ThreadMessageRow {
  return {
    id,
    role: reply === 0 ? 'user' : 'assistant',
    content: `message ${id}`,
    created_at: '2026-07-10T00:00:00Z',
    turn_number: turn,
    reply_seq: reply,
    metadata: { mentionedEntities: mentioned },
  };
}

describe('threadRosterService — pure helpers', () => {
  describe('deriveRosterEntries', () => {
    it('folds mentions into entries with provenance refs from thread/turn numbers', () => {
      const entries = deriveRosterEntries(
        [
          msg('m1', 1, 0, [{ id: 'c-daisy', name: 'Daisy', type: 'character' }]),
          msg('m2', 1, 1, [{ id: 'c-daisy', name: 'Daisy', type: 'character' }]),
          msg('m3', 2, 0, [
            { id: 'c-daisy', name: 'Daisy', type: 'character' },
            { id: 'o-exlover', name: 'Ex Lover', type: 'organization' },
          ]),
        ],
        12,
      );

      const daisy = entries.find((e) => e.entityId === 'c-daisy')!;
      expect(daisy.mentions).toBe(3);
      expect(daisy.firstSeenRef).toBe('12.1');
      expect(daisy.lastSeenRef).toBe('12.2');
      expect(daisy.role).toBe('main');

      const band = entries.find((e) => e.entityId === 'o-exlover')!;
      expect(band.kind).toBe('organization');
      expect(band.role).toBe('mentioned');
    });

    it('sorts by mentions and omits refs when the thread has no number yet', () => {
      const entries = deriveRosterEntries(
        [
          msg('m1', 1, 0, [
            { id: 'a', name: 'Alpha', type: 'character' },
            { id: 'b', name: 'Beta', type: 'character' },
          ]),
          msg('m2', 2, 0, [{ id: 'b', name: 'Beta', type: 'character' }]),
        ],
        null,
      );
      expect(entries[0].entityId).toBe('b');
      expect(entries[0].firstSeenRef).toBeNull();
    });

    it('adds linked entities missing from message metadata and legacy name-only people', () => {
      const entries = deriveRosterEntries(
        [msg('m1', 1, 0, [{ id: 'c1', name: 'Shyla', type: 'character' }])],
        3,
        [
          { entity_type: 'character', entity_id: 'c2', mention_count: 4, metadata: { entity_name: 'Oscuridad' } },
          { entity_type: 'character', entity_id: 'c-noname', mention_count: 2, metadata: {} },
        ],
        ['Genni', 'Shyla'],
      );

      const oscuridad = entries.find((e) => e.entityId === 'c2')!;
      expect(oscuridad.mentions).toBe(4);
      expect(oscuridad.firstSeenRef).toBeNull();

      // Nameless links are dropped; legacy "Shyla" dedupes against the linked Shyla.
      expect(entries.find((e) => e.entityId === 'c-noname')).toBeUndefined();
      const genni = entries.find((e) => e.name === 'Genni')!;
      expect(genni.entityId).toBeNull();
      expect(entries.filter((e) => e.name === 'Shyla')).toHaveLength(1);
    });

    it('ignores malformed mention metadata', () => {
      const entries = deriveRosterEntries(
        [
          {
            id: 'm1',
            role: 'user',
            content: 'x',
            created_at: '2026-07-10T00:00:00Z',
            metadata: { mentionedEntities: [{ name: '' }, { bogus: true }, null, 42] as never },
          },
        ],
        1,
      );
      expect(entries).toEqual([]);
    });
  });

  describe('applyRosterOverrides + activeRoster', () => {
    const base = () =>
      deriveRosterEntries(
        [
          msg('m1', 1, 0, [
            { id: 'j1', name: 'Tío Juan', type: 'character' },
            { id: 'j2', name: 'Juan (work)', type: 'character' },
          ]),
        ],
        7,
      );

    it('user exclusion removes an entry from the active cast but keeps it visible', () => {
      const entries = applyRosterOverrides(base(), { j2: { status: 'excluded' } });
      const excluded = entries.find((e) => e.entityId === 'j2')!;
      expect(excluded.status).toBe('excluded');
      expect(excluded.source).toBe('user');
      expect(activeRoster(entries).map((e) => e.entityId)).toEqual(['j1']);
    });

    it('pinned entries sort first and role overrides stick', () => {
      const entries = applyRosterOverrides(base(), {
        j2: { pinned: true, role: 'main' },
      });
      expect(entries[0].entityId).toBe('j2');
      expect(entries[0].role).toBe('main');
    });

    it('name-only entries are addressable by name key', () => {
      const derived = deriveRosterEntries([], 1, [], ['Genni']);
      const key = rosterKey(derived[0]);
      expect(key).toBe('name:genni');
      const entries = applyRosterOverrides(derived, { [key]: { status: 'excluded' } });
      expect(entries[0].status).toBe('excluded');
    });
  });

  describe('rosterRole', () => {
    it('is deterministic on mention share', () => {
      expect(rosterRole(6, 6)).toBe('main');
      expect(rosterRole(3, 6)).toBe('main');
      expect(rosterRole(2, 6)).toBe('supporting');
      expect(rosterRole(1, 6)).toBe('mentioned');
      expect(rosterRole(1, 1)).toBe('mentioned');
    });
  });
});
