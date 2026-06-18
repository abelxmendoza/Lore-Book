/**
 * Canonical relationship vocabulary — bridges glossary hints, lexical roles,
 * unified extraction scopes, and persisted edge types.
 */
import type { RelationshipHint } from '../glossary';
import type { RelationshipRole } from '../../lexical/lexicalTypes';
import type {
  CanonicalRelationshipType,
  RelationshipScope,
} from '../../ingestion/types/unifiedExtraction';

export type { CanonicalRelationshipType, RelationshipScope };

/** Glossary relationship hints → unified extraction scope. */
export const HINT_TO_SCOPE: Record<RelationshipHint, RelationshipScope> = {
  FAMILY_RELATIONSHIP: 'FAMILY',
  SOCIAL_RELATIONSHIP: 'SOCIAL',
  ROMANTIC_RELATIONSHIP: 'ROMANTIC',
  WORK_RELATIONSHIP: 'PROFESSIONAL',
  MENTOR_RELATIONSHIP: 'PROFESSIONAL',
  ADVERSARIAL_RELATIONSHIP: 'ADVERSARIAL',
  CREATIVE_RELATIONSHIP: 'SOCIAL',
};

/** Lexical roles → canonical edge type for persistence. */
export const ROLE_TO_CANONICAL: Partial<Record<RelationshipRole, CanonicalRelationshipType>> = {
  mother: 'LIVES_WITH',
  father: 'LIVES_WITH',
  estranged_father: 'LIVES_WITH',
  estranged_mother: 'LIVES_WITH',
  uncle: 'CO_MENTIONED_WITH',
  aunt: 'CO_MENTIONED_WITH',
  grandmother: 'CO_MENTIONED_WITH',
  grandfather: 'CO_MENTIONED_WITH',
  sibling: 'CO_MENTIONED_WITH',
  cousin: 'CO_MENTIONED_WITH',
  friend: 'FRIEND_OF',
  close_friend: 'FRIEND_OF',
  ally: 'FRIEND_OF',
  romantic_partner: 'SPOUSE_OF',
  ex_partner: 'BROKE_UP_WITH',
  coworker: 'WORKS_FOR',
  boss: 'WORKS_FOR',
  mentor: 'MENTOR_OF',
  student: 'MENTORED_BY',
  rival: 'ENEMY_OF',
  acquaintance: 'ACQUAINTANCE',
  coach: 'COACH_OF',
  teammate: 'CO_MENTIONED_WITH',
  promoter: 'CO_MENTIONED_WITH',
  vendor: 'CO_MENTIONED_WITH',
  community_member: 'ACQUAINTANCE',
};

/** Lexical roles → glossary hint (for grouping). */
const ROLE_HINT_MAP: Partial<Record<RelationshipRole, RelationshipHint>> = {
  mother: 'FAMILY_RELATIONSHIP',
  father: 'FAMILY_RELATIONSHIP',
  estranged_father: 'FAMILY_RELATIONSHIP',
  estranged_mother: 'FAMILY_RELATIONSHIP',
  uncle: 'FAMILY_RELATIONSHIP',
  aunt: 'FAMILY_RELATIONSHIP',
  grandmother: 'FAMILY_RELATIONSHIP',
  grandfather: 'FAMILY_RELATIONSHIP',
  sibling: 'FAMILY_RELATIONSHIP',
  cousin: 'FAMILY_RELATIONSHIP',
  friend: 'SOCIAL_RELATIONSHIP',
  close_friend: 'SOCIAL_RELATIONSHIP',
  ally: 'SOCIAL_RELATIONSHIP',
  romantic_partner: 'ROMANTIC_RELATIONSHIP',
  ex_partner: 'ROMANTIC_RELATIONSHIP',
  coworker: 'WORK_RELATIONSHIP',
  boss: 'WORK_RELATIONSHIP',
  mentor: 'MENTOR_RELATIONSHIP',
  student: 'MENTOR_RELATIONSHIP',
  rival: 'ADVERSARIAL_RELATIONSHIP',
  acquaintance: 'SOCIAL_RELATIONSHIP',
  coach: 'MENTOR_RELATIONSHIP',
  teammate: 'SOCIAL_RELATIONSHIP',
  promoter: 'CREATIVE_RELATIONSHIP',
  vendor: 'WORK_RELATIONSHIP',
  community_member: 'SOCIAL_RELATIONSHIP',
};

export function roleToRelationshipHint(role: RelationshipRole): RelationshipHint | undefined {
  return ROLE_HINT_MAP[role];
}

export function hintToScope(hint: RelationshipHint): RelationshipScope {
  return HINT_TO_SCOPE[hint];
}

export function roleToScope(role: RelationshipRole): RelationshipScope {
  const hint = roleToRelationshipHint(role);
  return hint ? hintToScope(hint) : 'SOCIAL';
}

export function roleToCanonicalType(role: RelationshipRole): CanonicalRelationshipType {
  return ROLE_TO_CANONICAL[role] ?? 'CO_MENTIONED_WITH';
}

export function hintToDefaultRole(hint: RelationshipHint): RelationshipRole {
  switch (hint) {
    case 'FAMILY_RELATIONSHIP': return 'cousin';
    case 'WORK_RELATIONSHIP': return 'coworker';
    case 'ROMANTIC_RELATIONSHIP': return 'romantic_partner';
    case 'ADVERSARIAL_RELATIONSHIP': return 'rival';
    case 'MENTOR_RELATIONSHIP': return 'mentor';
    case 'CREATIVE_RELATIONSHIP': return 'promoter';
    case 'SOCIAL_RELATIONSHIP':
    default:
      return 'friend';
  }
}

/** Entity-facing relationship knowledge stored on metadata. */
export interface EntityRelationshipKnowledge {
  roles: RelationshipRole[];
  scopes: RelationshipScope[];
  hints: RelationshipHint[];
  linkedEntities: Array<{
    name: string;
    relationshipType: CanonicalRelationshipType;
    scope: RelationshipScope;
    role?: RelationshipRole;
    confidence: number;
  }>;
  coMentionGroups: string[][];
}

/** Message-level cluster of related inputs. */
export interface RelationshipInputGroup {
  scope: RelationshipScope;
  hint: RelationshipHint;
  entityNames: string[];
  roles: RelationshipRole[];
  cues: string[];
  confidence: number;
}

export interface DiscoveredEntityLink {
  subject: string;
  object: string;
  relationshipType: CanonicalRelationshipType;
  scope: RelationshipScope;
  role?: RelationshipRole;
  hint?: RelationshipHint;
  cue: string;
  confidence: number;
}
