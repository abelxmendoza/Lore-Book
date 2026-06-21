/** Entity classification colors for composer lexical preview highlights. */

import { getLoreEntity, type LoreEntityKind } from './loreEntities';

function loreChip(kind: LoreEntityKind): string {
  return getLoreEntity(kind).chip;
}

export type EntityColorKey =
  | 'person'
  | 'place'
  | 'group'
  | 'time'
  | 'event'
  | 'language'
  | 'preference'
  | 'weather'
  | 'relationship'
  | 'interest'
  | 'emotional_significance'
  | 'organization'
  | 'role'
  | 'skill'
  | 'task'
  | 'work_activity'
  | 'worksite'
  | 'team'
  | 'project'
  | 'uncertain';

export type EntityClassificationType =
  | 'PERSON'
  | 'PLACE'
  | 'GROUP'
  | 'TIME_PERIOD'
  | 'EVENT'
  | 'LANGUAGE'
  | 'PREFERENCE'
  | 'WEATHER_CONTEXT'
  | 'RELATIONSHIP'
  | 'INTEREST'
  | 'EMOTIONAL_SIGNIFICANCE'
  | 'ORGANIZATION'
  | 'ROLE'
  | 'SKILL'
  | 'TASK'
  | 'WORK_ACTIVITY'
  | 'DEPLOYMENT_SITE'
  | 'TEAM'
  | 'PROJECT'
  | 'UNCERTAIN';

export const ENTITY_COLOR_MAP: Record<
  EntityColorKey,
  { highlight: string; chip: string; label: string }
> = {
  person: {
    highlight: 'entity-preview-hl-person',
    chip: loreChip('person'),
    label: getLoreEntity('person').label,
  },
  place: {
    highlight: 'entity-preview-hl-place',
    chip: loreChip('place'),
    label: getLoreEntity('place').label,
  },
  group: {
    highlight: 'entity-preview-hl-group',
    chip: loreChip('group'),
    label: getLoreEntity('group').label,
  },
  time: {
    highlight: 'entity-preview-hl-time',
    chip: 'border-amber-500/45 bg-amber-500/12 text-amber-200',
    label: 'Time',
  },
  event: {
    highlight: 'entity-preview-hl-event',
    chip: loreChip('event'),
    label: getLoreEntity('event').label,
  },
  language: {
    highlight: 'entity-preview-hl-language',
    chip: 'border-teal-500/45 bg-teal-500/12 text-teal-200',
    label: 'Language / Subject',
  },
  preference: {
    highlight: 'entity-preview-hl-preference',
    chip: 'border-pink-500/45 bg-pink-500/12 text-pink-200',
    label: 'Preference',
  },
  weather: {
    highlight: 'entity-preview-hl-weather',
    chip: 'border-slate-400/45 bg-slate-500/12 text-slate-200',
    label: 'Weather / Context',
  },
  relationship: {
    highlight: 'entity-preview-hl-relationship',
    chip: loreChip('relationship'),
    label: getLoreEntity('relationship').label,
  },
  interest: {
    highlight: 'entity-preview-hl-interest',
    chip: 'border-fuchsia-500/45 bg-fuchsia-500/12 text-fuchsia-200',
    label: 'Interest / Genre',
  },
  emotional_significance: {
    highlight: 'entity-preview-hl-emotional',
    chip: 'border-red-400/40 bg-red-500/10 text-red-200 border-dashed',
    label: 'Emotional significance',
  },
  organization: {
    highlight: 'entity-preview-hl-organization',
    chip: loreChip('organization'),
    label: getLoreEntity('organization').label,
  },
  role: {
    highlight: 'entity-preview-hl-role',
    chip: 'border-teal-500/45 bg-teal-500/12 text-teal-200',
    label: 'Role',
  },
  skill: {
    highlight: 'entity-preview-hl-skill',
    chip: loreChip('skill'),
    label: getLoreEntity('skill').label,
  },
  task: {
    highlight: 'entity-preview-hl-task',
    chip: 'border-indigo-500/45 bg-indigo-500/12 text-indigo-200',
    label: 'Task',
  },
  work_activity: {
    highlight: 'entity-preview-hl-work-activity',
    chip: 'border-indigo-400/40 bg-indigo-500/10 text-indigo-100',
    label: 'Work activity',
  },
  worksite: {
    highlight: 'entity-preview-hl-worksite',
    chip: 'border-yellow-500/45 bg-yellow-500/12 text-yellow-100',
    label: 'Deployment site',
  },
  team: {
    highlight: 'entity-preview-hl-team',
    chip: 'border-pink-500/45 bg-pink-500/12 text-pink-200',
    label: 'Team',
  },
  project: {
    highlight: 'entity-preview-hl-project',
    chip: loreChip('project'),
    label: getLoreEntity('project').label,
  },
  uncertain: {
    highlight: 'entity-preview-hl-uncertain',
    chip: 'border-white/30 bg-white/5 text-white/70 border-dashed',
    label: 'Needs review',
  },
};

export function colorKeyForPreviewType(type: string, colorKey?: string): EntityColorKey {
  if (colorKey && colorKey in ENTITY_COLOR_MAP) return colorKey as EntityColorKey;
  switch (type) {
    case 'PERSON': return 'person';
    case 'PLACE': return 'place';
    case 'GROUP': return 'group';
    case 'TIME':
    case 'TIME_PERIOD': return 'time';
    case 'EVENT': return 'event';
    case 'LANGUAGE': return 'language';
    case 'PREFERENCE':
    case 'OBJECT': return 'preference';
    case 'WEATHER_CONTEXT':
    case 'CONTEXT': return 'weather';
    case 'RELATIONSHIP': return 'relationship';
    case 'INTEREST': return 'interest';
    case 'EMOTIONAL_SIGNIFICANCE': return 'emotional_significance';
    case 'ORGANIZATION': return 'organization';
    case 'ROLE': return 'role';
    case 'SKILL': return 'skill';
    case 'TASK': return 'task';
    case 'WORK_ACTIVITY': return 'work_activity';
    case 'DEPLOYMENT_SITE': return 'worksite';
    case 'TEAM': return 'team';
    case 'PROJECT': return 'project';
    default: return 'uncertain';
  }
}

export function highlightClassForPreview(
  colorKey: EntityColorKey,
  needsReview?: boolean,
  entityStatus?: 'known' | 'new'
): string {
  return previewChipClass(colorKey, needsReview, entityStatus);
}

/** Shared chip + inline highlight classes for lexical preview spans. */
export function previewChipClass(
  colorKey: EntityColorKey,
  needsReview?: boolean,
  entityStatus?: 'known' | 'new' | string,
): string {
  const base = ENTITY_COLOR_MAP[colorKey]?.chip ?? ENTITY_COLOR_MAP.uncertain.chip;
  const mods: string[] = ['rounded-[0.2rem] px-0.5'];
  if (entityStatus !== 'known' && entityStatus !== 'confirmed') {
    mods.push('border-dashed opacity-90');
  }
  if (needsReview) mods.push('ring-1 ring-white/15');
  return [base, ...mods].join(' ');
}

/** Inline composer mark for lexical preview — matches LexicalPreviewEntityChips. */
export function inlineMarkClassForPreview(
  colorKey: EntityColorKey,
  needsReview?: boolean,
  entityStatus?: 'known' | 'new' | string,
): string {
  return `entity-preview-hl pointer-events-auto cursor-pointer ${previewChipClass(colorKey, needsReview, entityStatus)}`;
}
