const DISCOURSE_OPENERS = new Set([
  'also',
  'anyway',
  'anyways',
  'finally',
  'first',
  'here',
  "here's",
  'heres',
  'later',
  'meanwhile',
  'next',
  'now',
  'so',
  'then',
  'there',
  "there's",
  'theres',
  'today',
  'well',
  'yesterday',
]);

/**
 * Capitalized sentence openers are frequently mistaken for proper names
 * ("Here's a resume" → "Here"). Keep this guard shared by extractors so
 * candidate filtering is consistent before anything is persisted.
 */
export function isDiscourseOpener(value: string): boolean {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:]+$/, '')
    .replace(/[’']/g, '');
  return DISCOURSE_OPENERS.has(normalized);
}
