import { normalizeNameKey } from '../../../utils/nameNormalization';
import { BARE_RELATIONSHIP_WORDS, inferContextualRelationships } from './contextualRelationshipInference';
import { inferFamilyRelationships } from './familyRelationshipInference';
import { inferFriendshipRelationships } from './friendshipRelationshipInference';
import { inferGroupMemberships } from './groupMembershipInference';
import {
  canPromoteToRelationshipCard,
  evaluateRelationshipPromotionStatus,
} from './relationshipPromotionGate';
import {
  buildRelationshipContext,
  extractEvidencePhrases,
  hasProvenance,
} from './relationshipProvenanceService';
import { inferRomanticRelationships } from './romanticRelationshipInference';
import { inferSchoolRelationships } from './schoolRelationshipInference';
import { inferWorkRelationships } from './workRelationshipInference';
import type {
  RelationshipCandidate,
  RelationshipInferenceInput,
  RelationshipInferenceResult,
} from './relationshipInferenceTypes';

function attachMessageMeta(
  candidates: RelationshipCandidate[],
  input: RelationshipInferenceInput,
): RelationshipCandidate[] {
  return candidates.map((c) => ({
    ...c,
    sourceMessageIds: input.sourceMessageId ? [input.sourceMessageId] : c.sourceMessageIds,
    context: buildRelationshipContext(input.text, c.evidencePhrases[0] ?? '', c.context),
    evidencePhrases:
      c.evidencePhrases.length > 0
        ? c.evidencePhrases
        : extractEvidencePhrases(input.text, c.subject.displayName),
  }));
}

function dedupeRelationships(candidates: RelationshipCandidate[]): RelationshipCandidate[] {
  const out: RelationshipCandidate[] = [];
  for (const candidate of candidates) {
    const key = `${normalizeNameKey(candidate.subject.displayName)}:${candidate.predicate}:${normalizeNameKey(candidate.object.displayName)}`;
    const idx = out.findIndex(
      (c) =>
        `${normalizeNameKey(c.subject.displayName)}:${c.predicate}:${normalizeNameKey(c.object.displayName)}` ===
        key,
    );
    if (idx >= 0) {
      const existing = out[idx];
      out[idx] = {
        ...existing,
        confidence: Math.max(existing.confidence, candidate.confidence),
        evidencePhrases: [...new Set([...existing.evidencePhrases, ...candidate.evidencePhrases])],
        sourceMessageIds: [...new Set([...existing.sourceMessageIds, ...candidate.sourceMessageIds])],
        context: { ...existing.context, ...candidate.context },
        requiresReview: existing.requiresReview || candidate.requiresReview,
        sensitive: existing.sensitive || candidate.sensitive,
      };
    } else {
      out.push(candidate);
    }
  }
  return out;
}

function hasValidEndpoints(candidate: RelationshipCandidate): boolean {
  if (!candidate.subject.displayName || !candidate.object.displayName) return false;
  if (candidate.subject.unresolved && candidate.object.unresolved) return false;
  if (BARE_RELATIONSHIP_WORDS.has(candidate.subject.displayName.toLowerCase())) return false;
  if (BARE_RELATIONSHIP_WORDS.has(candidate.object.displayName.toLowerCase())) return false;
  return true;
}

function applyWrongDomainGuard(
  candidate: RelationshipCandidate,
  knownDomains?: RelationshipInferenceInput['knownDomains'],
): RelationshipCandidate | null {
  const subjectKey = normalizeNameKey(candidate.subject.displayName);
  const objectKey = normalizeNameKey(candidate.object.displayName);
  const subjectKnown = knownDomains?.[subjectKey];
  const objectKnown = knownDomains?.[objectKey];

  if (subjectKnown === 'junk' || objectKnown === 'junk') return null;
  if (subjectKnown === 'place' && !candidate.subject.unresolved) return null;
  if (objectKnown === 'place' && candidate.relationshipType !== 'school') return null;

  return candidate;
}

function finalizeCandidate(
  candidate: RelationshipCandidate,
  input: RelationshipInferenceInput,
): RelationshipCandidate {
  const key = `${normalizeNameKey(candidate.subject.displayName)}:${candidate.predicate}`;
  const priorMentions = input.priorMentionCounts?.[key] ?? 0;

  return {
    ...candidate,
    promotionStatus: evaluateRelationshipPromotionStatus(candidate, {
      mentionCount: input.mentionCount,
      userConfirmed: input.userConfirmed,
      priorMentions,
    }),
  };
}

export class RelationshipInferenceService {
  inferFromMessage(input: RelationshipInferenceInput): RelationshipInferenceResult {
    const rejected: RelationshipInferenceResult['rejected'] = [];

    if (input.authorRole === 'assistant') {
      return {
        accepted: [],
        rejected: [{ displayName: '(assistant)', reason: 'assistant_generated' }],
      };
    }

    const raw = [
      ...inferFamilyRelationships(input.text, input.resolvedEntities),
      ...inferFriendshipRelationships(input.text),
      ...inferRomanticRelationships(input.text),
      ...inferWorkRelationships(input.text),
      ...inferSchoolRelationships(input.text),
      ...inferGroupMemberships(input.text),
      ...inferContextualRelationships(input.text),
    ];

    const withMeta = attachMessageMeta(raw, input);
    const deduped = dedupeRelationships(withMeta);
    const accepted: RelationshipCandidate[] = [];

    for (const candidate of deduped) {
      if (!hasValidEndpoints(candidate)) {
        rejected.push({
          displayName: `${candidate.subject.displayName} ${candidate.predicate} ${candidate.object.displayName}`,
          reason: 'missing_endpoints',
        });
        continue;
      }

      const guarded = applyWrongDomainGuard(candidate, input.knownDomains);
      if (!guarded) {
        rejected.push({
          displayName: candidate.subject.displayName,
          reason: 'wrong_domain',
        });
        continue;
      }

      if (!hasProvenance(guarded)) {
        rejected.push({
          displayName: candidate.subject.displayName,
          reason: 'missing_provenance',
        });
        continue;
      }

      accepted.push(finalizeCandidate(guarded, input));
    }

    return { accepted, rejected };
  }

  canPromote(
    candidate: RelationshipCandidate,
    opts: { mentionCount?: number; userConfirmed?: boolean; priorMentions?: number },
  ): boolean {
    return canPromoteToRelationshipCard(candidate, opts);
  }
}

export const relationshipInferenceService = new RelationshipInferenceService();
