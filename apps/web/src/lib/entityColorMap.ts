/** Entity classification colors for composer lexical preview highlights. */

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
    chip: 'border-blue-500/45 bg-blue-500/12 text-blue-200',
    label: 'Person',
  },
  place: {
    highlight: 'entity-preview-hl-place',
    chip: 'border-emerald-500/45 bg-emerald-500/12 text-emerald-200',
    label: 'Place',
  },
  group: {
    highlight: 'entity-preview-hl-group',
    chip: 'border-violet-500/45 bg-violet-500/12 text-violet-200',
    label: 'Group',
  },
  time: {
    highlight: 'entity-preview-hl-time',
    chip: 'border-amber-500/45 bg-amber-500/12 text-amber-200',
    label: 'Time',
  },
  event: {
    highlight: 'entity-preview-hl-event',
    chip: 'border-orange-500/45 bg-orange-500/12 text-orange-200',
    label: 'Event',
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
    chip: 'border-rose-500/45 bg-rose-500/12 text-rose-200',
    label: 'Relationship',
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
    chip: 'border-green-500/45 bg-green-500/12 text-green-200',
    label: 'Organization',
  },
  role: {
    highlight: 'entity-preview-hl-role',
    chip: 'border-teal-500/45 bg-teal-500/12 text-teal-200',
    label: 'Role',
  },
  skill: {
    highlight: 'entity-preview-hl-skill',
    chip: 'border-cyan-500/45 bg-cyan-500/12 text-cyan-200',
    label: 'Skill',
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
    chip: 'border-purple-500/45 bg-purple-500/12 text-purple-200',
    label: 'Project',
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
    case 'SKILL':
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
  const base = ENTITY_COLOR_MAP[colorKey]?.highlight ?? ENTITY_COLOR_MAP.uncertain.highlight;
  const statusClass =
    entityStatus === 'known' ? 'entity-preview-hl-known' : 'entity-preview-hl-new';
  const reviewClass = needsReview ? 'entity-preview-hl-review' : '';
  return [base, statusClass, reviewClass].filter(Boolean).join(' ');
}
