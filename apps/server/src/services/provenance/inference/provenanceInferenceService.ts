import { applyCorrection, correctionSupersedes } from './correctionProvenanceService';
import {
  detectContradiction,
  preserveBothSides,
} from './contradictionProvenanceService';
import {
  buildBundleFromCandidate,
  buildManualEditBundle,
  extractClaimCandidates,
} from './evidenceBundleBuilder';
import {
  applySensitiveReviewGate,
  capAssistantTruthState,
  hasProvenance,
  isDurableCandidate,
  rejectReason,
  shouldCreateProvenanceCard,
} from './provenanceIntegrityGuard';
import type {
  EvidenceBundle,
  ProvenanceInferenceInput,
  ProvenanceInferenceResult,
} from './provenanceInferenceTypes';

function countMentions(
  candidateClaim: string,
  priorBundles: EvidenceBundle[],
): number {
  const key = candidateClaim.toLowerCase().slice(0, 24);
  return priorBundles.filter((b) => b.claimText.toLowerCase().includes(key.slice(0, 12))).length + 1;
}

function finalizeBundle(
  bundle: EvidenceBundle,
  input: ProvenanceInferenceInput,
  priorBundles: EvidenceBundle[],
): EvidenceBundle {
  let next = capAssistantTruthState(bundle);
  next = applySensitiveReviewGate(next);

  if (!next.sourceMessageId && input.sourceMessageId) {
    next = { ...next, sourceMessageId: input.sourceMessageId };
  }
  if (!next.sourceThreadId && input.sourceThreadId) {
    next = { ...next, sourceThreadId: input.sourceThreadId };
  }

  const mentions = countMentions(next.claimText, priorBundles);
  if (mentions >= 2 && next.origin === 'explicit_user_statement' && next.truthState === 'candidate') {
    next = { ...next, confidence: Math.min(0.97, next.confidence + 0.03) };
  }

  return next;
}

export class ProvenanceInferenceService {
  inferFromMessage(input: ProvenanceInferenceInput): ProvenanceInferenceResult {
    const rejected: ProvenanceInferenceResult['rejected'] = [];
    const accepted: EvidenceBundle[] = [];
    const corrections: ProvenanceInferenceResult['corrections'] = [];
    const contradictions: ProvenanceInferenceResult['contradictions'] = [];
    let bundleHistory: EvidenceBundle[] = [...(input.priorBundles ?? [])];

    if (input.manualEdit) {
      const manual = buildManualEditBundle(input);
      if (!manual) {
        rejected.push({ claimText: input.manualEdit.claimText, reason: 'invalid_manual_edit' });
        return { accepted, rejected, corrections, contradictions, bundleHistory };
      }

      const finalized = finalizeBundle(manual, input, bundleHistory);
      const reason = rejectReason(finalized);
      if (reason) {
        rejected.push({ claimText: finalized.claimText, reason });
      } else {
        accepted.push(finalized);
        bundleHistory = [...bundleHistory, finalized];
      }
      return { accepted, rejected, corrections, contradictions, bundleHistory };
    }

    const candidates = extractClaimCandidates(input.text, input);

    for (const candidate of candidates) {
      let bundle = buildBundleFromCandidate(candidate, input, {
        requiresReview: false,
        mentionCount: countMentions(candidate.claimText, bundleHistory),
      });
      bundle = finalizeBundle(bundle, input, bundleHistory);

      if (shouldCreateProvenanceCard(bundle)) {
        rejected.push({ claimText: bundle.claimText, reason: 'provenance_not_book_card' });
        continue;
      }

      const reason = rejectReason(bundle);
      if (reason) {
        rejected.push({ claimText: bundle.claimText, reason });
        continue;
      }

      if (!hasProvenance(bundle) && bundle.sourceType !== 'assistant_response') {
        rejected.push({ claimText: bundle.claimText, reason: 'missing_provenance' });
        continue;
      }

      if (!isDurableCandidate(bundle)) {
        rejected.push({ claimText: bundle.claimText, reason: 'not_durable_candidate' });
        continue;
      }

      const contradiction = detectContradiction(bundle, bundleHistory);
      if (contradiction) {
        const [oldMarked, newMarked] = preserveBothSides(contradiction.oldBundle, bundle);
        bundleHistory = bundleHistory.map((b) =>
          b.id === oldMarked.id ? oldMarked : b,
        );
        bundleHistory.push(newMarked);
        contradictions.push(contradiction.record);
        accepted.push(newMarked);
        continue;
      }

      if (bundle.origin === 'user_corrected' || input.sourceType === 'user_correction') {
        const { correction, superseded, history } = applyCorrection(bundle, input, bundleHistory);
        bundleHistory = history;
        if (superseded) {
          bundleHistory = bundleHistory.map((b) => (b.id === superseded!.id ? superseded! : b));
        }
        corrections.push(correction);
        bundle = { ...bundle, correctedFromId: correction.oldEvidenceId, truthState: 'confirmed' };
      }

      const supersededExisting = bundleHistory.find(
        (existing) =>
          existing.claimType === bundle.claimType &&
          existing.claimText !== bundle.claimText &&
          correctionSupersedes(bundle, existing),
      );
      if (supersededExisting) {
        bundleHistory = bundleHistory.map((b) =>
          b.id === supersededExisting.id
            ? { ...b, truthState: 'archived', supersededById: bundle.id }
            : b,
        );
      }

      accepted.push(bundle);
      bundleHistory.push(bundle);
    }

    return { accepted, rejected, corrections, contradictions, bundleHistory };
  }
}

export const provenanceInferenceService = new ProvenanceInferenceService();

export {
  hasProvenance,
  shouldCreateProvenanceCard,
  applySensitiveReviewGate,
  capAssistantTruthState,
};
