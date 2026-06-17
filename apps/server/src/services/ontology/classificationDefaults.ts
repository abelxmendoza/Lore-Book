/**
 * Default swimlane definitions — used when classifications table is empty or unavailable.
 */
export interface SwimlaneDefinition {
  label: string;
  keywords: string[];
  isDefault?: boolean;
  id?: string;
}

export const DEFAULT_SWIMLANES: SwimlaneDefinition[] = [
  { label: 'life', keywords: [], isDefault: true },
  {
    label: 'robotics',
    keywords: ['robot', 'robotics', 'ai', 'machine learning', 'automation', 'sensor', 'actuator', 'arduino', 'raspberry pi', 'ros', 'ros2'],
  },
  {
    label: 'mma',
    keywords: ['mma', 'fighting', 'martial arts', 'training', 'gym', 'sparring', 'fight', 'jiu jitsu', 'boxing', 'wrestling', 'muay thai', 'bjj'],
  },
  {
    label: 'work',
    keywords: ['work', 'meeting', 'project', 'deadline', 'office', 'colleague', 'boss', 'client', 'presentation', 'onboarding', 'interview'],
  },
  {
    label: 'creative',
    keywords: ['art', 'creative', 'design', 'music', 'writing', 'drawing', 'painting', 'photography', 'film', 'band', 'show', 'concert'],
  },
];

/** Supplemental venue/place labels → dynamic classification metadata. */
export const SUPPLEMENTAL_LOCATION_CLASSIFICATIONS: Array<{
  label: string;
  match: (name: string) => boolean;
  metadata: Record<string, unknown>;
}> = [
  {
    label: 'club metro',
    match: (n) => /\bclub metro\b/i.test(n),
    metadata: { category: 'VENUE', subcategory: 'NIGHTCLUB' },
  },
  {
    label: 'blue room',
    match: (n) => /\bblue room\b/i.test(n),
    metadata: { category: 'VENUE', subcategory: 'MUSIC_VENUE' },
  },
];

export const SUPPLEMENTAL_GROUP_CLASSIFICATIONS: Array<{
  label: string;
  match: (name: string) => boolean;
  metadata: Record<string, unknown>;
}> = [
  {
    label: 'prayers',
    match: (n) => /^prayers$/i.test(n.trim()),
    metadata: { category: 'MUSIC_GROUP', subcategory: 'BAND' },
  },
  {
    label: 'ex lover',
    match: (n) => /^ex[- ]lover$/i.test(n.trim()),
    metadata: { category: 'MUSIC_GROUP', subcategory: 'BAND' },
  },
];
