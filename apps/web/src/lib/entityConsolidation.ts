import type { EntityType } from '../api/entityResolution';

export type ConsolidationMode = 'merge' | 'nested' | 'link' | 'alias';

export type AuthorityDecision = 'MERGE' | 'ALIAS' | 'PARENT_CHILD' | 'LINK';

export type ConsolidationEntityRef = {
  id: string;
  name: string;
  type: EntityType;
  aliases?: string[];
};

const NESTABLE_TYPES = new Set<EntityType>(['ORG', 'LOCATION', 'ENTITY']);

export function consolidationModeToDecision(mode: ConsolidationMode): AuthorityDecision {
  switch (mode) {
    case 'merge':
      return 'MERGE';
    case 'nested':
      return 'PARENT_CHILD';
    case 'link':
      return 'LINK';
    case 'alias':
      return 'ALIAS';
  }
}

export function getAvailableConsolidationModes(
  aType: EntityType,
  bType: EntityType,
): ConsolidationMode[] {
  if (aType !== bType) {
    return ['link'];
  }

  const modes: ConsolidationMode[] = ['merge'];

  if (NESTABLE_TYPES.has(aType)) {
    modes.push('nested');
  }

  if (aType === 'CHARACTER' || aType === 'PERSON' || aType === 'ORG' || aType === 'LOCATION') {
    modes.push('alias');
  }

  modes.push('link');
  return modes;
}

export function entityTypeToAuthorityKind(type: EntityType): string {
  switch (type) {
    case 'CHARACTER':
    case 'PERSON':
      return 'PERSON';
    case 'LOCATION':
      return 'LOCATION';
    case 'ORG':
      return 'ORGANIZATION';
    case 'ENTITY':
      return 'PROJECT';
    case 'CONCEPT':
      return 'UNKNOWN';
    default:
      return 'UNKNOWN';
  }
}

export function consolidationModeLabel(mode: ConsolidationMode): string {
  switch (mode) {
    case 'merge':
      return 'Same entity — combine into one';
    case 'nested':
      return 'Nested subgroup — keep both, nest one inside the other';
    case 'link':
      return 'Related — link but keep separate';
    case 'alias':
      return 'Alias — same thing, different surface name';
  }
}

export function consolidationModeDescription(mode: ConsolidationMode): string {
  switch (mode) {
    case 'merge':
      return 'One card survives. References, aliases, and memories move to the keeper.';
    case 'nested':
      return 'Both stay visible. The child group or place nests under the parent container.';
    case 'link':
      return 'No merging. LoreBook records that they are related without collapsing them.';
    case 'alias':
      return 'The other name becomes an alias on the canonical card — no duplicate card removed.';
  }
}

export function defaultConsolidationMode(
  aType: EntityType,
  bType: EntityType,
): ConsolidationMode {
  const modes = getAvailableConsolidationModes(aType, bType);
  return modes[0] ?? 'link';
}
