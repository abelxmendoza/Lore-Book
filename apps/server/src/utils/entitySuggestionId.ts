import { placeClusterKey } from './namedPlaceExtractor';
import { normalizeNameKey } from './nameNormalization';

/** Stable id for a pending character suggestion (omega/question row or name-key fallback). */
export function characterSuggestionId(input: {
  name: string;
  omegaEntityId?: string;
  questionId?: string;
  id?: string;
}): string {
  if (input.id) return input.id;
  if (input.omegaEntityId) return input.omegaEntityId;
  if (input.questionId) return input.questionId;
  const key = normalizeNameKey(input.name);
  return key ? `sug:character:${key}` : `sug:character:${Date.now()}`;
}

/** Stable id for a pending place suggestion. */
export function locationSuggestionId(input: { name: string; type?: string; id?: string }): string {
  if (input.id) return input.id;
  return `sug:location:${placeClusterKey(input.name, input.type)}`;
}
