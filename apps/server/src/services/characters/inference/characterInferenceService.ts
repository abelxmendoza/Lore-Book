import { normalizePersonNameKey } from '../../../utils/personNameValidation';
import { evaluateWrongDomain, isJunkTestData } from '../audit/wrongDomainCharacterGuard';
import { isBareTitleInvalid } from '../audit/bareTitleInvalidGuard';
import { looksLikeStageOrNickname } from '../audit/ambiguousCharacterGuard';
import { dedupeAmbiguousCandidates } from './ambiguousPersonResolver';
import { evaluatePromotionStatus, canPromoteToCharacterCard } from './characterPromotionGate';
import {
  buildInferenceContext,
  collectLinkedPeople,
  extractEvidencePhrases,
} from './characterProvenanceService';
import { inferContextualPersons, rejectBareWithoutContext } from './contextualPersonInference';
import { inferFamilyTitlePersons } from './familyPersonInference';
import { inferNamedPersons } from './namedPersonInference';
import { isBareGenericLabel } from './rolePersonInference';
import { inferHonorificPersons } from './titlePersonInference';
import type {
  CharacterCandidate,
  CharacterInferenceInput,
  CharacterInferenceResult,
} from './characterInferenceTypes';

function attachMessageMeta(
  candidates: CharacterCandidate[],
  input: CharacterInferenceInput,
): CharacterCandidate[] {
  const linked = collectLinkedPeople(input.text);
  return candidates.map((c) => ({
    ...c,
    sourceMessageIds: input.sourceMessageId ? [input.sourceMessageId] : c.sourceMessageIds,
    context: {
      ...buildInferenceContext(input.text, c.displayName, linked),
      ...c.context,
      emotionalWeight: c.context.emotionalWeight,
    },
    evidencePhrases:
      c.evidencePhrases.length > 0
        ? c.evidencePhrases
        : extractEvidencePhrases(input.text, c.displayName),
  }));
}

function applyWrongDomainGuard(
  candidate: CharacterCandidate,
  text: string,
  knownDomains?: CharacterInferenceInput['knownDomains'],
): CharacterCandidate | null {
  const key = normalizePersonNameKey(candidate.displayName);
  const known = knownDomains?.[key];
  if (known && known !== 'person') {
    return null;
  }

  const provenance = candidate.evidencePhrases.join(' ') || text;
  const domain = evaluateWrongDomain(candidate.displayName, provenance);
  if (domain.wrongDomain) {
    if (candidate.identityType === 'stage_name' || looksLikeStageOrNickname(candidate.displayName)) {
      if (/\b(he|she|they|him|her|was|is)\b/i.test(provenance)) return candidate;
    }
    return null;
  }

  if (isJunkTestData(candidate.displayName, provenance)) return null;
  return candidate;
}

function finalizeCandidate(
  candidate: CharacterCandidate,
  input: CharacterInferenceInput,
): CharacterCandidate {
  const promotionStatus = evaluatePromotionStatus(candidate, {
    mentionCount: input.mentionCount,
    userConfirmed: input.userConfirmed,
    evidenceText: input.text,
  });
  return { ...candidate, promotionStatus };
}

export class CharacterInferenceService {
  inferFromMessage(input: CharacterInferenceInput): CharacterInferenceResult {
    const rejected: CharacterInferenceResult['rejected'] = [];

    if (input.authorRole === 'assistant') {
      return { accepted: [], rejected: [{ displayName: '(assistant)', reason: 'assistant_generated' }] };
    }

    // Specialized patterns before generic full-name matching.
    const raw = [
      ...inferFamilyTitlePersons(input.text),
      ...inferHonorificPersons(input.text),
      ...inferContextualPersons(input.text),
      ...inferNamedPersons(input.text),
    ];

    const withMeta = attachMessageMeta(raw, input);
    const deduped = dedupeAmbiguousCandidates(withMeta);
    const accepted: CharacterCandidate[] = [];

    for (const candidate of deduped) {
      if (isBareTitleInvalid(candidate.displayName) || rejectBareWithoutContext(candidate.displayName)) {
        rejected.push({
          displayName: candidate.displayName,
          reason: 'bare_generic_without_context',
        });
        continue;
      }

      if (isBareGenericLabel(candidate.displayName) && !/\bfrom\b|\bwith\b/i.test(candidate.displayName)) {
        rejected.push({ displayName: candidate.displayName, reason: 'bare_generic_label' });
        continue;
      }

      const guarded = applyWrongDomainGuard(candidate, input.text, input.knownDomains);
      if (!guarded) {
        rejected.push({ displayName: candidate.displayName, reason: 'wrong_domain' });
        continue;
      }

      accepted.push(finalizeCandidate(guarded, input));
    }

    return { accepted, rejected };
  }

  canPromote(candidate: CharacterCandidate, opts: { mentionCount?: number; userConfirmed?: boolean }): boolean {
    return canPromoteToCharacterCard(candidate, opts);
  }
}

export const characterInferenceService = new CharacterInferenceService();
