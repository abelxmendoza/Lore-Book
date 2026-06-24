import { describe, expect, it } from 'vitest';

import { buildMergedPlaceIdentity } from '../../src/services/locationMergeService';
import { reviewPlaceDuplicateCompatibility } from '../../src/services/ontology/placeIntelligence';
import { resolveExistingPlace } from '../../src/services/lexical/places';

describe('locationMergeService alias preservation', () => {
  it("preserves Anaheim Family Home as an alias when merged into Abuela's House", () => {
    const identity = buildMergedPlaceIdentity(
      {
        id: 'loc-anaheim',
        name: 'Anaheim Family Home',
        metadata: { aliases: ['Anaheim House'] },
      },
      {
        id: 'loc-abuela',
        name: "Abuela's house",
        metadata: { aliases: ['Abuelas House'] },
      },
    );

    expect(identity.canonicalName).toBe("Abuela's House");
    expect(identity.aliases).toEqual(
      expect.arrayContaining(['Anaheim Family Home', 'Anaheim House', "Abuela's house", 'Abuelas House']),
    );
    expect(identity.mergeHistory[0]).toMatchObject({
      source_id: 'loc-anaheim',
      source_name: 'Anaheim Family Home',
      target_id: 'loc-abuela',
      target_name_before: "Abuela's house",
      canonical_name_after: "Abuela's House",
    });
  });

  it('allows residential/family-home place merges even when names differ', () => {
    expect(reviewPlaceDuplicateCompatibility('Anaheim Family Home', "Abuela's House")).toMatchObject({
      canMerge: true,
      requiresReview: true,
      relationship: 'possible_alias',
    });
  });

  it('resolves future Anaheim Family Home mentions to the Abuela survivor alias', () => {
    const resolved = resolveExistingPlace('Anaheim Family Home', 'private_residence', {
      existingPlaces: [
        {
          id: 'loc-abuela',
          displayName: "Abuela's House",
          aliases: ['Anaheim Family Home', "Abuela's house", 'Abuelas House'],
          placeType: 'private_residence',
        },
      ],
    });

    expect(resolved.exact).toMatchObject({
      id: 'loc-abuela',
      displayName: "Abuela's House",
    });
  });
});
