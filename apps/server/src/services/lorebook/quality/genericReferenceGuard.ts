/**
 * Reject generic references — consumer apps, objects, unnamed placeholders.
 */

import { guardConsumerAppReference } from '../../lexical/projects/projectConsumerAppGuard';
import { guardObjectReference } from '../../lexical/projects/projectObjectGuard';
import { GENERIC_PROJECT_WORDS, REFERENCE_PHRASES } from '../../lexical/projects/projectSuggestionTypes';
import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { EntityQualityCandidate, EntityQualityVerdict } from './entityQualityGuardTypes';

const GENERIC_REFERENCE_RE =
  /^(?:this|that|it|here|there|one|thing|stuff|something|anything|everything|same|other|another)$/i;

const UNNAMED_ROLE =
  /^(?:potential investor|investor|recruiter|manager|supervisor|teacher|professor|doctor|lawyer|coach)$/i;

export function guardGenericReference(candidate: EntityQualityCandidate): EntityQualityVerdict | null {
  const name = candidate.name.trim();
  const key = normalizeNameKey(name);
  const contextText = [candidate.contextText, candidate.evidence].filter(Boolean).join(' ');

  if (GENERIC_REFERENCE_RE.test(key)) {
    return reject(name, candidate.domain, 'generic_pronoun_reference');
  }

  if (candidate.domain === 'projects' || candidate.domain === 'quests') {
    const consumer = guardConsumerAppReference(name, contextText);
    if (!consumer.allowed) {
      return reject(name, candidate.domain, consumer.rejectionReason ?? 'consumer_app_reference');
    }

    const object = guardObjectReference(name, contextText);
    if (!object.allowed) {
      return reject(name, candidate.domain, object.rejectionReason ?? 'object_reference');
    }

    if (REFERENCE_PHRASES.test(name)) {
      return reject(name, candidate.domain, 'generic_project_reference');
    }

    if (GENERIC_PROJECT_WORDS.has(key) && name.split(/\s+/).length === 1) {
      return reject(name, candidate.domain, 'generic_project_word');
    }
  }

  if (UNNAMED_ROLE.test(key)) {
    if (!/\bfrom\b/i.test(contextText) && !/\b[A-Z][a-z]+/.test(name)) {
      return {
        gate: 'review',
        name,
        domain: candidate.domain,
        rejectionReason: 'unnamed_role_reference',
        confidence: 0.5,
        provenance: [{ guard: 'genericReferenceGuard', rule: 'unnamed_role_needs_context' }],
        requiresReview: true,
      };
    }
  }

  if (candidate.domain === 'relationships' && key === 'friend' && !contextText.includes('=') && name.split(/\s+/).length === 1) {
    return reject(name, candidate.domain, 'bare_relationship_label');
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
    provenance: [{ guard: 'genericReferenceGuard', rule }],
    requiresReview: false,
  };
}
