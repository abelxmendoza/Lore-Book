/**
 * Reject broken spans — truncated tokens, dangling titles, malformed labels.
 */

import { evaluateTitleOnlyPersonGuard } from '../../lexical/intelligence/titleOnlyEntityGuard';
import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { EntityQualityCandidate, EntityQualityVerdict } from './entityQualityGuardTypes';

const TRAILING_JUNK = /^[\s,.;:]+|[\s,.;:]+$/;
const INCOMPLETE_TITLE = /^(?:mr|mrs|ms|miss|dr|prof|professor)\.?$/i;
const SINGLE_LETTER = /^[a-z]$/i;
const BROKEN_POSSESSIVE = /(?:'s|’s)$/i;
const VERB_FRAGMENT =
  /^(?:working|building|developing|creating|launching|shipping|designing|prototyping|writing|recording|needs|better|going|doing|learning|fixing)$/i;

export function guardBrokenSpan(candidate: EntityQualityCandidate): EntityQualityVerdict | null {
  const raw = candidate.name ?? '';
  const name = raw.trim();
  const key = normalizeNameKey(name);

  if (!name || key.length < 2) {
    return reject(name, candidate.domain, 'too_short');
  }

  if (TRAILING_JUNK.test(raw) && raw.trim() !== raw) {
    return reject(name, candidate.domain, 'malformed_whitespace');
  }

  if (SINGLE_LETTER.test(name)) {
    return reject(name, candidate.domain, 'single_letter');
  }

  if (INCOMPLETE_TITLE.test(name)) {
    return reject(name, candidate.domain, 'incomplete_title');
  }

  if (evaluateTitleOnlyPersonGuard(name).isTitleOnly && candidate.domain === 'characters') {
    return reject(name, candidate.domain, 'title_only_without_name');
  }

  if (BROKEN_POSSESSIVE.test(name) && name.split(/\s+/).length === 1 && !name.includes(' ')) {
    return reject(name, candidate.domain, 'dangling_possessive');
  }

  if (VERB_FRAGMENT.test(key)) {
    return reject(name, candidate.domain, 'verb_fragment');
  }

  if (/^[^A-Za-z0-9]+/.test(name) || /[^A-Za-z0-9'’.-]+$/.test(name.replace(/\s/g, ''))) {
    if (!/^[A-Z][\w'&.-]+$/.test(name)) {
      return reject(name, candidate.domain, 'broken_punctuation_span');
    }
  }

  return null;
}

function reject(
  name: string,
  domain: EntityQualityCandidate['domain'],
  rule: string
): EntityQualityVerdict {
  return {
    gate: 'reject',
    name,
    domain,
    rejectionReason: rule,
    confidence: 0,
    provenance: [{ guard: 'brokenSpanGuard', rule }],
    requiresReview: false,
  };
}
