import { describe, expect, it } from 'vitest';

import { mergeLocationsLocally } from './LocationMergePanel';
import type { LocationProfile } from './LocationProfileCard';

function location(id: string, name: string, visitCount: number): LocationProfile {
  return {
    id,
    name,
    type: 'venue',
    visitCount,
    lastVisited: null,
    memoryCount: 0,
    associatedCharacters: [],
    relatedLocations: [],
    metadata: {},
  };
}

describe('location merge demo behavior', () => {
  it('keeps the selected card and folds the other name into its aliases', () => {
    const merged = mergeLocationsLocally(
      [
        location('loc-short', 'Vanguard Recreation Center', 2),
        location('loc-long', 'Vanguard Recreation Center & Billiards', 3),
      ],
      'loc-short',
      ['loc-long'],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: 'loc-short',
      name: 'Vanguard Recreation Center',
      visitCount: 5,
      metadata: {
        aliases: ['Vanguard Recreation Center & Billiards'],
      },
    });
  });
});
