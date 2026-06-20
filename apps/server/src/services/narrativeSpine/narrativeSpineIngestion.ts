import { logger } from '../../logger';
import type { EntryIR } from '../compiler/types';
import { ingestDecisionFromEntryIr } from '../cognition/decisionBridgeService';
import { ingestGraphNodeForEvent } from '../cognition/graphBridgeService';
import { enrichResolvedEventClassification } from '../narrative/history/lifeEventClassificationService';
import {
  bridgeCrystallizedKnowledge,
  bridgeEntryIr,
  bridgeEventInterpretation,
  bridgeResolvedEvent,
} from './legacyClaimBridge';

function logBridgeFailure(
  context: string,
  err: unknown,
  meta: Record<string, unknown>,
): void {
  logger.warn({ err, ...meta }, `narrativeSpineIngestion: ${context} failed`);
}

/** Fire-and-forget: materialize an EntryIR row into the narrative spine. */
export function ingestEntryIr(userId: string, ir: EntryIR): void {
  if (ir.knowledge_type === 'DECISION') {
    ingestDecisionFromEntryIr(userId, ir);
    return;
  }
  void bridgeEntryIr(userId, ir.id).catch((err) =>
    logBridgeFailure('entry_ir bridge', err, { userId, entryIrId: ir.id }),
  );
}

/** Fire-and-forget: classify metadata, then materialize a resolved event + journal evidence links. */
export function ingestResolvedEvent(userId: string, eventId: string): void {
  void enrichResolvedEventClassification(userId, eventId)
    .then(() => bridgeResolvedEvent(userId, eventId))
    .then(() => ingestGraphNodeForEvent(userId, eventId))
    .catch((err) => logBridgeFailure('resolved_event bridge', err, { userId, eventId }));
}

/** Fire-and-forget: materialize crystallized knowledge + evidence edges. */
export function ingestCrystallizedKnowledge(userId: string, knowledgeId: string): void {
  void bridgeCrystallizedKnowledge(userId, knowledgeId).catch((err) =>
    logBridgeFailure('crystallized_knowledge bridge', err, { userId, knowledgeId }),
  );
}

/** Fire-and-forget: materialize an interpretation linked to its event. */
export function ingestEventInterpretation(userId: string, interpretationId: string): void {
  void bridgeEventInterpretation(userId, interpretationId).catch((err) =>
    logBridgeFailure('event_interpretation bridge', err, { userId, interpretationId }),
  );
}
