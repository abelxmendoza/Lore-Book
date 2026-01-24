/**
 * ER Schema — Single source of truth for Entity-Relationship–constrained NLP
 *
 * Blueprint: ER as contract, NLP as compiler, validation before write.
 * EntityType, RelationshipType, RelationshipKind, and DirectEdgeMatrix define
 * what is allowed; validateEntity/validateRelationship enforce before write.
 */

import { logger } from '../logger';

// --- 1.1 Types (Phase 1: blueprint core) ---

export type EntityType =
  | 'PERSON'
  | 'CHARACTER'
  | 'LOCATION'
  | 'ORG'
  | 'EVENT'
  | 'CONCEPT';

export type RelationshipKind = 'ASSERTED' | 'EPISODIC';

export type RelationshipType =
  | 'FRIEND_OF'
  | 'WORKS_FOR'
  | 'MENTOR_OF'
  | 'COACH_OF'
  | 'SPOUSE_OF'
  | 'ROMANTIC_INTEREST'
  | 'ACQUAINTANCE'
  | 'PRESENT_AT'
  | 'MENTIONED_IN'
  | 'CO_MENTIONED_WITH'
  | 'PARTICIPATED_IN'
  | 'INFLUENCED'
  | 'PRECEDED'
  | 'OVERLAPPED';

export type TargetTable =
  | 'character_relationships'
  | 'entity_relationships'
  | 'event_mentions'
  | 'location_mentions'
  | 'character_memories';

// --- 1.2 Storage mapping ---

export function toStorageEntityType(et: EntityType): 'character' | 'omega_entity' {
  if (et === 'PERSON' || et === 'CHARACTER') return 'character';
  return 'omega_entity';
}

/** Map storage type or omega entity type to ER EntityType for resolvedEntities. */
export function toErEntityType(t: string): EntityType {
  if (t === 'character') return 'CHARACTER';
  if (t === 'omega_entity') return 'CONCEPT';
  if (EntityTypeSet.has(t as EntityType)) return t as EntityType;
  return 'CONCEPT';
}

// --- 1.3 DirectEdgeRule and DirectEdgeMatrix ---

export type DirectEdgeRule = {
  from: EntityType;
  to: EntityType;
  relationship: RelationshipType;
  kind: RelationshipKind;
  targetTable: TargetTable;
};

