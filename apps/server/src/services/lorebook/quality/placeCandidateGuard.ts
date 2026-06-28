/**
 * Reject place/location candidates that are not actually place names.
 *
 * The chat place detector emits a lot of noise that slips past the generic
 * guards. Real failures observed: "home coding Lorebook all weekend",
 * "Amazon now as of", "Amazon as a Quality Assurance Technician", "work",
 * "mail", "all day", "my project". None of these are places — they are activity
 * narration, sentence fragments, job roles, time phrases, or generic nouns.
 *
 * Deterministic, no LLM. Only fires for the `locations` domain so it can be
 * aggressive without touching other books. Careful NOT to reject real multi-word
 * venues ("First Street Pool and Billiards", "Club Metro") — it keys on activity
 * verbs / time / filler / possessive-generic signals, not on word count alone.
 */

import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { EntityQualityCandidate, EntityQualityVerdict } from './entityQualityGuardTypes';

/** Bare common nouns that are never a useful place NAME on their own. */
const GENERIC_NON_PLACE = new Set([
  'work',
  'mail',
  'email',
  'job',
  'shift',
  'thing',
  'stuff',
  'area',
  'side',
  'way',
  'part',
  'project',
  'laptop',
  'phone',
  'dinner',
  'lunch',
  'breakfast',
  'break',
  'media',
]);

/** Narrative activity verbs/gerunds — a place name does not contain these. */
const ACTIVITY_SPAN =
  /\b(?:coding|coded|texted|texting|ghosting|ghosted|blocking|blocked|onboarding|onboarded|applied|applying|investing|invested|improved|improving|eating|ate|sleeping|slept|driving|drove|teared|messaging|messaged|scrolling)\b/i;

/** Standalone or embedded time expressions. */
const TEMPORAL_SPAN =
  /\b(?:all\s+(?:day|night|weekend|week)|tonight|today|tomorrow|yesterday|this\s+(?:weekend|morning|afternoon|evening|week|month)|last\s+(?:night|week|weekend)|right\s+now|now\s+as\s+of|as\s+of\s+(?:today|now|tonight|yesterday)|(?:mon|tues|wednes|thurs|fri|satur|sun)day|midnight|noon)\b/i;

/** Sentence-fragment filler that means the span is not a clean entity name. */
const FRAGMENT_FILLER =
  /(?:\bnow\s+as\s+of\b|\bas\s+of\b|\bas\s+an?\s+\w|\bwanting\s+to\b|\binterested\s+in\b)/i;

/** "my project", "her startup" — a possessed generic, not a place. */
const POSSESSIVE_GENERIC =
  /^(?:my|our|your|their|his|her)\s+(?:project|app|thing|stuff|place|spot|repo|code|work|laptop|phone|startup|company|idea|build|side\s?project)\b/i;

function reject(name: string, domain: EntityQualityCandidate['domain'], rule: string): EntityQualityVerdict {
  return {
    gate: 'reject',
    name,
    domain,
    rejectionReason: rule,
    confidence: 0,
    provenance: [{ guard: 'placeCandidateGuard', rule }],
    requiresReview: false,
  };
}

export function guardPlaceCandidate(candidate: EntityQualityCandidate): EntityQualityVerdict | null {
  if (candidate.domain !== 'locations') return null;
  const name = candidate.name.trim();
  if (!name) return null;
  const key = normalizeNameKey(name);

  if (GENERIC_NON_PLACE.has(key)) return reject(name, candidate.domain, 'generic_non_place_word');
  if (POSSESSIVE_GENERIC.test(name)) return reject(name, candidate.domain, 'possessive_generic_non_place');
  if (TEMPORAL_SPAN.test(name)) return reject(name, candidate.domain, 'temporal_phrase_not_place');
  if (ACTIVITY_SPAN.test(name)) return reject(name, candidate.domain, 'activity_narration_not_place');
  if (FRAGMENT_FILLER.test(name)) return reject(name, candidate.domain, 'sentence_fragment_span');

  return null;
}
