/**
 * Association Graph Inference Layer.
 *
 * The middle layer between mention detection and membership inference. Its whole
 * reason to exist:
 *
 *   Mention ≠ Membership · Attendance ≠ Membership · Affiliation ≠ Membership
 *   Association is the default. Membership must be earned through evidence.
 *
 * Pipeline position:
 *   Lexical Intelligence → LoreBook Parser → Canonical Identity
 *     → [Association Graph] → Membership / Group Inference → Knowledge Graph
 */
export * from './associationTypes';
export { associationEvidenceService } from './associationEvidenceService';
export { attendanceInferenceService } from './attendanceInferenceService';
export { participationInferenceService } from './participationInferenceService';
export { affiliationInferenceService } from './affiliationInferenceService';
export { proximityInferenceService, type ProximityContext } from './proximityInferenceService';
export { relationshipStrengthService } from './relationshipStrengthService';
export { semanticAssociationAdapter, mapRelationType } from './semanticAssociationAdapter';
export { AssociationGraph, associationGraphService } from './associationGraphService';
export { associationGraphStore } from './associationGraphStore';
export { associationIngestionService, type IngestMessageInput } from './associationIngestionService';
export { associationBookBridge, type BridgeResult } from './associationBookBridge';
export {
  associationPromotionService,
  type PromotionDecision,
  type AffiliationCandidate,
  type GroupCandidate,
} from './associationPromotionService';
export {
  associationInferenceService,
  type AssociationInferenceResult,
  type IngestResult,
} from './associationInferenceService';
