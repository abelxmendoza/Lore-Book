import { describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import {
  bestDisplayName,
  survivorNameCollidesWithSource,
} from './characterMergeService';

const card = (name: string, extras: { first_name?: string; last_name?: string; alias?: string[] } = {}) => ({
  name,
  alias: extras.alias ?? null,
  first_name: extras.first_name ?? null,
  last_name: extras.last_name ?? null,
});

describe('character merge display names', () => {
  it('keeps a nickname and a full given name from colliding on UNIQUE(user_id, name)', () => {
    const jamie = card('Jamie');
    const initial = card('J');

    const keepJamie = bestDisplayName(initial, jamie, ['J']);
    expect(survivorNameCollidesWithSource(keepJamie, initial.name)).toBe(false);

    const keepInitial = bestDisplayName(jamie, initial, ['Jamie']);
    expect(survivorNameCollidesWithSource(keepInitial, jamie.name)).toBe(
      keepInitial.trim().toLowerCase() === 'jamie'
    );
    if (survivorNameCollidesWithSource(keepInitial, jamie.name)) {
      expect(keepInitial.toLowerCase()).toBe('jamie');
    } else {
      expect(keepInitial.toLowerCase()).not.toBe('jamie');
    }
  });

  it('detects when the survivor would reuse the absorbed card name', () => {
    expect(survivorNameCollidesWithSource('Jamie', 'Jamie')).toBe(true);
    expect(survivorNameCollidesWithSource('Jamie', 'jamie')).toBe(true);
    expect(survivorNameCollidesWithSource('Jamie / J', 'Jamie')).toBe(false);
    expect(survivorNameCollidesWithSource('Jamie', 'J')).toBe(false);
  });
});
