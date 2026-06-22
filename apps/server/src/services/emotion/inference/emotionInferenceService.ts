import { normalizeNameKey } from '../../../utils/nameNormalization';
import { attachEmotionToNearestTarget } from './emotionAttachmentService';
import {
  appendArcPhase,
  extractArcPersonKey,
  mergeArcStates,
  type EmotionalArcState,
} from './emotionalArcInferenceService';
import { boostConfidenceForWeight, scoreEmotionalWeight } from './emotionalWeightScorer';
import { inferAllEmotionSignals } from './emotionPatternExtractors';
import type {
  EmotionInferenceInput,
  EmotionInferenceResult,
  EmotionSignal,
} from './emotionInferenceTypes';
import {
  extractEvidencePhrases,
  hasProvenance,
  requiresSensitiveReview,
  shouldCreateEmotionBookCard,
} from './emotionProvenanceService';
import {
  attachSignificanceToSignals,
  inferSignificanceFromText,
} from './significanceInferenceService';
import { inferSentimentFromText } from './sentimentInferenceService';

function dedupeSignals(signals: EmotionSignal[]): EmotionSignal[] {
  const out: EmotionSignal[] = [];
  for (const signal of signals) {
    const key = `${signal.emotionType}:${normalizeNameKey(signal.attachedTo.inferredTitle ?? '')}`;
    const idx = out.findIndex(
      (s) =>
        `${s.emotionType}:${normalizeNameKey(s.attachedTo.inferredTitle ?? '')}` === key,
    );
    if (idx >= 0) {
      const existing = out[idx];
      out[idx] = {
        ...existing,
        confidence: Math.max(existing.confidence, signal.confidence),
        evidencePhrases: [...new Set([...existing.evidencePhrases, ...signal.evidencePhrases])],
        sourceMessageIds: [...new Set([...existing.sourceMessageIds, ...signal.sourceMessageIds])],
        requiresReview: existing.requiresReview || signal.requiresReview,
        emotionalWeight: Math.max(existing.emotionalWeight ?? 0, signal.emotionalWeight ?? 0),
      };
    } else {
      out.push(signal);
    }
  }
  return out;
}

function applyArcPhases(
  signals: EmotionSignal[],
  text: string,
  priorArcPhases: EmotionalArcState = {},
): { signals: EmotionSignal[]; arcState: EmotionalArcState } {
  let arcState = { ...priorArcPhases };
  const personKey = extractArcPersonKey(text);
  if (!personKey) return { signals, arcState };

  const updated = signals.map((signal) => {
    const attachedPerson = signal.attachedTo.inferredTitle;
    const key =
      attachedPerson && normalizeNameKey(attachedPerson).includes(personKey)
        ? normalizeNameKey(attachedPerson)
        : personKey;
    const { arcPhase, updatedArc } = appendArcPhase(arcState, key, signal.emotionType);
    arcState = updatedArc;
    return { ...signal, arcPhase };
  });

  return { signals: updated, arcState };
}

function finalizeSignal(
  signal: EmotionSignal,
  input: EmotionInferenceInput,
  sensitive: boolean,
): EmotionSignal {
  const weight = signal.emotionalWeight ?? scoreEmotionalWeight(input.text);
  return {
    ...signal,
    sourceMessageIds: input.sourceMessageId ? [input.sourceMessageId] : signal.sourceMessageIds,
    evidencePhrases:
      signal.evidencePhrases.length > 0
        ? signal.evidencePhrases
        : extractEvidencePhrases(input.text),
    confidence: boostConfidenceForWeight(signal.confidence, weight),
    requiresReview: signal.requiresReview || sensitive,
    emotionalWeight: weight,
    attachedTo: signal.attachedTo.inferredTitle
      ? signal.attachedTo
      : attachEmotionToNearestTarget(input.text, input.text, input.knownEntities),
  };
}

export class EmotionInferenceService {
  inferFromMessage(input: EmotionInferenceInput): EmotionInferenceResult & { arcState: EmotionalArcState } {
    const rejected: EmotionInferenceResult['rejected'] = [];

    if (input.authorRole === 'assistant') {
      return {
        accepted: [],
        rejected: [{ reason: 'assistant_generated' }],
        significance: [],
        arcState: input.priorArcPhases ?? {},
      };
    }

    const sensitive = requiresSensitiveReview(input.text);
    const significance = inferSignificanceFromText(input.text, input.knownEntities);
    const raw = inferAllEmotionSignals(input.text, input.knownEntities);

    const withMeta = raw.map((s) => finalizeSignal(s, input, sensitive));
    const deduped = dedupeSignals(withMeta);
    const { signals: withArc, arcState } = applyArcPhases(
      deduped,
      input.text,
      input.priorArcPhases ?? {},
    );

    const sentiment = inferSentimentFromText(
      input.text,
      withArc.map((s) => s.emotionType),
    );
    const withSentiment = withArc.map((s) =>
      s.emotionType === 'mixed' ? s : { ...s, sentiment: s.sentiment ?? sentiment },
    );
    const withSignificance = attachSignificanceToSignals(withSentiment, significance);

    const accepted: EmotionSignal[] = [];
    for (const signal of withSignificance) {
      if (shouldCreateEmotionBookCard(signal)) {
        rejected.push({ reason: 'standalone_emotion_card_forbidden', emotionType: signal.emotionType });
        continue;
      }

      if (!signal.attachedTo.inferredTitle && !signal.attachedTo.entityId) {
        rejected.push({ reason: 'missing_attachment_target', emotionType: signal.emotionType });
        continue;
      }

      if (!hasProvenance(signal)) {
        rejected.push({ reason: 'missing_provenance', emotionType: signal.emotionType });
        continue;
      }

      accepted.push(signal);
    }

    return {
      accepted,
      rejected,
      significance,
      arcState: mergeArcStates(input.priorArcPhases ?? {}, arcState),
    };
  }
}

export const emotionInferenceService = new EmotionInferenceService();

export { hasProvenance, shouldCreateEmotionBookCard, requiresSensitiveReview };
