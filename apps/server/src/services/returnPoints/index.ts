export * from './types';
export { detectOpenThreads, isConditionalOnly, isResolutionEvidence } from './detectOpenThreads';
export { selectReturnPoint, applyAction } from './selectReturnPoint';
export { loadReturnPointEvidence } from './loadEvidence';
export { loadInteractions, saveInteractions } from './interactionStore';
export {
  runReturnPointBenchmark,
  formatReturnPointReport,
  type ReturnPointBenchmarkReport,
} from './scoreBenchmark';
export { RETURN_POINT_SCENARIOS } from './fixtures/scenarios';

import { loadReturnPointEvidence } from './loadEvidence';
import { loadInteractions, saveInteractions } from './interactionStore';
import { applyAction, selectReturnPoint } from './selectReturnPoint';
import type { ReturnPointSelectionResult } from './types';

export async function getActiveReturnPoint(opts: {
  userId: string;
  threadId?: string | null;
  contextHint?: string;
  resumingSameThread?: boolean;
}): Promise<ReturnPointSelectionResult> {
  const [evidence, interactions] = await Promise.all([
    loadReturnPointEvidence(opts.userId, { threadId: opts.threadId }),
    loadInteractions(opts.userId),
  ]);
  return selectReturnPoint({
    evidence,
    interactions,
    threadId: opts.threadId,
    contextHint: opts.contextHint,
    resumingSameThread: opts.resumingSameThread,
  });
}

export async function actOnReturnPoint(opts: {
  userId: string;
  returnPointId: string;
  action: 'continue' | 'dismiss' | 'resolve' | 'correct' | 'surface';
  correctionNote?: string;
  threadId?: string | null;
  contextHint?: string;
}): Promise<{ ok: boolean; selection: ReturnPointSelectionResult; continueContext?: unknown }> {
  const interactions = await loadInteractions(opts.userId);
  const now = new Date().toISOString();
  const next = applyAction(
    interactions,
    opts.returnPointId,
    opts.action,
    now,
    opts.correctionNote,
  );
  await saveInteractions(opts.userId, next);

  const selection = await getActiveReturnPoint({
    userId: opts.userId,
    threadId: opts.threadId,
    contextHint: opts.contextHint,
  });

  let continueContext: unknown;
  if (opts.action === 'continue') {
    // Re-run detection to find the point even if no longer surfaced
    const evidence = await loadReturnPointEvidence(opts.userId, { threadId: opts.threadId });
    const full = selectReturnPoint({
      evidence,
      interactions: next,
      threadId: opts.threadId,
      contextHint: opts.contextHint,
    });
    const point =
      full.trace.candidates.find((c) => c.id === opts.returnPointId) ??
      full.selected ??
      selection.selected;
    if (point) {
      continueContext = {
        returnPointId: point.id,
        sourceEvidence: point.evidenceText,
        unresolvedState: point.state,
        recommendedContinuityMode: point.continuityMode,
        surfaceLine: point.surfaceLine,
        involvedEntities: point.involvedEntities,
        evidenceIds: point.evidenceIds,
      };
    }
  }

  return { ok: true, selection, continueContext };
}
