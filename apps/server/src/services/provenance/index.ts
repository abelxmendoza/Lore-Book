export type {
  TruthState,
  ArtifactType,
  ProvenanceRelation,
  ProvenanceEdge,
} from './types';

export {
  makeProvenanceEdge,
  truthStateFromConsolidation,
} from './types';

export { correctionAuthority } from './CorrectionAuthority';
export type { CorrectionClaim, CorrectionResult } from './CorrectionAuthority';
