/**
 * Pets live in the Character Book as cards, but they are animals: family trees,
 * parents and children are human-kinship UI that reads as nonsense on a dog's
 * card (and the demo tree even falls back to the user's own family). Use this
 * to keep those surfaces off pet cards.
 *
 * Word list mirrors the server's `PET_KIND_WORDS` (entityClassifier) plus the
 * species aliases `familyEdgeWriter` maps to `pet_of`, so client and server
 * agree on what counts as a pet.
 */

const PET_WORDS = new Set([
  'pet',
  'dog',
  'puppy',
  'cat',
  'kitten',
  'bird',
  'bunny',
  'rabbit',
  'hamster',
  'horse',
  'fish',
  'reptile',
  'ferret',
]);

type PetCandidate = {
  species?: string | null;
  tags?: string[] | null;
  metadata?: Record<string, unknown> | null;
};

function normalize(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/_of$/, '');
}

/** True when this character card describes an animal rather than a person. */
export function isPetCharacter(character: PetCandidate | null | undefined): boolean {
  if (!character) return false;

  // An explicit species is the unambiguous signal — the server only sets it for pets.
  const species = character.species ?? (character.metadata?.species as string | undefined);
  if (species && String(species).trim()) return true;

  if (PET_WORDS.has(normalize(character.metadata?.relationship_type))) return true;
  if (PET_WORDS.has(normalize((character.metadata as { loreKind?: unknown } | null)?.loreKind))) return true;

  return (character.tags ?? []).some((tag) => normalize(tag) === 'pet');
}