const DIRECT_EDGE_MATRIX: DirectEdgeRule[] = [
  // PERSON/CHARACTER <-> PERSON/CHARACTER -> character_relationships
  { from: 'PERSON', to: 'PERSON', relationship: 'FRIEND_OF', kind: 'ASSERTED', targetTable: 'character_relationships' },
  { from: 'PERSON', to: 'PERSON', relationship: 'SPOUSE_OF', kind: 'ASSERTED', targetTable: 'character_relationships' },
  { from: 'PERSON', to: 'PERSON', relationship: 'ROMANTIC_INTEREST', kind: 'ASSERTED', targetTable: 'character_relationships' },
  { from: 'PERSON', to: 'PERSON', relationship: 'ACQUAINTANCE', kind: 'ASSERTED', targetTable: 'character_relationships' },
  { from: 'PERSON', to: 'CHARACTER', relationship: 'FRIEND_OF', kind: 'ASSERTED', targetTable: 'character_relationships' },
  { from: 'PERSON', to: 'CHARACTER', relationship: 'MENTOR_OF', kind: 'ASSERTED', targetTable: 'character_relationships' },
  { from: 'PERSON', to: 'CHARACTER', relationship: 'COACH_OF', kind: 'ASSERTED', targetTable: 'character_relationships' },
  { from: 'CHARACTER', to: 'PERSON', relationship: 'FRIEND_OF', kind: 'ASSERTED', targetTable: 'character_relationships' },
  { from: 'CHARACTER', to: 'PERSON', relationship: 'MENTOR_OF', kind: 'ASSERTED', targetTable: 'character_relationships' },
  { from: 'CHARACTER', to: 'PERSON', relationship: 'COACH_OF', kind: 'ASSERTED', targetTable: 'character_relationships' },
  { from: 'CHARACTER', to: 'CHARACTER', relationship: 'FRIEND_OF', kind: 'ASSERTED', targetTable: 'character_relationships' },
  { from: 'CHARACTER', to: 'CHARACTER', relationship: 'SPOUSE_OF', kind: 'ASSERTED', targetTable: 'character_relationships' },
  { from: 'CHARACTER', to: 'CHARACTER', relationship: 'ROMANTIC_INTEREST', kind: 'ASSERTED', targetTable: 'character_relationships' },
  { from: 'CHARACTER', to: 'CHARACTER', relationship: 'ACQUAINTANCE', kind: 'ASSERTED', targetTable: 'character_relationships' },
  { from: 'CHARACTER', to: 'CHARACTER', relationship: 'MENTOR_OF', kind: 'ASSERTED', targetTable: 'character_relationships' },
  { from: 'CHARACTER', to: 'CHARACTER', relationship: 'COACH_OF', kind: 'ASSERTED', targetTable: 'character_relationships' },
  // PERSON/CHARACTER -> ORG, etc. -> entity_relationships
  { from: 'PERSON', to: 'ORG', relationship: 'WORKS_FOR', kind: 'ASSERTED', targetTable: 'entity_relationships' },
  { from: 'CHARACTER', to: 'ORG', relationship: 'WORKS_FOR', kind: 'ASSERTED', targetTable: 'entity_relationships' },
  { from: 'PERSON', to: 'LOCATION', relationship: 'PRESENT_AT', kind: 'EPISODIC', targetTable: 'entity_relationships' },
  { from: 'CHARACTER', to: 'LOCATION', relationship: 'PRESENT_AT', kind: 'EPISODIC', targetTable: 'entity_relationships' },
  { from: 'PERSON', to: 'CONCEPT', relationship: 'INFLUENCED', kind: 'ASSERTED', targetTable: 'entity_relationships' },
  { from: 'CHARACTER', to: 'CONCEPT', relationship: 'INFLUENCED', kind: 'ASSERTED', targetTable: 'entity_relationships' },
  { from: 'EVENT', to: 'EVENT', relationship: 'PRECEDED', kind: 'EPISODIC', targetTable: 'entity_relationships' },
  { from: 'EVENT', to: 'EVENT', relationship: 'OVERLAPPED', kind: 'EPISODIC', targetTable: 'entity_relationships' },
  { from: 'PERSON', to: 'PERSON', relationship: 'CO_MENTIONED_WITH', kind: 'EPISODIC', targetTable: 'entity_relationships' },
  { from: 'CHARACTER', to: 'CHARACTER', relationship: 'CO_MENTIONED_WITH', kind: 'EPISODIC', targetTable: 'entity_relationships' },
  // Episodic mention-style -> event_mentions, location_mentions, character_memories (require memoryId in write)
  { from: 'PERSON', to: 'EVENT', relationship: 'PARTICIPATED_IN', kind: 'EPISODIC', targetTable: 'event_mentions' },
  { from: 'CHARACTER', to: 'EVENT', relationship: 'PARTICIPATED_IN', kind: 'EPISODIC', targetTable: 'event_mentions' },
  { from: 'EVENT', to: 'LOCATION', relationship: 'PRESENT_AT', kind: 'EPISODIC', targetTable: 'location_mentions' },
  { from: 'PERSON', to: 'EVENT', relationship: 'MENTIONED_IN', kind: 'EPISODIC', targetTable: 'character_memories' },
  { from: 'CHARACTER', to: 'EVENT', relationship: 'MENTIONED_IN', kind: 'EPISODIC', targetTable: 'character_memories' },
];

/** getTargetTable(from, to, rel, kind): targetTable | null. Returns null when no rule exists. */
export function getTargetTable(
  from: EntityType,
  to: EntityType,
  rel: RelationshipType,
  kind: RelationshipKind
): TargetTable | null {
  const rule = DIRECT_EDGE_MATRIX.find(
    r => r.from === from && r.to === to && r.relationship === rel && r.kind === kind
  );
  return rule ? rule.targetTable : null;
}

// --- 1.4 Constants ---

export const EntityTypeSet = new Set<EntityType>([
  'PERSON', 'CHARACTER', 'LOCATION', 'ORG', 'EVENT', 'CONCEPT',
]);

export const RelationshipTypeEnum: RelationshipType[] = [
  'FRIEND_OF', 'WORKS_FOR', 'MENTOR_OF', 'COACH_OF', 'SPOUSE_OF',
  'ROMANTIC_INTEREST', 'ACQUAINTANCE', 'PRESENT_AT', 'MENTIONED_IN',
  'CO_MENTIONED_WITH', 'PARTICIPATED_IN', 'INFLUENCED', 'PRECEDED', 'OVERLAPPED',
];

export const ASSERTED_THRESHOLD = 0.7;
export const EPISODIC_THRESHOLD = 0.5;

// --- 2. IR and ValidationResult ---

export type ExtractedEntity = { tempId: string; name: string; type: EntityType };

export type ExtractedRelationship = {
  fromTempId: string;
  toTempId: string;
  relationship: RelationshipType;
  kind: RelationshipKind;
  confidence: number;
};

