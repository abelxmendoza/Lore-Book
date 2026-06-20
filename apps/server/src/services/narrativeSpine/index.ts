export * from './types';
export {
  upsertClaimBySource,
  upsertEdge,
  findClaimBySource,
  getClaimById,
} from './narrativeClaimRepository';
export {
  mapEntryIrKind,
  mapCrystallizedKind,
  rowToView,
  bridgeFromSource,
  bridgeEntryIr,
  bridgeResolvedEvent,
  bridgeCrystallizedKnowledge,
  recordFromEntryIr,
  resolveClaim,
  enrichClaimWithLegacy,
} from './legacyClaimBridge';
export {
  getProvenanceByClaimId,
  getProvenanceBySource,
  getClaimView,
} from './narrativeProvenanceService';
export {
  ingestEntryIr,
  ingestResolvedEvent,
  ingestCrystallizedKnowledge,
  ingestEventInterpretation,
} from './narrativeSpineIngestion';
