/**
 * Association Graph Service (Rule 15) — the in-memory association graph that
 * sits between canonical identity and membership inference. It stores
 * AssociationEdges keyed by (source, type, target) and ACCUMULATES evidence:
 * observing the same association again increments mentionCount, extends the
 * lastSeen window, merges provenance, and recomputes confidence.
 *
 * It deliberately knows nothing about persistence — it is a pure data structure
 * so the rules and promotion logic can be unit-tested without a database. A
 * persistence adapter can hydrate it from / flush it to `association_edges`.
 */
import { associationEvidenceService } from './associationEvidenceService';
import { relationshipStrengthService } from './relationshipStrengthService';
import {
  edgeKey,
  type AssociationEdge,
  type AssociationObservation,
  type AssociationType,
} from './associationTypes';

export class AssociationGraph {
  private edges = new Map<string, AssociationEdge>();
  /** Tracks which observations were explicit, per edge key, so confidence is honest. */
  private explicitKeys = new Set<string>();

  /** Fold a single observation into the graph, creating or accumulating an edge. */
  observe(obs: AssociationObservation): AssociationEdge {
    const key = edgeKey(obs.source.id, obs.target.id, obs.associationType);
    if (obs.explicit) this.explicitKeys.add(key);

    const existing = this.edges.get(key);
    const ts = obs.evidence.timestamp;

    if (!existing) {
      const edge: AssociationEdge = {
        sourceEntityId: obs.source.id,
        targetEntityId: obs.target.id,
        sourceName: obs.source.name,
        targetName: obs.target.name,
        targetKind: obs.target.kind,
        associationType: obs.associationType,
        confidence: 0,
        firstSeen: ts,
        lastSeen: ts,
        mentionCount: 1,
        supportingEvidence: [obs.evidence],
      };
      relationshipStrengthService.recompute(edge, this.explicitKeys.has(key));
      this.edges.set(key, edge);
      return edge;
    }

    const before = existing.supportingEvidence.length;
    existing.supportingEvidence = associationEvidenceService.merge(existing.supportingEvidence, [obs.evidence]);
    // Only count a *new* distinct observation toward mentionCount.
    if (existing.supportingEvidence.length > before) existing.mentionCount += 1;
    if (ts < existing.firstSeen) existing.firstSeen = ts;
    if (ts > existing.lastSeen) existing.lastSeen = ts;
    relationshipStrengthService.recompute(existing, this.explicitKeys.has(key));
    return existing;
  }

  /** Fold many observations at once. */
  observeAll(observations: AssociationObservation[]): AssociationEdge[] {
    return observations.map((o) => this.observe(o));
  }

  /** Load pre-built edges (e.g. from persistence) directly into the graph. */
  hydrate(edges: AssociationEdge[]): void {
    for (const edge of edges) {
      const key = edgeKey(edge.sourceEntityId, edge.targetEntityId, edge.associationType);
      this.edges.set(key, edge);
      // member_of/owns/etc. were only ever written when explicit; preserve that.
      if (edge.confidence >= 0.9 || edge.associationType === 'member_of' || edge.associationType === 'owns') {
        this.explicitKeys.add(key);
      }
    }
  }

  /** Replace an edge in place when it is promoted to a stronger type. */
  promote(edge: AssociationEdge, toType: AssociationType, explicit = false): AssociationEdge {
    const oldKey = edgeKey(edge.sourceEntityId, edge.targetEntityId, edge.associationType);
    const newKey = edgeKey(edge.sourceEntityId, edge.targetEntityId, toType);

    edge.promotedTo = toType;
    const promoted: AssociationEdge = {
      ...edge,
      associationType: toType,
      promotedFrom: edge.associationType,
      promotedTo: undefined,
      supportingEvidence: [...edge.supportingEvidence],
    };
    if (explicit) this.explicitKeys.add(newKey);
    else if (this.explicitKeys.has(oldKey)) this.explicitKeys.add(newKey);
    relationshipStrengthService.recompute(promoted, this.explicitKeys.has(newKey));

    this.edges.set(oldKey, edge); // keep the demoted record with its promotedTo marker
    this.edges.set(newKey, promoted);
    return promoted;
  }

  get(sourceId: string, targetId: string, type: AssociationType): AssociationEdge | undefined {
    return this.edges.get(edgeKey(sourceId, targetId, type));
  }

  /** All edges, optionally filtered. */
  all(filter?: { sourceId?: string; targetId?: string; type?: AssociationType }): AssociationEdge[] {
    let list = [...this.edges.values()];
    if (filter?.sourceId) list = list.filter((e) => e.sourceEntityId === filter.sourceId);
    if (filter?.targetId) list = list.filter((e) => e.targetEntityId === filter.targetId);
    if (filter?.type) list = list.filter((e) => e.associationType === filter.type);
    return list;
  }

  /** Active edges = those not superseded by a stronger promoted edge. */
  active(filter?: { sourceId?: string; targetId?: string; type?: AssociationType }): AssociationEdge[] {
    return this.all(filter).filter((e) => !e.promotedTo);
  }

  /** Outgoing edges from an entity. */
  outgoing(sourceId: string): AssociationEdge[] {
    return this.active({ sourceId });
  }

  size(): number {
    return this.edges.size;
  }

  clear(): void {
    this.edges.clear();
    this.explicitKeys.clear();
  }
}

/** A process-wide default graph for callers that don't manage their own. */
export const associationGraphService = new AssociationGraph();
