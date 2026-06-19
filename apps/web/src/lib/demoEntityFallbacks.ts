import type { CertifiedEntityType } from '../types/certifiedEntity';

/** Shared demo entity patterns — chat, Story Forge, and seed threads all use the same names. */
export type DemoEntityFallback = {
  pattern: RegExp;
  id: string;
  name: string;
  type: CertifiedEntityType;
  characterVariant?: 'romantic';
};

export const DEMO_ENTITY_FALLBACKS: DemoEntityFallback[] = [
  { pattern: /\balex\b/i, id: 'demo-char-alex', name: 'Alex', type: 'character' },
  { pattern: /\bjamie\b/i, id: 'demo-char-jamie', name: 'Jamie', type: 'character' },
  { pattern: /\bmarcus\b/i, id: 'demo-char-marcus', name: 'Marcus', type: 'character' },
  {
    pattern: /\bkelly\b/i,
    id: 'demo-char-kelly',
    name: 'Kelly',
    type: 'character',
    characterVariant: 'romantic',
  },
  { pattern: /\bt[ií]a maria\b/i, id: 'demo-char-tia-maria', name: 'Tía Maria', type: 'character' },
  { pattern: /\bsan diego\b/i, id: 'demo-loc-sd', name: 'San Diego', type: 'location' },
  { pattern: /\bmission beach\b/i, id: 'demo-loc-mission-beach', name: 'Mission Beach', type: 'location' },
  {
    pattern: /\barmstrong robotics\b/i,
    id: 'demo-org-armstrong',
    name: 'Armstrong Robotics',
    type: 'organization',
  },
  {
    pattern: /\bnorthwind\b/i,
    id: 'demo-org-northwind',
    name: 'Northwind Labs',
    type: 'organization',
  },
  {
    pattern: /\bpublic speaking\b/i,
    id: 'demo-skill-speaking',
    name: 'Public Speaking',
    type: 'skill',
  },
];
