import { normalizeNameKey } from '../../../utils/nameNormalization';
import { inferEventStatus } from './eventStatusInference';
import { recordLifecycleTransitions } from './lifecycleTimelineService';
import { inferProjectTransitionPairs } from './projectStatusInference';
import { inferQuestLogStatus } from './questLogStatusInference';
import { inferRelationshipStatus } from './relationshipStatusInference';
import {
  extractEvidencePhrases,
  hasProvenance,
  hasUncertaintyLanguage,
  shouldCreateStatusCard,
} from './statusProvenanceService';
import { statusHistoryPreserved } from './statusTransitionResolver';
import { inferSkillStatus } from './skillStatusInference';
import type {
  LifecycleEntry,
  StatusInferenceInput,
  StatusInferenceResult,
  StatusSignal,
} from './statusInferenceTypes';
import { inferWorkStatus } from './workStatusInference';

function dedupeSignals(signals: StatusSignal[]): StatusSignal[] {
  const out: StatusSignal[] = [];
  for (const signal of signals) {
    const key = `${signal.attachedToType}:${normalizeNameKey(signal.inferredTitle ?? '')}:${signal.status}:${signal.transition ?? ''}`;
    const idx = out.findIndex(
      (s) =>
        `${s.attachedToType}:${normalizeNameKey(s.inferredTitle ?? '')}:${s.status}:${s.transition ?? ''}` === key,
    );
    if (idx >= 0) {
      const existing = out[idx];
      out[idx] = {
        ...existing,
        confidence: Math.max(existing.confidence, signal.confidence),
        evidencePhrases: [...new Set([...existing.evidencePhrases, ...signal.evidencePhrases])],
        sourceMessageIds: [...new Set([...existing.sourceMessageIds, ...signal.sourceMessageIds])],
        requiresReview: existing.requiresReview || signal.requiresReview,
      };
    } else {
      out.push(signal);
    }
  }
  return out;
}

function finalizeSignal(signal: StatusSignal, input: StatusInferenceInput): StatusSignal {
  const uncertain = hasUncertaintyLanguage(input.text);
  return {
    ...signal,
    sourceMessageIds: input.sourceMessageId ? [input.sourceMessageId] : signal.sourceMessageIds,
    evidencePhrases:
      signal.evidencePhrases.length > 0
        ? signal.evidencePhrases
        : extractEvidencePhrases(input.text, signal.inferredTitle),
    status: uncertain ? 'uncertain' : signal.status,
    requiresReview: signal.requiresReview || uncertain,
    inferredNotConfirmed: signal.inferredNotConfirmed || uncertain,
  };
}

export class StatusInferenceService {
  inferFromMessage(
    input: StatusInferenceInput,
  ): StatusInferenceResult & { lifecycleState: Record<string, LifecycleEntry[]> } {
    const rejected: StatusInferenceResult['rejected'] = [];

    if (input.authorRole === 'assistant') {
      return {
        accepted: [],
        rejected: [{ inferredTitle: '(assistant)', reason: 'assistant_generated' }],
        lifecycle: [],
        lifecycleState: input.priorLifecycle ?? {},
      };
    }

    const raw = [
      ...inferRelationshipStatus(input.text),
      ...inferProjectTransitionPairs(input.text),
      ...inferQuestLogStatus(input.text),
      ...inferWorkStatus(input.text),
      ...inferSkillStatus(input.text),
      ...inferEventStatus(input.text),
    ];

    const withMeta = raw.map((s) => finalizeSignal(s, input));
    const deduped = dedupeSignals(withMeta);
    const accepted: StatusSignal[] = [];

    for (const signal of deduped) {
      if (shouldCreateStatusCard(signal)) {
        rejected.push({ inferredTitle: signal.inferredTitle ?? '', reason: 'status_not_book_card' });
        continue;
      }

      if (!signal.inferredTitle) {
        rejected.push({ inferredTitle: '', reason: 'missing_attachment_title' });
        continue;
      }

      if (!hasProvenance(signal)) {
        rejected.push({ inferredTitle: signal.inferredTitle, reason: 'missing_provenance' });
        continue;
      }

      accepted.push(signal);
    }

    const priorFlat = Object.values(input.priorLifecycle ?? {}).flat();
    const { lifecycle, state } = recordLifecycleTransitions(
      accepted,
      input.priorLifecycle ?? {},
      input.seenAt,
    );

    const nextFlat = Object.values(state).flat();
    if (!statusHistoryPreserved(priorFlat, nextFlat) && priorFlat.length > 0) {
      // Safety: never shrink history
      return {
        accepted,
        rejected,
        lifecycle,
        lifecycleState: input.priorLifecycle ?? {},
      };
    }

    return { accepted, rejected, lifecycle, lifecycleState: state };
  }
}

export const statusInferenceService = new StatusInferenceService();

export { hasProvenance, shouldCreateStatusCard, hasUncertaintyLanguage };
