import { describe, it, expect } from 'vitest';

import { computeEntityGravity } from '../../../src/services/narrative/entityGravityService';
import type { EntityGravityInput } from '../../../src/services/narrative/narrativeAnchorTypes';

function baseInput(overrides: Partial<EntityGravityInput> = {}): EntityGravityInput {
  return {
    entityId: 'e1',
    entityType: 'character',
    name: 'Test',
    mentionCount: 1,
    threadCount: 1,
    daysMentioned: 1,
    emotionalWeight: 0.3,
    eventParticipation: 0.2,
    relationshipStrength: 0.3,
    communityMembership: 0.2,
    narrativeImportance: 0.3,
    ...overrides,
  };
}

describe('entityGravityService', () => {
  it('assigns high gravity to Bryan (best friend, bandmate, many mentions)', () => {
    const bryan = computeEntityGravity(
      baseInput({
        entityId: 'bryan',
        name: 'Bryan Oconner',
        mentionCount: 20,
        threadCount: 6,
        daysMentioned: 15,
        emotionalWeight: 0.8,
        relationshipStrength: 0.9,
        communityMembership: 0.7,
        narrativeImportance: 0.85,
        roles: ['schoolmate', 'best_friend', 'bandmate'],
      }),
    );

    const randomGuy = computeEntityGravity(
      baseInput({
        entityId: 'walmart',
        name: 'Random guy at Walmart',
        mentionCount: 1,
        threadCount: 0,
        daysMentioned: 1,
        emotionalWeight: 0.05,
        relationshipStrength: 0.05,
        communityMembership: 0,
        narrativeImportance: 0.05,
      }),
    );

    expect(bryan.gravityScore).toBeGreaterThan(0.8);
    expect(randomGuy.gravityScore).toBeLessThan(0.15);
    expect(bryan.gravityScore).toBeGreaterThan(randomGuy.gravityScore);
  });

  it('gravity score increases with repeated mentions', () => {
    const low = computeEntityGravity(baseInput({ mentionCount: 2 }));
    const mid = computeEntityGravity(baseInput({ mentionCount: 10 }));
    const high = computeEntityGravity(baseInput({ mentionCount: 25 }));

    expect(mid.gravityScore).toBeGreaterThan(low.gravityScore);
    expect(high.gravityScore).toBeGreaterThan(mid.gravityScore);
    expect(high.components.mentionCount).toBe(1);
  });
});
