/**
 * Character Book cards for pets. Pets stay in the characters table/list
 * rather than a separate collection — a non-null `species` marks a row as a
 * pet (see certifiedEntity.ts loreKind: 'pet' and the characters.species
 * column) so the Pets filter can select them with Boolean(char.species).
 */

import type { Character } from '../components/characters/CharacterProfileCard';

export const MOCK_PET_CHARACTERS: Character[] = [
  {
    id: 'pet-biscuit',
    name: 'Biscuit',
    first_name: 'Biscuit',
    last_name: null,
    alias: ['Biscuit', 'Biz'],
    pronouns: 'he/him',
    archetype: 'pet',
    species: 'dog',
    role: 'Your dog',
    status: 'active',
    importance_level: 'supporting',
    importance_score: 62,
    is_nickname: false,
    proximity_level: 'direct',
    has_met: true,
    relationship_depth: 'close',
    summary: 'Golden retriever who greets everyone at the door like they invented the doorbell.',
    tags: ['pet', 'dog', 'household'],
    metadata: {
      relationship_type: 'pet',
      closeness_score: 62,
      breed: 'Golden Retriever',
    },
    social_media: {},
    memory_count: 14,
    relationship_count: 1,
  },
  {
    id: 'pet-luna',
    name: 'Luna',
    first_name: 'Luna',
    last_name: null,
    alias: ['Luna'],
    pronouns: 'she/her',
    archetype: 'pet',
    species: 'cat',
    role: 'Your cat',
    status: 'active',
    importance_level: 'supporting',
    importance_score: 55,
    is_nickname: false,
    proximity_level: 'direct',
    has_met: true,
    relationship_depth: 'close',
    summary: 'Black cat who supervises every video call from the top of the bookshelf.',
    tags: ['pet', 'cat', 'household'],
    metadata: {
      relationship_type: 'pet',
      closeness_score: 55,
      breed: 'Domestic Shorthair',
    },
    social_media: {},
    memory_count: 9,
    relationship_count: 1,
  },
  {
    id: 'pet-momo',
    name: 'Momo',
    first_name: 'Momo',
    last_name: null,
    alias: ['Momo'],
    pronouns: 'she/her',
    archetype: 'pet',
    species: 'bird',
    role: "Jamie's parrot",
    status: 'active',
    importance_level: 'minor',
    importance_score: 30,
    is_nickname: false,
    proximity_level: 'indirect',
    has_met: true,
    relationship_depth: 'casual',
    summary: "Jamie's talkative green-cheek conure — has learned to say your name.",
    tags: ['pet', 'bird'],
    metadata: {
      relationship_type: 'pet',
      closeness_score: 30,
      breed: 'Green-cheeked Conure',
    },
    social_media: {},
    memory_count: 4,
    relationship_count: 1,
  },
];

const BY_ID = new Map(MOCK_PET_CHARACTERS.map((c) => [c.id, c]));

export function getMockPetCharacters(): Character[] {
  return [...MOCK_PET_CHARACTERS];
}

export function getMockPetCharacterById(id: string): Character | undefined {
  return BY_ID.get(id);
}

/** Merge demo pets into a Character Book list without duplicates. */
export function mergePetDemoCharacters(base: Character[]): Character[] {
  const byId = new Map(base.map((c) => [c.id, c]));
  for (const c of getMockPetCharacters()) {
    if (!byId.has(c.id)) byId.set(c.id, c);
  }
  return [...byId.values()];
}
