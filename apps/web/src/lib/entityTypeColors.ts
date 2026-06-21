import type { CertifiedEntity, CertifiedEntityType, CharacterVariant } from '../types/certifiedEntity';
import {
  getLoreEntity,
  loreKindForChip,
  loreEntityChipTriplet,
  type LoreEntityKind,
} from './loreEntities';

/** User-facing entity buckets for composer chips and inline highlights. */
export type EntityVisualKind =
  | 'character'
  | 'romantic'
  | 'location'
  | 'group'
  | 'organization'
  | 'skill'
  | 'event'
  | 'project';

type ColorTriplet = { known: string; suggestion: string; draft: string };

/** Map visual bucket → lore kind (palette SSOT lives in loreEntities). */
const VISUAL_TO_LORE: Record<EntityVisualKind, LoreEntityKind> = {
  character: 'person',
  romantic: 'relationship',
  location: 'place',
  group: 'group',
  organization: 'organization',
  skill: 'skill',
  event: 'event',
  project: 'project',
};

/** Tailwind chip classes per visual kind — derived from MAIN_LORE_ENTITIES. */
export const ENTITY_CHIP_COLORS: Record<EntityVisualKind, ColorTriplet> = {
  character: loreEntityChipTriplet('person'),
  romantic: loreEntityChipTriplet('relationship'),
  location: loreEntityChipTriplet('place'),
  group: loreEntityChipTriplet('group'),
  organization: loreEntityChipTriplet('organization'),
  skill: loreEntityChipTriplet('skill'),
  event: loreEntityChipTriplet('event'),
  project: loreEntityChipTriplet('project'),
};

export const ENTITY_VISUAL_LABELS: Record<EntityVisualKind, string> = {
  character: getLoreEntity('person').label.toLowerCase(),
  romantic: 'romantic interest',
  location: getLoreEntity('place').label.toLowerCase(),
  group: getLoreEntity('group').label.toLowerCase(),
  organization: getLoreEntity('organization').shortLabel.toLowerCase(),
  skill: getLoreEntity('skill').label.toLowerCase(),
  event: getLoreEntity('event').label.toLowerCase(),
  project: getLoreEntity('project').label.toLowerCase(),
};

export function visualKindForEntity(
  entity: Pick<CertifiedEntity, 'type' | 'characterVariant'>,
): EntityVisualKind {
  if (entity.type === 'character' && entity.characterVariant === 'romantic') return 'romantic';
  if (entity.type === 'organization') return 'organization';
  if (entity.type === 'event') return 'event';
  return entity.type as EntityVisualKind;
}

export function loreKindForVisual(visual: EntityVisualKind): LoreEntityKind {
  return VISUAL_TO_LORE[visual];
}

export function chipColorForEntity(
  entity: Pick<CertifiedEntity, 'type' | 'characterVariant' | 'status'> & {
    loreKind?: LoreEntityKind;
  },
): string {
  const kind = loreKindForChip(entity);
  const triplet = loreEntityChipTriplet(kind);
  if (entity.status === 'draft') return triplet.draft;
  if (entity.status === 'suggestion') return triplet.suggestion;
  return triplet.known;
}

/** @deprecated Use chipColorForEntity — kept for simple type-only call sites. */
export function chipColorForType(
  type: CertifiedEntityType,
  status: 'confirmed' | 'suggestion' | 'draft' | undefined,
  characterVariant?: CharacterVariant,
): string {
  return chipColorForEntity({ type, status, characterVariant });
}

export function highlightVisualClass(
  entity: Pick<CertifiedEntity, 'type' | 'characterVariant' | 'status'> & { loreKind?: LoreEntityKind },
): string {
  const status =
    entity.status === 'draft' ? 'draft' : entity.status === 'suggestion' ? 'suggestion' : 'known';
  return `entity-hl entity-hl-${status} entity-hl-${visualKindForEntity(entity)}`;
}

/** Inline pill badge classes for entity names in message prose. */
export const ENTITY_PILL_BASE =
  'inline-flex items-center rounded-full border px-1.5 py-px mx-0.5 text-[0.92em] font-semibold leading-snug align-baseline whitespace-nowrap';

export function pillClassForEntity(
  entity: Pick<CertifiedEntity, 'type' | 'characterVariant' | 'status'> & { loreKind?: LoreEntityKind },
): string {
  return `${ENTITY_PILL_BASE} ${chipColorForEntity({
    ...entity,
    status: entity.status ?? 'confirmed',
  })}`;
}

/** Inline composer mark — same palette as chips above the text box. */
export function inlineMarkClassForEntity(
  entity: Pick<CertifiedEntity, 'type' | 'characterVariant' | 'status'> & { loreKind?: LoreEntityKind },
): string {
  return `rounded-[0.2rem] px-0.5 ${chipColorForEntity(entity)}`;
}
