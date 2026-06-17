/**
 * Lexical → ontology bridge — explicit many-to-one mappings from signal types
 * to canonical roots and glossary hints.
 */
import type { LexicalEntityType, PlaceCategory, RelationshipRole } from '../../lexical/lexicalTypes';
import type { RelationshipHint } from '../glossary';
import type { RootType } from './rootType';
import { lexicalEntityTypeToRootType } from './mappers';

export interface OntologyBridgeResult {
  rootType: RootType;
  category?: string;
  subcategory?: string;
  relationshipHint?: RelationshipHint;
}

const PLACE_CATEGORY_PATH: Record<PlaceCategory, { category: string; subcategory: string }> = {
  restaurant: { category: 'VENUE', subcategory: 'RESTAURANT' },
  bar: { category: 'VENUE', subcategory: 'BAR' },
  night_club: { category: 'VENUE', subcategory: 'NIGHTCLUB' },
  music_venue: { category: 'VENUE', subcategory: 'MUSIC_VENUE' },
  gym: { category: 'VENUE', subcategory: 'GYM' },
  dojo: { category: 'VENUE', subcategory: 'GYM' },
  school: { category: 'VENUE', subcategory: 'SCHOOL' },
  workplace: { category: 'VENUE', subcategory: 'WORKPLACE' },
  home: { category: 'DWELLING', subcategory: 'RESIDENCE' },
  city: { category: 'GEOGRAPHIC', subcategory: 'CITY' },
  neighborhood: { category: 'GEOGRAPHIC', subcategory: 'NEIGHBORHOOD' },
  landmark: { category: 'LANDMARK', subcategory: 'LANDMARK' },
  event_space: { category: 'VENUE', subcategory: 'EVENT_SPACE' },
  other: { category: 'VENUE', subcategory: 'OTHER' },
};

const RELATIONSHIP_ROLE_HINT: Partial<Record<RelationshipRole, RelationshipHint>> = {
  mother: 'FAMILY_RELATIONSHIP',
  father: 'FAMILY_RELATIONSHIP',
  sibling: 'FAMILY_RELATIONSHIP',
  cousin: 'FAMILY_RELATIONSHIP',
  friend: 'SOCIAL_RELATIONSHIP',
  close_friend: 'SOCIAL_RELATIONSHIP',
  romantic_partner: 'ROMANTIC_RELATIONSHIP',
  ex_partner: 'ROMANTIC_RELATIONSHIP',
  coworker: 'WORK_RELATIONSHIP',
  boss: 'WORK_RELATIONSHIP',
  mentor: 'MENTOR_RELATIONSHIP',
  student: 'MENTOR_RELATIONSHIP',
  rival: 'ADVERSARIAL_RELATIONSHIP',
  acquaintance: 'SOCIAL_RELATIONSHIP',
  community_member: 'SOCIAL_RELATIONSHIP',
  promoter: 'CREATIVE_RELATIONSHIP',
  vendor: 'WORK_RELATIONSHIP',
  teammate: 'WORK_RELATIONSHIP',
  coach: 'MENTOR_RELATIONSHIP',
};

/** Map glossary domain + category to lexical entity type (signal layer). */
export function mapDomainToLexicalEntityType(domain: string, category: string): LexicalEntityType {
  if (category === 'FAMILY' || domain === 'PERSON') return 'PERSON';
  if (domain === 'LOCATION') return 'PLACE';
  if (domain === 'EVENT') return 'EVENT';
  if (domain === 'TIME') return 'TIME';
  if (domain === 'PROJECT' || category === 'INITIATIVE') return 'PROJECT';
  if (domain === 'ORGANIZATION' || category === 'COMPANY' || domain === 'GROUP') return 'ORGANIZATION';
  if (domain === 'SKILL') return 'SKILL';
  if (domain === 'GOAL') return 'GOAL';
  if (domain === 'MEDIA') return 'MEDIA';
  if (domain === 'PRODUCT') return 'OBJECT';
  if (domain === 'APP') return 'OBJECT';
  if (domain === 'BRAND') return 'ORGANIZATION';
  if (domain === 'FOODDRINK') return 'OBJECT';
  if (domain === 'CONCEPT') return 'CONCEPT';
  if (domain === 'PET') return 'OBJECT';
  if (domain === 'VEHICLE') return 'OBJECT';
  // Never default to PERSON — unknown domains are unresolved signals.
  return 'OBJECT';
}

/** Map glossary domain + category to canonical root. */
export function mapDomainToRootType(domain: string, category: string): RootType {
  const lexical = mapDomainToLexicalEntityType(domain, category);
  return lexicalEntityTypeToRootType(lexical);
}

/** Full bridge from glossary scan hit to ontology path. */
export function bridgeGlossaryHit(
  domain: string,
  category: string,
  subcategory?: string,
  relationshipHint?: RelationshipHint
): OntologyBridgeResult {
  return {
    rootType: mapDomainToRootType(domain, category),
    category,
    subcategory,
    relationshipHint,
  };
}

export function bridgePlaceCategory(category: PlaceCategory): OntologyBridgeResult {
  const path = PLACE_CATEGORY_PATH[category];
  return {
    rootType: 'LOCATION',
    category: path.category,
    subcategory: path.subcategory,
  };
}

export function bridgeRelationshipRole(role: RelationshipRole): RelationshipHint | undefined {
  return RELATIONSHIP_ROLE_HINT[role];
}

/** Map lexical entity + optional subcategory to ontology bridge result. */
export function bridgeLexicalEntity(
  type: LexicalEntityType,
  subcategory?: string
): OntologyBridgeResult {
  const rootType = lexicalEntityTypeToRootType(type);
  if (type === 'PLACE' && subcategory) {
    const normalized = subcategory.toLowerCase().replace(/\s+/g, '_') as PlaceCategory;
    if (normalized in PLACE_CATEGORY_PATH) {
      return bridgePlaceCategory(normalized);
    }
  }
  return { rootType, subcategory };
}
