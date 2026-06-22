import { normalizeNameKey } from '../../../utils/nameNormalization';
import { inferDevices } from './deviceInference';
import { inferLostFoundObjects } from './lostFoundObjectInference';
import { inferNamedObjects, isBareGenericObject } from './namedObjectInference';
import {
  boostConfidenceForRepeatedMentions,
  canPromoteToObjectCard,
  evaluateObjectPromotionStatus,
} from './objectPromotionGate';
import {
  buildObjectContext,
  extractEvidencePhrases,
  hasProvenance,
} from './objectProvenanceService';
import { inferPossessions } from './possessionInference';
import {
  getConsumerAppRejections,
  isConsumerAppReference,
  isProjectOrConceptWord,
  shouldAllowProjectLink,
} from './productReferenceGuard';
import { inferRepairObjects } from './repairObjectInference';
import { inferToolObjects } from './toolObjectInference';
import { inferVehicleObjects } from './vehicleObjectInference';
import type {
  ObjectCandidate,
  ObjectInferenceInput,
  ObjectInferenceResult,
} from './objectInferenceTypes';

function attachMessageMeta(
  candidates: ObjectCandidate[],
  input: ObjectInferenceInput,
): ObjectCandidate[] {
  return candidates.map((c) => {
    const priorKey = normalizeNameKey(c.displayName);
    const priorMentions = input.priorMentionCounts?.[priorKey] ?? 0;
    const boosted = boostConfidenceForRepeatedMentions(
      c.confidence,
      priorMentions,
      c.context.userRelationship,
    );

    return {
      ...c,
      confidence: boosted,
      sourceMessageIds: input.sourceMessageId ? [input.sourceMessageId] : c.sourceMessageIds,
      context: buildObjectContext(input.text, c.displayName, c.context),
      evidencePhrases:
        c.evidencePhrases.length > 0
          ? c.evidencePhrases
          : extractEvidencePhrases(input.text, c.displayName),
    };
  });
}

function dedupeObjects(candidates: ObjectCandidate[]): ObjectCandidate[] {
  const out: ObjectCandidate[] = [];
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
        linkedProjectName: existing.linkedProjectName ?? candidate.linkedProjectName,
      };
    } else {
      out.push(candidate);
    }
  }
  return out;
}

function applyWrongDomainGuard(
  candidate: ObjectCandidate,
  knownDomains?: ObjectInferenceInput['knownDomains'],
): ObjectCandidate | null {
  const key = normalizeNameKey(candidate.displayName);
  const known = knownDomains?.[key];
  if (known === 'person' || known === 'place' || known === 'event' || known === 'group') {
    return null;
  }
  if (known === 'project' && !candidate.linkedProjectName && !candidate.context.projectContext) {
    return null;
  }
  if (known === 'concept') return null;
  return candidate;
}

function finalizeCandidate(
  candidate: ObjectCandidate,
  input: ObjectInferenceInput,
): ObjectCandidate {
  const priorKey = normalizeNameKey(candidate.displayName);
  const priorMentions = input.priorMentionCounts?.[priorKey] ?? 0;

  const promotionStatus = evaluateObjectPromotionStatus(candidate, {
    mentionCount: input.mentionCount,
    userConfirmed: input.userConfirmed,
    priorMentions,
  });

  return { ...candidate, promotionStatus };
}

function enrichProjectLinks(candidates: ObjectCandidate[], text: string): ObjectCandidate[] {
  return candidates.map((c) => {
    if (c.objectType === 'robot' && shouldAllowProjectLink(text, c.displayName)) {
      return {
        ...c,
        linkedProjectName: c.displayName,
        context: { ...c.context, projectContext: c.displayName },
      };
    }
    return c;
  });
}

export class ObjectInferenceService {
  inferFromMessage(input: ObjectInferenceInput): ObjectInferenceResult {
    const rejected: ObjectInferenceResult['rejected'] = [
      ...getConsumerAppRejections(input.text),
    ];
    const linkedSkillHints: string[] = [];

    if (input.authorRole === 'assistant') {
      return {
        accepted: [],
        rejected: [{ displayName: '(assistant)', reason: 'assistant_generated' }],
        lostFoundHints: [],
        linkedSkillHints: [],
      };
    }

    const lostFound = inferLostFoundObjects(input.text);
    const repair = inferRepairObjects(input.text);
    linkedSkillHints.push(...repair.skillHints);

    const raw = enrichProjectLinks(
      [
        ...inferPossessions(input.text),
        ...inferVehicleObjects(input.text),
        ...inferDevices(input.text),
        ...inferToolObjects(input.text),
        ...inferNamedObjects(input.text),
        ...lostFound.objects,
        ...repair.objects,
      ],
      input.text,
    );

    const withMeta = attachMessageMeta(raw, input);
    const deduped = dedupeObjects(withMeta);
    const accepted: ObjectCandidate[] = [];

    for (const candidate of deduped) {
      if (isBareGenericObject(candidate.displayName) || isProjectOrConceptWord(candidate.displayName)) {
        rejected.push({ displayName: candidate.displayName, reason: 'bare_generic_object' });
        continue;
      }

      if (isConsumerAppReference(input.text) && /find my/i.test(candidate.displayName)) {
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

    return {
      accepted,
      rejected,
      lostFoundHints: lostFound.hints,
      linkedSkillHints: [...new Set(linkedSkillHints)],
    };
  }

  canPromote(
    candidate: ObjectCandidate,
    opts: { mentionCount?: number; userConfirmed?: boolean; priorMentions?: number },
  ): boolean {
    return canPromoteToObjectCard(candidate, opts);
  }
}

export const objectInferenceService = new ObjectInferenceService();
