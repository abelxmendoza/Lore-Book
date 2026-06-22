import { normalizeNameKey } from '../../../utils/nameNormalization';
import { inferBeliefs } from './beliefInference';
import { inferMentalModels } from './mentalModelInference';
import {
  inferNamedConcepts,
  isBareGenericConcept,
  isValidNamedPhrase,
} from './namedConceptInference';
import {
  boostConfidenceForRepeatedMentions,
  canPromoteToConceptCard,
  evaluateConceptPromotionStatus,
} from './conceptPromotionGate';
import {
  buildConceptContext,
  extractEvidencePhrases,
  hasProvenance,
} from './conceptProvenanceService';
import { inferTechnicalConcepts } from './technicalConceptInference';
import { inferThemes } from './themeInference';
import type {
  ConceptCandidate,
  ConceptInferenceInput,
  ConceptInferenceResult,
} from './conceptInferenceTypes';

function attachMessageMeta(
  candidates: ConceptCandidate[],
  input: ConceptInferenceInput,
): ConceptCandidate[] {
  return candidates.map((c) => {
    const priorKey = normalizeNameKey(c.displayName);
    const priorMentions = input.priorMentionCounts?.[priorKey] ?? 0;

    return {
      ...c,
      confidence: boostConfidenceForRepeatedMentions(c.confidence, priorMentions),
      sourceMessageIds: input.sourceMessageId ? [input.sourceMessageId] : c.sourceMessageIds,
      context: {
        ...buildConceptContext(input.text, c.displayName, c.context),
        projectContext:
          c.context.projectContext ?? (/\bLoreBook\b/i.test(input.text) ? 'LoreBook' : undefined),
        repeatedTheme: priorMentions >= 1 || c.context.repeatedTheme,
      },
      evidencePhrases:
        c.evidencePhrases.length > 0
          ? c.evidencePhrases
          : extractEvidencePhrases(input.text, c.displayName),
    };
  });
}

function dedupeConcepts(candidates: ConceptCandidate[]): ConceptCandidate[] {
  const out: ConceptCandidate[] = [];
  for (const candidate of candidates) {
    const key = normalizeNameKey(candidate.displayName);
    const idx = out.findIndex((c) => normalizeNameKey(c.displayName) === key);
    if (idx >= 0) {
      const existing = out[idx];
      out[idx] = {
        ...existing,
        confidence: Math.max(existing.confidence, candidate.confidence),
        evidencePhrases: [...new Set([...existing.evidencePhrases, ...candidate.evidencePhrases])],
        sourceMessageIds: [...new Set([...existing.sourceMessageIds, ...candidate.sourceMessageIds])],
        context: { ...existing.context, ...candidate.context },
        requiresReview: existing.requiresReview || candidate.requiresReview,
      };
    } else {
      out.push(candidate);
    }
  }
  return out;
}

function applyWrongDomainGuard(
  candidate: ConceptCandidate,
  knownDomains?: ConceptInferenceInput['knownDomains'],
): ConceptCandidate | null {
  const key = normalizeNameKey(candidate.displayName);
  const known = knownDomains?.[key];

  if (known === 'person' || known === 'place' || known === 'event' || known === 'group' || known === 'object') {
    if (candidate.conceptType !== 'technical_concept' && candidate.conceptType !== 'product_concept') {
      return null;
    }
  }

  if (known === 'project' && !candidate.context.projectContext) {
    return null;
  }

  if (known === 'skill' && candidate.conceptType === 'technical_concept') {
    return null;
  }

  return candidate;
}

function finalizeCandidate(
  candidate: ConceptCandidate,
  input: ConceptInferenceInput,
): ConceptCandidate {
  const priorKey = normalizeNameKey(candidate.displayName);
  const priorMentions = input.priorMentionCounts?.[priorKey] ?? 0;

  return {
    ...candidate,
    promotionStatus: evaluateConceptPromotionStatus(candidate, {
      mentionCount: input.mentionCount,
      userConfirmed: input.userConfirmed,
      priorMentions,
    }),
  };
}

export class ConceptInferenceService {
  inferFromMessage(input: ConceptInferenceInput): ConceptInferenceResult {
    const rejected: ConceptInferenceResult['rejected'] = [];

    if (input.authorRole === 'assistant') {
      return {
        accepted: [],
        rejected: [{ displayName: '(assistant)', reason: 'assistant_generated' }],
      };
    }

    const raw = [
      ...inferNamedConcepts(input.text),
      ...inferTechnicalConcepts(input.text),
      ...inferBeliefs(input.text),
      ...inferThemes(input.text, { priorMentionCounts: input.priorMentionCounts }),
      ...inferMentalModels(input.text),
    ];

    const withMeta = attachMessageMeta(raw, input);
    const deduped = dedupeConcepts(withMeta);
    const accepted: ConceptCandidate[] = [];

    for (const candidate of deduped) {
      if (isBareGenericConcept(candidate.displayName) && !isValidNamedPhrase(candidate.displayName)) {
        rejected.push({ displayName: candidate.displayName, reason: 'bare_generic_concept' });
        continue;
      }

      const guarded = applyWrongDomainGuard(candidate, input.knownDomains);
      if (!guarded) {
        rejected.push({ displayName: candidate.displayName, reason: 'wrong_domain' });
        continue;
      }

      if (!hasProvenance(guarded)) {
        rejected.push({ displayName: candidate.displayName, reason: 'missing_provenance' });
        continue;
      }

      accepted.push(finalizeCandidate(guarded, input));
    }

    return { accepted, rejected };
  }

  canPromote(
    candidate: ConceptCandidate,
    opts: { mentionCount?: number; userConfirmed?: boolean; priorMentions?: number },
  ): boolean {
    return canPromoteToConceptCard(candidate, opts);
  }
}

export const conceptInferenceService = new ConceptInferenceService();
