import { originOutranks } from './provenanceConfidenceScorer';
import type {
  CorrectionRecord,
  EvidenceBundle,
  ProvenanceInferenceInput,
} from './provenanceInferenceTypes';

export type DetectedCorrection = {
  oldClaimText: string;
  newClaimText: string;
  sourceQuote: string;
};

const NAME_CORRECTION =
  /\b(?:actually|correction:?)\s+(?:(?:his|her|their)|[A-Z][A-Za-z]*(?:['’][A-Za-z]+)?(?:\s+[A-Z][A-Za-z]+)*)\s+name\s+is\s+(.+?)[.!?]?\s*$/i;

export function detectCorrection(text: string): DetectedCorrection | null {
  const match = NAME_CORRECTION.exec(text);
  if (!match) return null;

  const correctedName = match[1].trim();
  const oldNameMatch = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
  const oldName = oldNameMatch?.[1]?.trim();

  return {
    oldClaimText: oldName ? `Person name is ${oldName}` : 'Prior name claim',
    newClaimText: `Person name is ${correctedName}`,
    sourceQuote: text.trim(),
  };
}

export function findSupersededBundle(
  correction: DetectedCorrection,
  priorBundles: EvidenceBundle[],
): EvidenceBundle | undefined {
  const subject = correction.newClaimText.replace(/^Person name is\s+/i, '').toLowerCase();
  return priorBundles.find((b) => {
    if (b.claimType !== 'identity' && b.claimType !== 'relationship') return false;
    if (b.truthState === 'archived' || b.truthState === 'rejected') return false;
    const blob = `${b.claimText} ${b.sourceQuote}`.toLowerCase();
    return blob.includes(subject.split(/\s+/)[0] ?? subject);
  });
}

export function applyCorrection(
  newBundle: EvidenceBundle,
  input: ProvenanceInferenceInput,
  priorBundles: EvidenceBundle[],
): { correction: CorrectionRecord; superseded?: EvidenceBundle; history: EvidenceBundle[] } {
  const detected = detectCorrection(input.text);
  const history: EvidenceBundle[] = [...priorBundles];

  const oldBundle =
    (detected ? findSupersededBundle(detected, priorBundles) : undefined) ??
    priorBundles.find(
      (b) =>
        b.claimType === newBundle.claimType &&
        b.truthState !== 'archived' &&
        b.truthState !== 'rejected' &&
        b.id !== newBundle.id,
    );

  let superseded: EvidenceBundle | undefined;
  if (oldBundle) {
    superseded = {
      ...oldBundle,
      truthState: 'archived',
      supersededById: newBundle.id,
    };
    const idx = history.findIndex((b) => b.id === oldBundle.id);
    if (idx >= 0) history[idx] = superseded;
  }

  const correction: CorrectionRecord = {
    id: crypto.randomUUID(),
    oldClaimText: detected?.oldClaimText ?? oldBundle?.claimText ?? 'unknown prior claim',
    newClaimText: newBundle.claimText,
    oldEvidenceId: oldBundle?.id,
    newEvidenceId: newBundle.id,
    sourceType: newBundle.sourceType,
    sourceMessageId: newBundle.sourceMessageId,
    sourceQuote: newBundle.sourceQuote,
    createdAt: newBundle.createdAt,
  };

  return { correction, superseded, history };
}

export function correctionSupersedes(
  incoming: EvidenceBundle,
  existing: EvidenceBundle,
): boolean {
  if (incoming.origin === 'user_corrected' || incoming.sourceType === 'manual_edit') {
    return originOutranks(incoming.origin, existing.origin);
  }
  return false;
}
