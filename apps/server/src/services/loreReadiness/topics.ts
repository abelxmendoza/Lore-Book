import type { LoreTopicDefinition } from './types';

export const MIN_ATOMS_ANY_BOOK = 20;

export const LORE_TOPICS: LoreTopicDefinition[] = [
  {
    id: 'full_life',
    label: 'Full life story',
    description: 'Chronological arc across your whole timeline',
    scope: 'full_life',
    minAtoms: 20,
    minEntries: 10,
    minTimeSpanMonths: 12,
    minAtomTypes: { event: 3, reflection: 1 },
  },
  {
    id: 'professional',
    label: 'Career & work',
    description: 'Jobs, skills, and professional growth',
    scope: 'domain',
    domain: 'professional',
    minAtoms: 8,
    minEntries: 5,
    minAtomTypes: { event: 2, achievement: 1 },
  },
  {
    id: 'relationships',
    label: 'Love & relationships',
    description: 'Romance, partnership, and connection',
    scope: 'domain',
    domain: 'relationships',
    minAtoms: 8,
    minEntries: 4,
    minAtomTypes: { relationship_moment: 1, reflection: 1 },
  },
  {
    id: 'family',
    label: 'Family',
    description: 'Parents, siblings, and home life',
    scope: 'domain',
    domain: 'family',
    minAtoms: 6,
    minEntries: 4,
    minAtomTypes: { event: 2 },
  },
  {
    id: 'creative',
    label: 'Creative life',
    description: 'Art, writing, music, and projects',
    scope: 'domain',
    domain: 'creative',
    minAtoms: 6,
    minEntries: 3,
    minAtomTypes: { creative_output: 1 },
  },
  {
    id: 'health',
    label: 'Health & body',
    description: 'Wellness, fitness, and recovery',
    scope: 'domain',
    domain: 'health',
    minAtoms: 5,
    minEntries: 3,
  },
  {
    id: 'education',
    label: 'Education',
    description: 'School, training, and learning arcs',
    scope: 'domain',
    domain: 'education',
    minAtoms: 5,
    minEntries: 3,
    minAtomTypes: { skill_milestone: 1 },
  },
  {
    id: 'personal',
    label: 'Personal growth',
    description: 'Identity, values, and inner life',
    scope: 'domain',
    domain: 'personal',
    minAtoms: 6,
    minEntries: 4,
    minAtomTypes: { reflection: 2 },
  },
  {
    id: 'character_book',
    label: 'A person',
    description: 'Book centered on someone in your life',
    scope: 'thematic',
    minAtoms: 6,
    minEntries: 3,
    minEntities: { characters: 1 },
    minAtomTypes: { relationship_moment: 1, event: 1 },
    minEvidenceScore: 30,
  },
  {
    id: 'place_book',
    label: 'A place',
    description: 'Book about a location that shaped you',
    scope: 'thematic',
    minAtoms: 5,
    minEntries: 3,
    minEntities: { locations: 1 },
    minTimeSpanMonths: 1,
    minEvidenceScore: 25,
  },
];

export function getTopicById(id: string): LoreTopicDefinition | undefined {
  return LORE_TOPICS.find((t) => t.id === id);
}

/** Dynamic / narrow compile targets use lighter thresholds. */
export const DYNAMIC_COMPILE_PROFILE = {
  minAtoms: 6,
  minEntries: 3,
  minTimeSpanMonths: 0,
  minEvidenceScore: 20,
};
