import { describe, expect, it } from 'vitest';
import {
  composeKinshipViaYou,
  inverseSurfaceRelationshipType,
  relationshipTypeForViewer,
  resolveRelatedPersonType,
} from './relatedPersonType';

describe('relationshipTypeForViewer', () => {
  it('keeps editor rows as-is on the card that set them', () => {
    expect(relationshipTypeForViewer('grandson', true)).toBe('grandson');
    expect(relationshipTypeForViewer('uncle', true)).toBe('uncle');
  });

  it('inverts editor rows on the other person\'s card', () => {
    expect(relationshipTypeForViewer('grandson', false)).toBe('grandparent');
    expect(relationshipTypeForViewer('uncle', false)).toBe('nephew');
    expect(relationshipTypeForViewer('grandmother', false)).toBe('grandchild');
  });

  it('inverts graph edges so source-is-kin does not leak onto the kin\'s card', () => {
    expect(relationshipTypeForViewer('uncle_of', false)).toBe('uncle');
    expect(relationshipTypeForViewer('uncle_of', true)).toBe('nephew');
    expect(relationshipTypeForViewer('grandchild_of', false)).toBe('grandchild');
    expect(relationshipTypeForViewer('grandchild_of', true)).toBe('grandparent');
  });
});

describe('resolveRelatedPersonType', () => {
  it('uses inverted relationship-to-you when the other person is the account owner', () => {
    expect(
      resolveRelatedPersonType({
        storedType: 'friend',
        viewerIsSource: true,
        otherIsSelf: true,
        viewerRelationshipToYou: 'grandmother',
      }),
    ).toBe('grandchild');
  });

  it('uses the other person\'s relationship-to-you on the owner\'s card', () => {
    expect(
      resolveRelatedPersonType({
        storedType: 'family',
        viewerIsSource: false,
        viewerIsSelf: true,
        otherRelationshipToYou: 'uncle',
      }),
    ).toBe('uncle');
  });

  it('reads leading kinship titles only from the owner\'s point of view', () => {
    expect(
      resolveRelatedPersonType({
        storedType: 'friend',
        viewerIsSource: true,
        viewerIsSelf: true,
        otherName: 'Tío Ralph',
      }),
    ).toBe('uncle');
    expect(
      resolveRelatedPersonType({
        storedType: 'child',
        viewerIsSource: true,
        viewerIsSelf: false,
        otherName: 'Tío Ralph',
      }),
    ).toBe('child');
  });

  it('composes two relationship-to-you labels into the other person\'s role on this card', () => {
    expect(
      resolveRelatedPersonType({
        storedType: 'friend',
        viewerIsSource: true,
        viewerIsSelf: false,
        viewerRelationshipToYou: 'grandmother',
        otherRelationshipToYou: 'aunt',
        otherName: 'Tía Maya',
      }),
    ).toBe('child');
    expect(
      resolveRelatedPersonType({
        storedType: 'family',
        viewerIsSource: false,
        viewerRelationshipToYou: 'aunt',
        otherRelationshipToYou: 'grandmother',
      }),
    ).toBe('parent');
  });
});

describe('inverseSurfaceRelationshipType', () => {
  it('maps grandmother to grandchild', () => {
    expect(inverseSurfaceRelationshipType('grandmother')).toBe('grandchild');
    expect(inverseSurfaceRelationshipType('friend')).toBe('friend');
  });
});

describe('composeKinshipViaYou', () => {
  it('maps grandmother + aunt to child and mother + sibling to child', () => {
    expect(composeKinshipViaYou('grandmother', 'aunt')).toBe('child');
    expect(composeKinshipViaYou('grandmother', 'uncle')).toBe('child');
    expect(composeKinshipViaYou('mother', 'sibling')).toBe('child');
    expect(composeKinshipViaYou('aunt', 'grandmother')).toBe('parent');
    expect(composeKinshipViaYou('friend', 'aunt')).toBeNull();
  });
});
