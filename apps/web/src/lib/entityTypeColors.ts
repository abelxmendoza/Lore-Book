import type { CertifiedEntity, CertifiedEntityType, CharacterVariant } from '../types/certifiedEntity';

/** User-facing entity buckets for composer chips and inline highlights. */
export type EntityVisualKind = 'character' | 'romantic' | 'location' | 'group' | 'skill' | 'event';

type ColorTriplet = { known: string; suggestion: string; draft: string };

/** Tailwind chip classes per visual kind and match status. */
export const ENTITY_CHIP_COLORS: Record<EntityVisualKind, ColorTriplet> = {
  character: {
    known: 'border-violet-500/40 bg-violet-500/10 text-violet-200/90',
    suggestion: 'border-violet-400/40 bg-violet-500/8 text-violet-200/85 border-dashed',
    draft: 'border-violet-400/30 bg-violet-500/6 text-violet-100/80 border-dashed',
  },
  romantic: {
    known: 'border-rose-500/45 bg-rose-500/12 text-rose-200/95',
    suggestion: 'border-rose-400/45 bg-rose-500/10 text-rose-200/90 border-dashed',
    draft: 'border-rose-400/35 bg-rose-500/8 text-rose-100/85 border-dashed',
  },
  location: {
    known: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200/90',
    suggestion: 'border-cyan-400/40 bg-cyan-500/8 text-cyan-200/85 border-dashed',
    draft: 'border-cyan-400/30 bg-cyan-500/6 text-cyan-100/80 border-dashed',
  },
  group: {
    known: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200/90',
    suggestion: 'border-emerald-400/40 bg-emerald-500/8 text-emerald-200/85 border-dashed',
    draft: 'border-emerald-400/30 bg-emerald-500/6 text-emerald-100/80 border-dashed',
  },
  skill: {
    known: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200/90',
    suggestion: 'border-indigo-400/40 bg-indigo-500/8 text-indigo-200/85 border-dashed',
    draft: 'border-indigo-400/30 bg-indigo-500/6 text-indigo-100/80 border-dashed',
  },
  event: {
    known: 'border-amber-500/40 bg-amber-500/10 text-amber-200/90',
    suggestion: 'border-amber-400/40 bg-amber-500/8 text-amber-200/85 border-dashed',
    draft: 'border-amber-400/30 bg-amber-500/6 text-amber-100/80 border-dashed',
  },
};

export const ENTITY_VISUAL_LABELS: Record<EntityVisualKind, string> = {
  character: 'character',
  romantic: 'romantic interest',
  location: 'place',
  group: 'group',
  skill: 'skill',
  event: 'event',
};

export function visualKindForEntity(
  entity: Pick<CertifiedEntity, 'type' | 'characterVariant'>
): EntityVisualKind {
  if (entity.type === 'character' && entity.characterVariant === 'romantic') return 'romantic';
  if (entity.type === 'organization') return 'group';
  return entity.type;
}

export function chipColorForEntity(
  entity: Pick<CertifiedEntity, 'type' | 'characterVariant' | 'status'>
): string {
  const palette = ENTITY_CHIP_COLORS[visualKindForEntity(entity)];
  if (entity.status === 'draft') return palette.draft;
  if (entity.status === 'suggestion') return palette.suggestion;
  return palette.known;
}

/** @deprecated Use chipColorForEntity — kept for simple type-only call sites. */
export function chipColorForType(
  type: CertifiedEntityType,
  status: 'confirmed' | 'suggestion' | 'draft' | undefined,
  characterVariant?: CharacterVariant
): string {
  return chipColorForEntity({ type, status, characterVariant });
}

export function highlightVisualClass(entity: Pick<CertifiedEntity, 'type' | 'characterVariant' | 'status'>): string {
  const status =
    entity.status === 'draft' ? 'draft' : entity.status === 'suggestion' ? 'suggestion' : 'known';
  return `entity-hl entity-hl-${status} entity-hl-${visualKindForEntity(entity)}`;
}

/** Inline pill badge classes for entity names in message prose. */
export const ENTITY_PILL_BASE =
  'inline-flex items-center rounded-full border px-1.5 py-px mx-0.5 text-[0.92em] font-semibold leading-snug align-baseline whitespace-nowrap';

export function pillClassForEntity(
  entity: Pick<CertifiedEntity, 'type' | 'characterVariant' | 'status'>
): string {
  return `${ENTITY_PILL_BASE} ${chipColorForEntity({
    ...entity,
    status: entity.status ?? 'confirmed',
  })}`;
}
