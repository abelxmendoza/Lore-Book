import { describe, it, expect } from 'vitest';
import {
  getTargetTable,
  toStorageEntityType,
  toErEntityType,
  validateEntity,
  validateRelationship,
  getResolvablePairs,
  hasAnyDirectEdgePossible,
  EntityTypeSet,
  RelationshipTypeEnum,
  ASSERTED_THRESHOLD,
  EPISODIC_THRESHOLD,
  type ExtractedEntity,
  type ExtractedRelationship,
  type ResolvedEntity,
} from './erSchema';

describe('erSchema', () => {
  describe('getTargetTable', () => {
    it('returns character_relationships for PERSON,PERSON FRIEND_OF ASSERTED', () => {
      expect(getTargetTable('PERSON', 'PERSON', 'FRIEND_OF', 'ASSERTED')).toBe('character_relationships');
    });

    it('returns entity_relationships for PERSON,ORG WORKS_FOR ASSERTED', () => {
      expect(getTargetTable('PERSON', 'ORG', 'WORKS_FOR', 'ASSERTED')).toBe('entity_relationships');
    });

    it('returns event_mentions for PERSON,EVENT PARTICIPATED_IN EPISODIC', () => {
      expect(getTargetTable('PERSON', 'EVENT', 'PARTICIPATED_IN', 'EPISODIC')).toBe('event_mentions');
    });

    it('returns location_mentions for EVENT,LOCATION PRESENT_AT EPISODIC', () => {
      expect(getTargetTable('EVENT', 'LOCATION', 'PRESENT_AT', 'EPISODIC')).toBe('location_mentions');
    });

    it('returns character_memories for PERSON,EVENT MENTIONED_IN EPISODIC', () => {
      expect(getTargetTable('PERSON', 'EVENT', 'MENTIONED_IN', 'EPISODIC')).toBe('character_memories');
    });

    it('returns null for disallowed combo', () => {
      expect(getTargetTable('LOCATION', 'LOCATION', 'FRIEND_OF', 'ASSERTED')).toBeNull();
    });

    it('returns null for EVENT,EVENT FRIEND_OF', () => {
      expect(getTargetTable('EVENT', 'EVENT', 'FRIEND_OF', 'ASSERTED')).toBeNull();
    });
  });

  describe('toStorageEntityType', () => {
    it('maps PERSON and CHARACTER to character', () => {
      expect(toStorageEntityType('PERSON')).toBe('character');
      expect(toStorageEntityType('CHARACTER')).toBe('character');
    });

    it('maps LOCATION, ORG, EVENT, CONCEPT to omega_entity', () => {
      expect(toStorageEntityType('LOCATION')).toBe('omega_entity');
      expect(toStorageEntityType('ORG')).toBe('omega_entity');
      expect(toStorageEntityType('EVENT')).toBe('omega_entity');
      expect(toStorageEntityType('CONCEPT')).toBe('omega_entity');
    });
  });

  describe('toErEntityType', () => {
    it('maps character to CHARACTER', () => {
      expect(toErEntityType('character')).toBe('CHARACTER');
    });
    it('maps omega_entity to CONCEPT', () => {
      expect(toErEntityType('omega_entity')).toBe('CONCEPT');
    });
    it('passes through PERSON, CHARACTER, LOCATION, ORG, EVENT', () => {
      expect(toErEntityType('PERSON')).toBe('PERSON');
      expect(toErEntityType('CHARACTER')).toBe('CHARACTER');
      expect(toErEntityType('LOCATION')).toBe('LOCATION');
      expect(toErEntityType('ORG')).toBe('ORG');
      expect(toErEntityType('EVENT')).toBe('EVENT');
    });
    it('maps unknown to CONCEPT', () => {
      expect(toErEntityType('unknown')).toBe('CONCEPT');
    });
  });

  describe('validateEntity', () => {
    it('accepts allowed EntityType', () => {
      expect(validateEntity({ tempId: '1', name: 'A', type: 'PERSON' })).toEqual({ ok: true });
      expect(validateEntity({ tempId: '1', name: 'B', type: 'EVENT' })).toEqual({ ok: true });
    });

    it('rejects invalid EntityType', () => {
      const r = validateEntity({ tempId: '1', name: 'X', type: 'INVALID' as any });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('INVALID_ENTITY_TYPE');
    });
  });

  describe('validateRelationship', () => {
    const resolved = new Map<string, ResolvedEntity>([
      ['a', { id: 'a', type: 'PERSON' }],
      ['b', { id: 'b', type: 'PERSON' }],
      ['c', { id: 'c', type: 'EVENT' }],
    ]);

    it('returns UNRESOLVED_ENTITY when from or to is missing', () => {
      const r1 = validateRelationship(
        { fromTempId: 'x', toTempId: 'b', relationship: 'FRIEND_OF', kind: 'ASSERTED', confidence: 0.8 },
        resolved
      );
      expect(r1.ok).toBe(false);
      if (!r1.ok) expect(r1.code).toBe('UNRESOLVED_ENTITY');

      const r2 = validateRelationship(
        { fromTempId: 'a', toTempId: 'y', relationship: 'FRIEND_OF', kind: 'ASSERTED', confidence: 0.8 },
        resolved
      );
      expect(r2.ok).toBe(false);
      if (!r2.ok) expect(r2.code).toBe('UNRESOLVED_ENTITY');
    });

    it('returns RELATION_NOT_ALLOWED_BY_ER when no rule', () => {
      const r = validateRelationship(
        { fromTempId: 'a', toTempId: 'c', relationship: 'FRIEND_OF', kind: 'ASSERTED', confidence: 0.8 },
        resolved
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('RELATION_NOT_ALLOWED_BY_ER');
    });

    it('returns INVALID_RELATIONSHIP_TYPE when relationship not in enum', () => {
      const r = validateRelationship(
        { fromTempId: 'a', toTempId: 'b', relationship: 'INVALID_TYPE' as any, kind: 'ASSERTED', confidence: 0.8 },
        resolved
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('INVALID_RELATIONSHIP_TYPE');
    });

    it('returns { ok: true, targetTable } for allowed PERSON,PERSON FRIEND_OF ASSERTED', () => {
      const r = validateRelationship(
        { fromTempId: 'a', toTempId: 'b', relationship: 'FRIEND_OF', kind: 'ASSERTED', confidence: 0.8 },
        resolved
      );
      expect(r.ok).toBe(true);
      if (r.ok && 'targetTable' in r) expect(r.targetTable).toBe('character_relationships');
    });
  });

  describe('getResolvablePairs', () => {
    it('returns unordered pairs with distinct ids', () => {
      const m = new Map<string, ResolvedEntity>([
        ['a', { id: 'a', type: 'PERSON' }],
        ['b', { id: 'b', type: 'PERSON' }],
        ['c', { id: 'c', type: 'ORG' }],
      ]);
      const pairs = getResolvablePairs(m);
      expect(pairs.length).toBe(3); // C(3,2)=3
      const ids = new Set(pairs.flatMap(([x, y]) => [x.id, y.id]));
      expect(ids).toEqual(new Set(['a', 'b', 'c']));
    });

    it('returns empty for 0 or 1 entity', () => {
      expect(getResolvablePairs(new Map())).toEqual([]);
      expect(getResolvablePairs(new Map([['a', { id: 'a', type: 'PERSON' }]]))).toEqual([]);
    });
  });

  describe('hasAnyDirectEdgePossible', () => {
    it('returns true when a pair has an allowed edge', () => {
      const pairs: [ResolvedEntity, ResolvedEntity][] = [
        [{ id: 'a', type: 'PERSON' }, { id: 'b', type: 'PERSON' }],
      ];
      expect(hasAnyDirectEdgePossible(pairs)).toBe(true);
    });

    it('returns false when no pair has an allowed edge', () => {
      const pairs: [ResolvedEntity, ResolvedEntity][] = [
        [{ id: 'a', type: 'LOCATION' }, { id: 'b', type: 'LOCATION' }],
      ];
      expect(hasAnyDirectEdgePossible(pairs)).toBe(false);
    });
  });

  describe('constants', () => {
    it('EntityTypeSet contains all 6 types', () => {
      expect(EntityTypeSet.size).toBe(6);
      ['PERSON', 'CHARACTER', 'LOCATION', 'ORG', 'EVENT', 'CONCEPT'].forEach(t =>
        expect(EntityTypeSet.has(t as any)).toBe(true)
      );
    });

    it('RelationshipTypeEnum includes Phase 1 types', () => {
      expect(RelationshipTypeEnum).toContain('FRIEND_OF');
      expect(RelationshipTypeEnum).toContain('WORKS_FOR');
      expect(RelationshipTypeEnum).toContain('PARTICIPATED_IN');
    });

    it('ASSERTED_THRESHOLD and EPISODIC_THRESHOLD are 0.7 and 0.5', () => {
      expect(ASSERTED_THRESHOLD).toBe(0.7);
      expect(EPISODIC_THRESHOLD).toBe(0.5);
    });
  });
});
