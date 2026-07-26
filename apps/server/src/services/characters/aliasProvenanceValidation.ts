/**
 * Alias provenance validation — reject sentence fragments and malformed
 * possessives so they never drive automatic merge confidence.
 */

import { normalizeNameKey } from '../../utils/nameNormalization';
import { isRelationalPlaceholder, parseRelationalPlaceholder } from '../../utils/characterNameMatching';

const DISCOURSE_PREFIX_RE =
  /^(?:also|aka|a\.?k\.?a\.?|known as|called|named|alias|or|and|plus)\s+/i;

const SENTENCE_FRAGMENT_RE =
  /\b(?:who|that|which|because|when|where|while|from the|in the|at the)\b/i;

const MALFORMED_POSSESSIVE_RE = /\b\w+s['’]s\b|\b\w+['’]s\s*$/i;

export type AliasValidationResult = {
  value: string;
  accepted: boolean;
  confidence: number;
  reason?: string;
};

/**
 * Validate a candidate alias before it participates in duplicate scoring.
 * Low-confidence candidates may still be shown for review but must not
 * raise merge confidence.
 */
export function validateAliasCandidate(
  alias: string,
  opts?: { canonicalName?: string },
): AliasValidationResult {
  const raw = (alias ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return { value: raw, accepted: false, confidence: 0, reason: 'empty' };

  if (DISCOURSE_PREFIX_RE.test(raw)) {
    return { value: raw, accepted: false, confidence: 0.1, reason: 'discourse_prefix' };
  }

  // "Also Oscuridads" / pluralized discourse fragments
  if (/^also\s+\w+s$/i.test(raw) || /^also\s+/i.test(raw)) {
    return { value: raw, accepted: false, confidence: 0.05, reason: 'discourse_prefix' };
  }

  if (SENTENCE_FRAGMENT_RE.test(raw) && raw.split(/\s+/).length >= 4) {
    return { value: raw, accepted: false, confidence: 0.15, reason: 'sentence_fragment' };
  }

  if (MALFORMED_POSSESSIVE_RE.test(raw) && !parseRelationalPlaceholder(raw)) {
    return { value: raw, accepted: false, confidence: 0.2, reason: 'malformed_possessive' };
  }

  // Multi-person descriptive phrases / spatial phrases are not aliases.
  if (isRelationalPlaceholder(raw)) {
    return { value: raw, accepted: false, confidence: 0.2, reason: 'relational_descriptor' };
  }

  if (/\b(?:next to|beside|near|across from)\b/i.test(raw)) {
    return { value: raw, accepted: false, confidence: 0.15, reason: 'spatial_context' };
  }

  if (opts?.canonicalName && normalizeNameKey(raw) === normalizeNameKey(opts.canonicalName)) {
    return { value: raw, accepted: false, confidence: 0, reason: 'same_as_canonical' };
  }

  // Single-token aliases are fine; long descriptive labels are weak.
  if (raw.split(/\s+/).length >= 6) {
    return { value: raw, accepted: true, confidence: 0.35, reason: 'long_descriptive_weak' };
  }

  return { value: raw, accepted: true, confidence: 0.85 };
}

/** Aliases safe to use for identity scoring (excludes malformed / discourse junk). */
export function filterScoringAliases(
  aliases: Array<string | null | undefined>,
  opts?: { canonicalName?: string },
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const alias of aliases) {
    const result = validateAliasCandidate(alias ?? '', opts);
    if (!result.accepted || result.confidence < 0.5) continue;
    const key = normalizeNameKey(result.value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(result.value);
  }
  return out;
}
