import type { ClaimProvenance, GroundedClaim } from './responseCompilerTypes';

export function bindProvenance(groundedClaims: GroundedClaim[]): Array<{ claimId: string; provenance: ClaimProvenance }> {
  return groundedClaims
    .filter((c) => c.provenance && c.provenance.sourceMessageIds.length > 0)
    .map((c) => ({
      claimId: c.id,
      provenance: c.provenance!,
    }));
}

export function mergeProvenanceBindings(
  bindings: Array<{ claimId: string; provenance: ClaimProvenance }>,
): Array<{ claimId: string; provenance: ClaimProvenance }> {
  const byId = new Map<string, ClaimProvenance>();
  for (const b of bindings) {
    const prev = byId.get(b.claimId);
    if (!prev) {
      byId.set(b.claimId, { ...b.provenance });
      continue;
    }
    byId.set(b.claimId, {
      sourceMessageIds: [...new Set([...prev.sourceMessageIds, ...b.provenance.sourceMessageIds])],
      sourceQuotes: [...new Set([...prev.sourceQuotes, ...b.provenance.sourceQuotes])],
      sourceEntities: [...new Set([...prev.sourceEntities, ...b.provenance.sourceEntities])],
      parserFrames: [...new Set([...prev.parserFrames, ...b.provenance.parserFrames])],
      confidence: Math.max(prev.confidence, b.provenance.confidence),
    });
  }
  return [...byId.entries()].map(([claimId, provenance]) => ({ claimId, provenance }));
}
