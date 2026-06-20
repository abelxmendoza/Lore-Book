/** Client types for LoreBook entity search API. */

export type EntitySearchType =
  | 'person'
  | 'organization'
  | 'place'
  | 'group'
  | 'community'
  | 'skill'
  | 'event';

export type EntitySearchResult = {
  entityId: string;
  entityType: EntitySearchType;
  displayName: string;
  aliases: string[];
  knownStatus: 'known' | 'suggestion';
  confidence: number;
  source: string;
  subtitle?: string;
  lastSeenAt?: string;
  matchKind?: 'exact' | 'alias' | 'fuzzy';
};

export type EntitySearchResponse = {
  results: EntitySearchResult[];
  query: string;
};

export const ENTITY_SEARCH_TYPE_LABELS: Record<EntitySearchType, string> = {
  person: 'People',
  organization: 'Organizations',
  place: 'Places',
  group: 'Groups',
  community: 'Communities',
  skill: 'Skills',
  event: 'Events',
};

export const ALL_ENTITY_SEARCH_TYPES: EntitySearchType[] = [
  'person',
  'organization',
  'place',
  'group',
  'community',
  'skill',
  'event',
];

export function previewTypeToSearchTypes(previewType: string): EntitySearchType[] {
  const map: Record<string, EntitySearchType[]> = {
    PERSON: ['person'],
    PLACE: ['place'],
    DEPLOYMENT_SITE: ['place'],
    ORGANIZATION: ['organization', 'group'],
    GROUP: ['group', 'organization', 'community'],
    COMMUNITY: ['community', 'group'],
    SKILL: ['skill'],
    EVENT: ['event', 'place'],
    ROLE: ['person', 'organization'],
  };
  return map[previewType] ?? ALL_ENTITY_SEARCH_TYPES;
}
