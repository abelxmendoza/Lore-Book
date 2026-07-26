/**
 * Distinguishes a one-off subjective observation/reaction ("I thought X was
 * attractive") from a stable, durable character trait ("X is very
 * organized"). Deterministic and conservative on purpose: false negatives
 * just mean today's status quo (stored as an entity_facts row), which is
 * acceptable — this only needs to catch the clear one-off-opinion case, not
 * every possible subjective statement.
 *
 * A one-off opinion must never auto-promote into a permanent canonical
 * character trait — it belongs in perception_entries (low confidence,
 * revisable, sentiment-tagged), not entity_facts.
 */

export type FactStability = 'stable_trait' | 'opinion_or_reaction';

export type ExtractedFactLike = {
  fact: string;
  category: string;
  confidence: number;
};

/**
 * First-person subjective/evaluative reactions with no durable-trait claim —
 * a momentary feeling or impression, not a settled statement about who
 * someone is. Deliberately narrow: generic markers only, no real names.
 */
const OPINION_MARKERS =
  /\bi (?:thought|think|found|felt|feel) [a-z' ]{0,40}(?:attractive|hot|cute|ugly|gross|creepy|annoying|weird|awkward|intimidating)\b/i;
const ONE_OFF_MARKERS =
  /\b(?:that one time|just this once|in that moment|for a second there|at that moment)\b/i;
const MOMENTARY_EMOTION_RE =
  /\bi (?:was|felt) (?:mad|annoyed|jealous|attracted|irritated|uneasy) (?:at|by|with|to)\b/i;

/** Categories that lean durable — a hit here does not override a strong opinion marker, but weighs against ambiguous cases. */
const STABLE_LEANING_CATEGORIES = new Set(['personality', 'history', 'career', 'goals']);

export function classifyFactStability(fact: ExtractedFactLike, sourceSentence: string): FactStability {
  const sentence = sourceSentence || fact.fact;
  const hasOpinionMarker =
    OPINION_MARKERS.test(sentence) || ONE_OFF_MARKERS.test(sentence) || MOMENTARY_EMOTION_RE.test(sentence);

  if (!hasOpinionMarker) return 'stable_trait';

  // A strong opinion marker on a fact that's ALSO in a durable-leaning
  // category (e.g. "personality") is still treated as an opinion — the
  // marker is about a momentary reaction, not the category the extractor
  // happened to file it under.
  if (STABLE_LEANING_CATEGORIES.has(fact.category) && !OPINION_MARKERS.test(sentence)) {
    return 'stable_trait';
  }

  return 'opinion_or_reaction';
}
