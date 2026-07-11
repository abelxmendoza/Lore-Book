import { normalizeNameKey } from '../../../utils/nameNormalization';
import { inferDislikes } from './dislikeInferenceService';
import { inferExplicitPreferences } from './explicitPreferenceInference';
import { inferFavorites } from './favoriteInferenceService';
import { inferImplicitPreferences } from './implicitPreferenceInference';
import { attachPreferenceTarget, inferDomain } from './preferenceAttachmentService';
import {
  evaluatePromotionStatus,
  extractEvidencePhrases,
  hasProvenance,
  isQuotedOnlyMention,
  isThirdPartyPreference,
  requiresSensitiveReview,
  shouldCreatePreferenceCard,
} from './preferenceProvenanceService';
import type {
  PreferenceInferenceInput,
  PreferenceInferenceResult,
  PreferenceSignal,
} from './preferenceInferenceTypes';
import {
  boostConfidenceForStrength,
  strengthFromMentionCount,
} from './preferenceStrengthScorer';
import { inferTasteProfiles } from './tasteProfileInference';
import { extractPreferenceLifecycle } from '../../memoryQuality/preferenceStability';

const LOREBOOK_PRODUCT_PATTERNS: Array<{ re: RegExp; displayName: string; preferenceType: PreferenceSignal['preferenceType'] }> = [
  { re: /\bI want mystical UI\b/i, displayName: 'mystical UI', preferenceType: 'style' },
  { re: /\bI want entity chips\b/i, displayName: 'entity chips', preferenceType: 'value' },
  { re: /\bI don'?t want forgetful AI\b/i, displayName: 'non-forgetful AI', preferenceType: 'avoidance' },
];

function inferLoreBookProductPreferences(text: string): PreferenceSignal[] {
  if (!/\bLoreBook\b/i.test(text) && !/\b(?:UI|entity chips|forgetful AI|generic AI)\b/i.test(text)) {
    return [];
  }

  const out: PreferenceSignal[] = [];
  for (const { re, displayName, preferenceType } of LOREBOOK_PRODUCT_PATTERNS) {
    const match = re.exec(text);
    if (!match) continue;
    out.push({
      displayName,
      preferenceType,
      domain: 'product',
      strength: 'strong',
      attachedTo: { entityType: 'project', inferredTitle: 'LoreBook' },
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.88,
      inferredNotConfirmed: false,
      requiresReview: false,
      temporal: { currentStatus: 'current', evidenceCount: 1 },
      promotionStatus: 'suggested_profile_memory',
    });
  }
  return out;
}

/** Attach lifecycleKind from deterministic classifier when subjects match. */
function attachLifecycleKinds(text: string, signals: PreferenceSignal[]): PreferenceSignal[] {
  const lifecycle = extractPreferenceLifecycle(text);
  if (lifecycle.length === 0) return signals;
  return signals.map((s) => {
    const hit = lifecycle.find(
      (l) =>
        s.displayName.toLowerCase().includes(l.subject.toLowerCase()) ||
        l.subject.toLowerCase().includes(s.displayName.toLowerCase()) ||
        s.evidencePhrases.some((e) => e.toLowerCase().includes(l.evidence.toLowerCase().slice(0, 20))),
    );
    if (!hit) return s;
    // Identity-level strength when lifecycle is identity
    const strength =
      hit.lifecycleKind === 'identity'
        ? 'identity_level'
        : hit.lifecycleKind === 'temporary'
          ? 'weak'
          : s.strength;
    return {
      ...s,
      lifecycleKind: hit.lifecycleKind,
      strength,
      confidence: Math.min(0.95, Math.max(s.confidence, hit.confidence * 0.95)),
    };
  });
}

function dedupePreferences(candidates: PreferenceSignal[]): PreferenceSignal[] {
  const typePriority: Record<PreferenceSignal['preferenceType'], number> = {
    favorite: 10,
    value: 9,
    avoidance: 8,
    dislike: 7,
    affinity: 6,
    like: 5,
    taste: 4,
    aesthetic: 4,
    style: 4,
    habit: 3,
    unknown_preference: 1,
  };

  const out: PreferenceSignal[] = [];
  for (const candidate of candidates) {
    const key = normalizeNameKey(candidate.displayName);
    const idx = out.findIndex((c) => normalizeNameKey(c.displayName) === key);
    if (idx >= 0) {
      const existing = out[idx];
      const keep =
        typePriority[candidate.preferenceType] >= typePriority[existing.preferenceType]
          ? candidate
          : existing;
      const merge =
        typePriority[candidate.preferenceType] >= typePriority[existing.preferenceType]
          ? existing
          : candidate;
      out[idx] = {
        ...keep,
        confidence: Math.max(existing.confidence, candidate.confidence),
        strength:
          existing.strength === 'identity_level' || candidate.strength === 'identity_level'
            ? 'identity_level'
            : existing.strength === 'favorite' || candidate.strength === 'favorite'
              ? 'favorite'
              : keep.strength,
        evidencePhrases: [...new Set([...existing.evidencePhrases, ...candidate.evidencePhrases])],
        sourceMessageIds: [...new Set([...existing.sourceMessageIds, ...candidate.sourceMessageIds])],
        requiresReview: existing.requiresReview || candidate.requiresReview,
        temporal: {
          ...merge.temporal,
          ...keep.temporal,
          evidenceCount: existing.temporal.evidenceCount + candidate.temporal.evidenceCount,
        },
      };
    } else {
      out.push(candidate);
    }
  }
  return out;
}

function finalizeSignal(signal: PreferenceSignal, input: PreferenceInferenceInput): PreferenceSignal {
  const key = normalizeNameKey(signal.displayName);
  const priorMentions = input.priorMentionCounts?.[key] ?? 0;
  const evidenceCount = signal.temporal.evidenceCount + priorMentions;
  const strength =
    signal.strength === 'identity_level' || signal.strength === 'favorite'
      ? signal.strength
      : strengthFromMentionCount(evidenceCount) !== 'weak'
        ? strengthFromMentionCount(evidenceCount)
        : signal.strength;

  const withMeta: PreferenceSignal = {
    ...signal,
    strength,
    confidence: boostConfidenceForStrength(signal.confidence, strength),
    sourceMessageIds: input.sourceMessageId ? [input.sourceMessageId] : signal.sourceMessageIds,
    evidencePhrases:
      signal.evidencePhrases.length > 0
        ? signal.evidencePhrases
        : extractEvidencePhrases(input.text, signal.displayName),
    attachedTo:
      signal.attachedTo ??
      attachPreferenceTarget(signal.displayName, input.text, inferDomain(signal.displayName, input.text)),
    requiresReview: signal.requiresReview || requiresSensitiveReview(input.text, signal.displayName),
    temporal: {
      firstSeenAt: input.seenAt,
      lastSeenAt: input.seenAt,
      currentStatus: signal.temporal.currentStatus,
      evidenceCount,
    },
    inferredNotConfirmed: signal.inferredNotConfirmed && !input.userConfirmed,
  };

  return {
    ...withMeta,
    promotionStatus: evaluatePromotionStatus(withMeta, {
      mentionCount: evidenceCount,
      userConfirmed: input.userConfirmed,
    }),
  };
}

export class PreferenceInferenceService {
  inferFromMessage(input: PreferenceInferenceInput): PreferenceInferenceResult {
    const rejected: PreferenceInferenceResult['rejected'] = [];

    if (input.authorRole === 'assistant') {
      return { accepted: [], rejected: [{ displayName: '(assistant)', reason: 'assistant_generated' }] };
    }

    if (isThirdPartyPreference(input.text)) {
      return { accepted: [], rejected: [{ displayName: '(third party)', reason: 'third_party_preference' }] };
    }

    if (isQuotedOnlyMention(input.text)) {
      return { accepted: [], rejected: [{ displayName: '(quoted)', reason: 'quoted_text_only' }] };
    }

    const raw = [
      ...inferExplicitPreferences(input.text),
      ...inferFavorites(input.text),
      ...inferDislikes(input.text),
      ...inferImplicitPreferences(input.text),
      ...inferTasteProfiles(input.text),
      ...inferLoreBookProductPreferences(input.text),
    ];

    const deduped = attachLifecycleKinds(input.text, dedupePreferences(raw));
    const accepted: PreferenceSignal[] = [];

    for (const candidate of deduped) {
      const finalized = finalizeSignal(candidate, input);

      if (shouldCreatePreferenceCard(finalized)) {
        rejected.push({ displayName: finalized.displayName, reason: 'preference_not_book_card' });
        continue;
      }

      if (
        finalized.inferredNotConfirmed &&
        finalized.strength === 'weak' &&
        finalized.promotionStatus === 'weak_signal' &&
        finalized.temporal.evidenceCount < 2
      ) {
        rejected.push({ displayName: finalized.displayName, reason: 'weak_unconfirmed_signal' });
        continue;
      }

      if (!hasProvenance(finalized)) {
        rejected.push({ displayName: finalized.displayName, reason: 'missing_provenance' });
        continue;
      }

      accepted.push(finalized);
    }

    return { accepted, rejected };
  }
}

export const preferenceInferenceService = new PreferenceInferenceService();

export {
  hasProvenance,
  shouldCreatePreferenceCard,
  requiresSensitiveReview,
  isThirdPartyPreference,
};
