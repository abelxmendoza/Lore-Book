import { normalizeNameKey } from '../../../utils/nameNormalization';
import { inferActivityToSkills, isBareVerbOnly } from './activityToSkillInference';
import { inferHobbySkills } from './hobbySkillInference';
import { inferLanguageSkills, isLanguageClassNotSkill } from './languageSkillInference';
import { inferMartialArtSkills } from './martialArtSkillInference';
import {
  inferNamedSkills,
  isBareGenericSkillWord,
  isProjectOrAppWord,
} from './namedSkillInference';
import {
  boostConfidenceForRepeatedMentions,
  canPromoteToSkillCard,
  evaluateSkillPromotionStatus,
} from './skillPromotionGate';
import {
  buildSkillContext,
  extractEvidencePhrases,
  hasProvenance,
} from './skillProvenanceService';
import { inferSkillProgression } from './skillProgressionInference';
import { inferToolSkills } from './toolSkillInference';
import { inferWorkSkills } from './workSkillInference';
import type {
  SkillCandidate,
  SkillInferenceInput,
  SkillInferenceResult,
} from './skillInferenceTypes';

function attachMessageMeta(
  candidates: SkillCandidate[],
  input: SkillInferenceInput,
): SkillCandidate[] {
  return candidates.map((c) => {
    const priorKey = normalizeNameKey(c.displayName);
    const priorMentions = input.priorMentionCounts?.[priorKey] ?? 0;
    const boosted = boostConfidenceForRepeatedMentions(c.confidence, priorMentions);

    return {
      ...c,
      confidence: boosted,
      sourceMessageIds: input.sourceMessageId ? [input.sourceMessageId] : c.sourceMessageIds,
      context: buildSkillContext(input.text, c.displayName, c.context),
      evidencePhrases:
        c.evidencePhrases.length > 0
          ? c.evidencePhrases
          : extractEvidencePhrases(input.text, c.displayName),
    };
  });
}

function dedupeSkills(candidates: SkillCandidate[]): SkillCandidate[] {
  const out: SkillCandidate[] = [];
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
  candidate: SkillCandidate,
  knownDomains?: SkillInferenceInput['knownDomains'],
): SkillCandidate | null {
  const key = normalizeNameKey(candidate.displayName);
  const known = knownDomains?.[key];
  if (known && known !== 'skill' && known !== 'project') {
    if (!candidate.context.activity && !candidate.context.proficiencyHint) return null;
  }
  if (known === 'person' || known === 'place' || known === 'event') return null;
  return candidate;
}

function finalizeCandidate(
  candidate: SkillCandidate,
  input: SkillInferenceInput,
): SkillCandidate {
  const priorKey = normalizeNameKey(candidate.displayName);
  const priorMentions = input.priorMentionCounts?.[priorKey] ?? 0;

  const promotionStatus = evaluateSkillPromotionStatus(candidate, {
    mentionCount: input.mentionCount,
    userConfirmed: input.userConfirmed,
    priorMentions,
  });

  return { ...candidate, promotionStatus };
}

export class SkillInferenceService {
  inferFromMessage(input: SkillInferenceInput): SkillInferenceResult {
    const rejected: SkillInferenceResult['rejected'] = [];

    if (input.authorRole === 'assistant') {
      return {
        accepted: [],
        rejected: [{ displayName: '(assistant)', reason: 'assistant_generated' }],
      };
    }

    if (isLanguageClassNotSkill(input.text)) {
      const classMatch = input.text.match(/\b(Japanese|Spanish|Italian|Korean|Portuguese)\s+Class\b/i);
      if (classMatch) {
        rejected.push({ displayName: classMatch[0], reason: 'language_class_is_group' });
      }
    }

    const raw = [
      ...inferMartialArtSkills(input.text),
      ...inferNamedSkills(input.text),
      ...inferWorkSkills(input.text),
      ...inferLanguageSkills(input.text),
      ...inferHobbySkills(input.text),
      ...inferActivityToSkills(input.text),
      ...inferSkillProgression(input.text),
      ...inferToolSkills(input.text),
    ];

    const withMeta = attachMessageMeta(raw, input);
    const deduped = dedupeSkills(withMeta);
    const accepted: SkillCandidate[] = [];

    for (const candidate of deduped) {
      if (isBareGenericSkillWord(candidate.displayName) || isBareVerbOnly(candidate.displayName)) {
        rejected.push({ displayName: candidate.displayName, reason: 'bare_generic_verb' });
        continue;
      }

      if (isProjectOrAppWord(candidate.displayName)) {
        rejected.push({ displayName: candidate.displayName, reason: 'project_not_skill' });
        continue;
      }

      if (!candidate.context.activity && !candidate.context.tool && candidate.confidence < 0.85) {
        const hasNamedSkill = candidate.skillType !== 'unknown_skill';
        if (!hasNamedSkill) {
          rejected.push({ displayName: candidate.displayName, reason: 'missing_domain_context' });
          continue;
        }
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
    candidate: SkillCandidate,
    opts: { mentionCount?: number; userConfirmed?: boolean; priorMentions?: number },
  ): boolean {
    return canPromoteToSkillCard(candidate, opts);
  }
}

export const skillInferenceService = new SkillInferenceService();
