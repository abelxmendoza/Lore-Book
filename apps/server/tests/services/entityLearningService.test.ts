import { describe, expect, it } from 'vitest';

import {
  buildMergeLearningLessons,
  buildUserLearningContext,
} from '../../src/services/entityLearningService';
import type { IdentityMutationRow } from '../../src/services/identity/identityLedgerService';

describe('entityLearningService lesson builders', () => {
  it('builds alias and canonical-name lessons from a merge', () => {
    const lessons = buildMergeLearningLessons({
      domain: 'locations',
      sourceId: 'loc-anaheim',
      sourceName: 'Anaheim Family Home',
      sourceAliases: ['Abuelas House'],
      targetId: 'loc-abuela',
      targetName: "Abuela's house",
      canonicalName: "Abuela's House",
      aliases: ['Anaheim Family Home', "Abuela's house", 'Abuelas House'],
    });

    expect(lessons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lessonType: 'alias_equivalence',
          domain: 'locations',
          alias: 'Anaheim Family Home',
          canonicalEntityId: 'loc-abuela',
          canonicalName: "Abuela's House",
        }),
        expect.objectContaining({
          lessonType: 'canonical_name_preference',
          phrase: 'Anaheim Family Home',
          canonicalName: "Abuela's House",
        }),
        expect.objectContaining({
          lessonType: 'duplicate_pattern',
          phrase: 'Anaheim Family Home',
        }),
      ]),
    );
  });

  it('hydrates user learning context from identity mutation metadata', () => {
    const rows = [
      {
        id: 'mut-1',
        user_id: 'u1',
        entity_id: 'loc-abuela',
        entity_type: 'location',
        mutation_type: 'ALIAS_ADDED',
        previous_value: null,
        new_value: null,
        reason: null,
        confidence: null,
        source: 'USER',
        created_at: '2026-06-24T00:00:00.000Z',
        metadata: {
          learning_event: true,
          operation_type: 'merge',
          lessons: [
            {
              lessonType: 'alias_equivalence',
              domain: 'locations',
              alias: 'Anaheim Family Home',
              normalizedPhrase: 'anaheim family home',
              canonicalEntityId: 'loc-abuela',
              canonicalName: "Abuela's House",
            },
            {
              lessonType: 'suppression_rule',
              domain: 'locations',
              phrase: 'media',
              normalizedPhrase: 'media',
              strength: 5,
              reason: 'permanent_suggestion_suppression',
            },
          ],
        },
      },
    ] as IdentityMutationRow[];

    const context = buildUserLearningContext(rows);

    expect(context.aliasesByDomain.get('locations:anaheim family home')).toMatchObject({
      domain: 'locations',
      canonicalEntityId: 'loc-abuela',
      canonicalName: "Abuela's House",
      aliases: ['Anaheim Family Home'],
    });
    expect(context.suppressedByDomain.get('locations:media')).toEqual({
      strength: 5,
      reason: 'permanent_suggestion_suppression',
    });
  });
});
