/**
 * Infer companion (pet / robot) species from mention context so Character Book
 * adds can skip the person-name gate. Explicit `species` on the create body
 * always wins.
 *
 * Do not treat every Name+digits token as a robot — product versions (GPT-4)
 * and shipping names stay unclassified unless the user (or surrounding text)
 * says this is a companion.
 */

const ROBOT_KIND_WORDS = ['robot', 'android', 'droid', 'bot'] as const;

const ANIMAL_KIND_TO_SPECIES: Array<{ words: string[]; species: string }> = [
  { words: ['puppy', 'dog'], species: 'dog' },
  { words: ['kitten', 'cat'], species: 'cat' },
  { words: ['bunny', 'rabbit'], species: 'rabbit' },
  { words: ['bird'], species: 'bird' },
  { words: ['hamster'], species: 'hamster' },
  { words: ['horse'], species: 'horse' },
  { words: ['fish'], species: 'fish' },
  { words: ['pet'], species: 'pet' },
];

export const COMPANION_KIND_WORDS = [
  ...ROBOT_KIND_WORDS,
  ...ANIMAL_KIND_TO_SPECIES.flatMap((row) => row.words),
] as const;

export const COMPANION_KIND_ALTERNATION = COMPANION_KIND_WORDS.join('|');

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function speciesFromKindWord(word: string): string {
  const key = word.toLowerCase();
  if ((ROBOT_KIND_WORDS as readonly string[]).includes(key)) return 'robot';
  for (const row of ANIMAL_KIND_TO_SPECIES) {
    if (row.words.includes(key)) return row.species;
  }
  return 'pet';
}

function firstKindMatch(context: string, pattern: RegExp): string | undefined {
  const match = context.match(pattern);
  const kind = match?.[1];
  return kind ? kind.toLowerCase() : undefined;
}

/** Species implied by "my robot Omega1" / "Max is my dog" phrasing. */
export function inferCompanionSpecies(name: string, context?: string): string | undefined {
  const trimmed = name.trim();
  if (!trimmed || !context?.trim()) return undefined;
  const n = escapeRegExp(trimmed);
  const kind = COMPANION_KIND_ALTERNATION;
  const matched =
    firstKindMatch(context, new RegExp(`\\b(?:my|our)\\s+(${kind})\\s+${n}\\b`, 'i')) ||
    firstKindMatch(context, new RegExp(`\\b${n}\\s+(?:is|was)\\s+(?:my|our)\\s+(${kind})\\b`, 'i')) ||
    firstKindMatch(context, new RegExp(`\\b(${kind})(?:'s|’s)?\\s+name\\s+is\\s+${n}\\b`, 'i'));
  return matched ? speciesFromKindWord(matched) : undefined;
}

/**
 * Title-case token with trailing digits (Omega1). Rejects all-caps model
 * names like GPT4 so we do not auto-promote product versions.
 */
export function looksLikeRobotDesignation(name: string): boolean {
  const trimmed = name.trim();
  if (!/^[A-Z][a-z]{2,24}\d{1,4}[A-Za-z0-9]{0,6}$/.test(trimmed)) return false;
  if (/^(gpt|claude|llama|gemini|opus|sonnet|chatgpt)/i.test(trimmed)) return false;
  return true;
}

export function shouldRetryAddAsRobotCompanion(name: string, context?: string): boolean {
  if (inferCompanionSpecies(name, context) === 'robot') return true;
  return looksLikeRobotDesignation(name);
}

export function resolveCompanionSpecies(input: {
  name: string;
  species?: string | null;
  context?: string;
  kind?: 'person' | 'pet';
}): string | undefined {
  const explicit = input.species?.trim();
  if (explicit) return explicit;
  return inferCompanionSpecies(input.name, input.context) ?? (input.kind === 'pet' ? 'pet' : undefined);
}
