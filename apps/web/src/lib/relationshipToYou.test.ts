import { describe, expect, it } from 'vitest';

import {
  isKinshipShapedRelationshipToYou,
  relationshipToYouLabel,
  resolveRelationshipToYou,
  toRomanticRelationshipType,
} from './relationshipToYou';

describe('relationshipToYou', () => {
  it('prefers explicit metadata over You-link', () => {
    expect(
      resolveRelationshipToYou({
        metadata: { relationship_to_user: 'coworker', relationship_to_user_source: 'user_confirmed' },
        relationships: [{ character_name: 'You', relationship_type: 'friend' }],
      }),
    ).toEqual({ value: 'coworker', source: 'user_confirmed' });
  });

  it('falls back to You relationship from chat', () => {
    expect(
      resolveRelationshipToYou({
        metadata: {},
        relationships: [{ character_name: 'You', relationship_type: 'mentor', status: 'inferred' }],
      }),
    ).toEqual({ value: 'mentor', source: 'auto' });
  });

  it('normalizes kinship labels like Cousin / cousin_of onto option keys', () => {
    expect(
      resolveRelationshipToYou({
        metadata: { kinship_label: 'Cousin' },
      }),
    ).toEqual({ value: 'cousin', source: 'chat' });
    expect(
      resolveRelationshipToYou({
        metadata: {},
        relationships: [{ character_name: 'You', relationship_type: 'cousin_of', status: 'active' }],
      }),
    ).toEqual({ value: 'cousin', source: 'chat' });
  });

  it('labels known presets', () => {
    expect(relationshipToYouLabel('close_friend')).toBe('Close friend');
    expect(relationshipToYouLabel('step_parent')).toBe('Step-parent');
    expect(relationshipToYouLabel('grandson')).toBe('Grandson');
    expect(relationshipToYouLabel('situationship')).toBe('Seeing each other');
  });

  it('normalizes grandson and tío onto option keys', () => {
    expect(
      resolveRelationshipToYou({
        metadata: { kinship_label: 'Grandson' },
      }),
    ).toEqual({ value: 'grandson', source: 'chat' });
    expect(
      resolveRelationshipToYou({
        metadata: {},
        relationships: [{ character_name: 'You', relationship_type: 'tío', status: 'active' }],
      }),
    ).toEqual({ value: 'uncle', source: 'chat' });
  });

  it('falls back to romanticType when neither metadata nor a You-link is set', () => {
    expect(
      resolveRelationshipToYou({
        metadata: {},
        relationships: [],
        romanticType: 'girlfriend',
      }),
    ).toEqual({ value: 'girlfriend', source: 'chat' });
  });

  it('romanticType fallback is lowest priority — metadata and You-link both win over it', () => {
    expect(
      resolveRelationshipToYou({
        metadata: { relationship_to_user: 'ex' },
        relationships: [],
        romanticType: 'girlfriend',
      }),
    ).toEqual({ value: 'ex', source: undefined });
    expect(
      resolveRelationshipToYou({
        metadata: {},
        relationships: [{ character_name: 'You', relationship_type: 'crush', status: 'active' }],
        romanticType: 'girlfriend',
      }),
    ).toEqual({ value: 'crush', source: 'chat' });
  });
});

describe('toRomanticRelationshipType', () => {
  it('remaps "Relationship to you" values to the vocabulary the romantic book actually stores', () => {
    // Mirrors romanticTypeMap in apps/server/src/routes/relationships.ts — a
    // regression test for the bug where "Partner"/"Spouse"/"Ex" never matched
    // their synced romantic_relationships.relationship_type, so the
    // duplicate-card suppression never fired for exactly those three values.
    expect(toRomanticRelationshipType('partner')).toBe('dating');
    expect(toRomanticRelationshipType('spouse')).toBe('lover');
    expect(toRomanticRelationshipType('ex')).toBe('ex_lover');
  });

  it('leaves already-aligned values unchanged', () => {
    expect(toRomanticRelationshipType('girlfriend')).toBe('girlfriend');
    expect(toRomanticRelationshipType('dating')).toBe('dating');
    expect(toRomanticRelationshipType('crush')).toBe('crush');
  });

  it('is case/whitespace tolerant like the rest of this module', () => {
    expect(toRomanticRelationshipType('Spouse')).toBe('lover');
    expect(toRomanticRelationshipType(' Ex ')).toBe('ex_lover');
  });
});

describe('isKinshipShapedRelationshipToYou', () => {
  it('recognizes kinship-family values', () => {
    for (const v of ['family', 'uncle', 'aunt', 'cousin', 'grandmother', 'niece', 'sibling']) {
      expect(isKinshipShapedRelationshipToYou(v)).toBe(true);
    }
  });

  it('does not treat social/romantic values as kinship-shaped', () => {
    for (const v of ['friend', 'coworker', 'partner', 'mentor', 'rival']) {
      expect(isKinshipShapedRelationshipToYou(v)).toBe(false);
    }
  });
});
