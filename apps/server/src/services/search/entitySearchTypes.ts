/** LoreBook entity search — correction popover link picker. */

export type EntitySearchType =
  | 'person'
  | 'organization'
  | 'place'
  | 'group'
  | 'community'
  | 'skill'
  | 'event';

export type EntitySearchKnownStatus = 'known' | 'suggestion';

export type EntitySearchMatchKind = 'exact' | 'alias' | 'fuzzy';

export type EntitySearchResult = {
  entityId: string;
  entityType: EntitySearchType;
  displayName: string;
  aliases: string[];
  knownStatus: EntitySearchKnownStatus;
  confidence: number;
  source: string;
  subtitle?: string;
  lastSeenAt?: string;
  matchKind?: EntitySearchMatchKind;
};

export type EntitySearchInput = {
  userId: string;
  query: string;
  types?: EntitySearchType[];
  limit?: number;
  /** Boost results compatible with this preview/lexical type */
  preferredPreviewType?: string;
};

export type EntitySearchResponse = {
  results: EntitySearchResult[];
  query: string;
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