export type ValidationResult =
  | { ok: true }
  | { ok: true; targetTable: TargetTable }
  | {
      ok: false;
      code: 'INVALID_ENTITY_TYPE' | 'UNRESOLVED_ENTITY' | 'RELATION_NOT_ALLOWED_BY_ER' | 'INVALID_RELATIONSHIP_TYPE';
    };

export function validateEntity(entity: ExtractedEntity): ValidationResult {
  if (!EntityTypeSet.has(entity.type)) {
    return { ok: false, code: 'INVALID_ENTITY_TYPE' };
  }
  return { ok: true };
}

export function validateRelationship(
  rel: ExtractedRelationship,
  resolvedEntities: Map<string, { id: string; type: EntityType }>
): ValidationResult {
  const fromEnt = resolvedEntities.get(rel.fromTempId);
  const toEnt = resolvedEntities.get(rel.toTempId);
  if (!fromEnt || !toEnt) {
    return { ok: false, code: 'UNRESOLVED_ENTITY' };
  }
  if (!RelationshipTypeEnum.includes(rel.relationship)) {
    return { ok: false, code: 'INVALID_RELATIONSHIP_TYPE' };
  }
  const t = getTargetTable(fromEnt.type, toEnt.type, rel.relationship, rel.kind);
  if (t == null) {
    return { ok: false, code: 'RELATION_NOT_ALLOWED_BY_ER' };
  }
  return { ok: true, targetTable: t };
}

// --- 3. JSON Schema for relationship extraction ---

export function getRelationshipExtractionJsonSchema(): object {
  return {
    type: 'object',
    additionalProperties: true, // allow scopes
    required: ['relationships'],
    properties: {
      relationships: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['from_entity', 'to_entity', 'relationship', 'kind', 'confidence'],
          properties: {
            from_entity: { type: 'string' },
            to_entity: { type: 'string' },
            relationship: { type: 'string', enum: RelationshipTypeEnum },
            kind: { type: 'string', enum: ['ASSERTED', 'EPISODIC'] },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            scope: { type: 'string' },
            evidence: { type: 'string' },
          },
        },
      },
      scopes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            entityName: { type: 'string' },
            scope: { type: 'string' },
            scopeContext: { type: 'string' },
            confidence: { type: 'number' },
            evidence: { type: 'string' },
          },
        },
      },
    },
  };
}

/** Phase 1: map each RelationshipType to ASSERTED or EPISODIC when LLM omits kind. */
export const relationshipTypeToKind: Record<RelationshipType, RelationshipKind> = {
  FRIEND_OF: 'ASSERTED',
  WORKS_FOR: 'ASSERTED',
  MENTOR_OF: 'ASSERTED',
  COACH_OF: 'ASSERTED',
  SPOUSE_OF: 'ASSERTED',
  ROMANTIC_INTEREST: 'ASSERTED',
  ACQUAINTANCE: 'ASSERTED',
  PRESENT_AT: 'EPISODIC',
  MENTIONED_IN: 'EPISODIC',
  CO_MENTIONED_WITH: 'EPISODIC',
  PARTICIPATED_IN: 'EPISODIC',
  INFLUENCED: 'ASSERTED',
  PRECEDED: 'EPISODIC',
  OVERLAPPED: 'EPISODIC',
};

// --- 5. ER-aware gating and helpers ---

export type ResolvedEntity = { id: string; type: EntityType };

/** All unordered pairs [from, to] with distinct ids. */
export function getResolvablePairs(
  resolvedMap: Map<string, ResolvedEntity>
): [ResolvedEntity, ResolvedEntity][] {
  const arr = Array.from(resolvedMap.entries());
  const pairs: [ResolvedEntity, ResolvedEntity][] = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[i][0] !== arr[j][0]) {
        pairs.push([arr[i][1], arr[j][1]]);
      }
    }
  }
  return pairs;
}

/** True if any (from,to) pair has at least one direct edge in the matrix. */
export function hasAnyDirectEdgePossible(
  pairs: [ResolvedEntity, ResolvedEntity][]
): boolean {
  for (const [from, to] of pairs) {
    for (const rel of RelationshipTypeEnum) {
      for (const kind of ['ASSERTED', 'EPISODIC'] as RelationshipKind[]) {
        const t = getTargetTable(from.type, to.type, rel, kind);
        if (t != null) return true;
      }
    }
  }
  return false;
}

export type ValidationFailureCode =
  | 'INVALID_ENTITY_TYPE'
  | 'UNRESOLVED_ENTITY'
  | 'RELATION_NOT_ALLOWED_BY_ER'
  | 'INVALID_RELATIONSHIP_TYPE';

export function logValidationFailure(code: ValidationFailureCode, rel: ExtractedRelationship): void {
  logger.debug(
    { code, from: rel.fromTempId, to: rel.toTempId, relationship: rel.relationship },
    'ER validation failure'
  );
}
