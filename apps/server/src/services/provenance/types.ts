// =====================================================
// PROVENANCE + TRUTH-STATE FOUNDATIONS
//
// Epistemic layer over every artifact in the system.
// Every durable memory, entity mention, or decision
// can carry a TruthState and a chain of ProvenanceEdges
// tracing exactly how it came to exist.
//
// Nothing is written here yet — this is the type contract
// that migration and service code will implement.
// =====================================================

// ─── Truth State ─────────────────────────────────────────────────────────────

/**
 * The epistemic status of a piece of knowledge.
 *
 * - CANONICAL:             Verified by the user or a high-confidence source.
 * - CONTEXTUAL:            True in a specific context (roleplay, hypothetical, quote).
 * - REVISED:               Superseded by newer information.
 * - DISPUTED:              Contradicted by another knowledge unit.
 * - INFERRED:              Derived logically but never directly stated.
 * - PENDING_VERIFICATION:  Surfaced for human review; not yet accepted.
 */
export type TruthState =
  | 'CANONICAL'
  | 'CONTEXTUAL'
  | 'REVISED'
  | 'DISPUTED'
  | 'INFERRED'
  | 'PENDING_VERIFICATION';

// ─── Artifact Types ───────────────────────────────────────────────────────────

/**
 * Every artifact that can appear in a provenance chain.
 */
export type ArtifactType =
  | 'conversation_message'  // raw chat message
  | 'utterance'             // normalised utterance extracted from message
  | 'extracted_unit'        // semantic unit from utterance
  | 'knowledge_unit'        // classified & structured knowledge unit
  | 'entry_ir'              // compiled intermediate representation
  | 'journal_entry'         // durable autobiographical memory
  | 'entity'                // any resolved entity
  | 'insight';              // derived reflection or pattern

// ─── Provenance Edge ─────────────────────────────────────────────────────────

/**
 * Directed edge in the provenance graph.
 * `from` produced (or informed) `to`.
 */
export type ProvenanceRelation =
  | 'EXTRACTED_FROM'   // to was extracted from from
  | 'COMPILED_INTO'    // to is the compiled form of from (entry_ir → journal_entry)
  | 'REVISED_BY'       // from was superseded by to
  | 'CONTRADICTS'      // from contradicts to
  | 'INFERRED_FROM'    // to was inferred from from
  | 'CITED_IN';        // from was cited when generating to

export interface ProvenanceEdge {
  id?: string;
  fromType: ArtifactType;
  fromId: string;
  toType: ArtifactType;
  toId: string;
  relation: ProvenanceRelation;
  /** Current epistemic status of the destination artifact. */
  toTruthState: TruthState;
  confidence?: number;
  userId: string;
  createdAt: string;
  meta?: Record<string, unknown>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function makeProvenanceEdge(
  params: Omit<ProvenanceEdge, 'createdAt'>
): ProvenanceEdge {
  return { ...params, createdAt: new Date().toISOString() };
}

/**
 * Map a consolidation result to the closest TruthState.
 * Used when promoting entry_ir → journal_entry.
 */
export function truthStateFromConsolidation(
  confidence: number,
  canonStatus: string
): TruthState {
  if (canonStatus !== 'CANON') return 'CONTEXTUAL';
  if (confidence >= 0.85) return 'CANONICAL';
  if (confidence >= 0.65) return 'INFERRED';
  return 'PENDING_VERIFICATION';
}
