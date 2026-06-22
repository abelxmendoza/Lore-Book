import { logger } from '../../../logger';
import { provenanceInferenceService } from './inference/provenanceInferenceService';
import type {
  ContradictionRecord,
  CorrectionRecord,
  EvidenceBundle,
} from './inference/provenanceInferenceTypes';

export type ProvenanceInferenceRunSummary = {
  bundlesAccepted: number;
  bundlesRejected: number;
  correctionsRecorded: number;
  contradictionsRecorded: number;
};

export async function runProvenanceInferenceForMessage(
  userId: string,
  text: string,
  sourceMessageId: string,
  opts: {
    sourceThreadId?: string;
    authorRole?: 'user' | 'assistant' | 'system';
    priorBundles?: EvidenceBundle[];
    priorCorrections?: CorrectionRecord[];
    priorContradictions?: ContradictionRecord[];
    manualEdit?: Parameters<typeof provenanceInferenceService.inferFromMessage>[0]['manualEdit'];
    userConfirmed?: boolean;
  } = {},
): Promise<
  ProvenanceInferenceRunSummary & {
    bundleHistory: EvidenceBundle[];
    corrections: CorrectionRecord[];
    contradictions: ContradictionRecord[];
  }
> {
  if (!text.trim() && !opts.manualEdit) {
    return {
      bundlesAccepted: 0,
      bundlesRejected: 0,
      correctionsRecorded: 0,
      contradictionsRecorded: 0,
      bundleHistory: opts.priorBundles ?? [],
      corrections: opts.priorCorrections ?? [],
      contradictions: opts.priorContradictions ?? [],
    };
  }

  try {
    const result = provenanceInferenceService.inferFromMessage({
      text,
      sourceMessageId,
      sourceThreadId: opts.sourceThreadId,
      authorRole: opts.authorRole ?? 'user',
      priorBundles: opts.priorBundles,
      priorCorrections: opts.priorCorrections,
      priorContradictions: opts.priorContradictions,
      seenAt: new Date().toISOString(),
      manualEdit: opts.manualEdit,
      userConfirmed: opts.userConfirmed,
    });

    if (result.accepted.length > 0 || result.corrections.length > 0) {
      logger.debug(
        {
          userId,
          sourceMessageId,
          bundlesAccepted: result.accepted.length,
          bundlesRejected: result.rejected.length,
          correctionsRecorded: result.corrections.length,
          contradictionsRecorded: result.contradictions.length,
        },
        'Provenance inference applied',
      );
    }

    return {
      bundlesAccepted: result.accepted.length,
      bundlesRejected: result.rejected.length,
      correctionsRecorded: result.corrections.length,
      contradictionsRecorded: result.contradictions.length,
      bundleHistory: result.bundleHistory,
      corrections: [...(opts.priorCorrections ?? []), ...result.corrections],
      contradictions: [...(opts.priorContradictions ?? []), ...result.contradictions],
    };
  } catch (err) {
    logger.warn({ err, userId, sourceMessageId }, 'Provenance inference failed (non-blocking)');
    return {
      bundlesAccepted: 0,
      bundlesRejected: 0,
      correctionsRecorded: 0,
      contradictionsRecorded: 0,
      bundleHistory: opts.priorBundles ?? [],
      corrections: opts.priorCorrections ?? [],
      contradictions: opts.priorContradictions ?? [],
    };
  }
}

export async function rescanProvenanceInference(
  userId: string,
  episodes: Array<{ id: string; text: string; authorRole?: 'user' | 'assistant' | 'system' }>,
): Promise<ProvenanceInferenceRunSummary> {
  let bundlesAccepted = 0;
  let bundlesRejected = 0;
  let correctionsRecorded = 0;
  let contradictionsRecorded = 0;
  let bundleHistory: EvidenceBundle[] = [];
  let corrections: CorrectionRecord[] = [];
  let contradictions: ContradictionRecord[] = [];

  for (const episode of episodes) {
    const result = await runProvenanceInferenceForMessage(
      userId,
      episode.text,
      episode.id,
      {
        authorRole: episode.authorRole ?? 'user',
        priorBundles: bundleHistory,
        priorCorrections: corrections,
        priorContradictions: contradictions,
      },
    );
    bundlesAccepted += result.bundlesAccepted;
    bundlesRejected += result.bundlesRejected;
    correctionsRecorded += result.correctionsRecorded;
    contradictionsRecorded += result.contradictionsRecorded;
    bundleHistory = result.bundleHistory;
    corrections = result.corrections;
    contradictions = result.contradictions;
  }

  return { bundlesAccepted, bundlesRejected, correctionsRecorded, contradictionsRecorded };
}
