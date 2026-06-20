import type { CertifiedEntityType } from '../types/certifiedEntity';
import type { LoreEntityKind } from './loreEntities';

/** Shared demo entity patterns — chat, Story Forge, and seed threads all use the same names. */
export type DemoEntityFallback = {
  pattern: RegExp;
  id: string;
  name: string;
  type: CertifiedEntityType;
  characterVariant?: 'romantic';
  /** Override palette when certified type does not match book surface (e.g. projects). */
  loreKind?: LoreEntityKind;
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
    pattern: /\bvanguard robotics\b/i,
    id: 'demo-org-vanguard',
    name: 'Vanguard Robotics',
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
  {
    pattern: /\btechnical storytelling\b/i,
    id: 'demo-skill-storytelling',
    name: 'Technical Storytelling',
    type: 'skill',
  },
  { pattern: /\bmuay thai\b/i, id: 'demo-skill-muay', name: 'Muay Thai', type: 'skill' },
  {
    pattern: /\bnorthwind labs\b/i,
    id: 'demo-org-northwind',
    name: 'Northwind Labs',
    type: 'organization',
    loreKind: 'group',
  },
  {
    pattern: /\blorebook\b/i,
    id: 'demo-proj-lorebook',
    name: 'LoreBook',
    type: 'event',
    loreKind: 'project',
  },
  {
    pattern: /\brobotics build\b/i,
    id: 'demo-proj-robotics',
    name: 'Robotics Build',
    type: 'event',
    loreKind: 'project',
  },
  {
    pattern: /\bsummit staffing\b/i,
    id: 'demo-org-summit',
    name: 'Summit Staffing',
    type: 'organization',
  },
  { pattern: /\bmaribel\b/i, id: 'demo-char-maribel', name: 'Maribel', type: 'character' },
];
