import {
  getClaimsByIds,
  getEdgesFromClaim,
  getEdgesToClaim,
} from './narrativeClaimRepository';
import {
  enrichClaimWithLegacy,
  resolveClaim,
  bridgeFromSource,
  rowToView,
} from './legacyClaimBridge';
import type {
  NarrativeClaimEdgeView,
  NarrativeClaimKind,
  NarrativeClaimRow,
  NarrativeProvenanceChainStep,
  NarrativeProvenanceReport,
  SourceRef,
} from './types';

const UPSTREAM_RELATIONS = new Set([
  'evidences',
  'interpreted_as',
  'means_for',
  'derived_from',
  'caused',
]);

const MAX_DEPTH = 8;

function edgeToView(edge: {
  id: string;
  from_claim_id: string;
  to_claim_id: string;
  relation: string;
  confidence: number;
}): NarrativeClaimEdgeView {
  return {
    id: edge.id,
    fromClaimId: edge.from_claim_id,
    toClaimId: edge.to_claim_id,
    relation: edge.relation as NarrativeClaimEdgeView['relation'],
    confidence: edge.confidence,
  };
}

function countByKind(claims: { kind: NarrativeClaimKind }[]) {
  return {
    factCount: claims.filter((c) => c.kind === 'fact').length,
    eventCount: claims.filter((c) => c.kind === 'event').length,
    evidenceCount: claims.filter((c) => c.kind === 'evidence').length,
    interpretationCount: claims.filter((c) => c.kind === 'interpretation').length,
    meaningCount: claims.filter((c) => c.kind === 'meaning').length,
  };
}

async function walkUpstream(
  userId: string,
  root: NarrativeClaimRow,
): Promise<{
  upstreamRows: NarrativeClaimRow[];
  edges: NarrativeClaimEdgeView[];
  chain: NarrativeProvenanceChainStep[];
}> {
  const visited = new Set<string>([root.id]);
  const upstreamRows: NarrativeClaimRow[] = [];
  const edges: NarrativeClaimEdgeView[] = [];
  const chain: NarrativeProvenanceChainStep[] = [
    { claim: rowToView(root), relation: 'root', viaEdgeId: null, depth: 0 },
  ];

  let frontier = [{ row: root, depth: 0 }];

  while (frontier.length > 0) {
    const nextFrontier: typeof frontier = [];

    for (const node of frontier) {
      if (node.depth >= MAX_DEPTH) continue;

      const inbound = await getEdgesToClaim(userId, node.row.id);
      for (const edge of inbound) {
        if (!UPSTREAM_RELATIONS.has(edge.relation)) continue;
        edges.push(edgeToView(edge));

        if (visited.has(edge.from_claim_id)) continue;
        visited.add(edge.from_claim_id);

        const parents = await getClaimsByIds(userId, [edge.from_claim_id]);
        const parent = parents[0];
        if (!parent) continue;

        upstreamRows.push(parent);
        chain.push({
          claim: rowToView(parent),
          relation: edge.relation,
          viaEdgeId: edge.id,
          depth: node.depth + 1,
        });
        nextFrontier.push({ row: parent, depth: node.depth + 1 });
      }
    }

    frontier = nextFrontier;
  }

  chain.sort((a, b) => b.depth - a.depth);
  return { upstreamRows, edges, chain };
}

export async function getProvenanceByClaimId(
  userId: string,
  claimId: string,
): Promise<NarrativeProvenanceReport | null> {
  const claimRow = await resolveClaim(userId, claimId);
  if (!claimRow) return null;

  const claim = await enrichClaimWithLegacy(userId, claimRow);
  const { upstreamRows, edges: upstreamEdges, chain } = await walkUpstream(userId, claimRow);

  const outbound = await getEdgesFromClaim(userId, claimRow.id);
  const downstreamIds = outbound.map((e) => e.to_claim_id);
  const downstreamRows = await getClaimsByIds(userId, downstreamIds);

  const upstreamViews = await Promise.all(
    upstreamRows.map((row) => enrichClaimWithLegacy(userId, row)),
  );
  const downstreamViews = await Promise.all(
    downstreamRows.map((row) => enrichClaimWithLegacy(userId, row)),
  );

  const allViews = [claim, ...upstreamViews, ...downstreamViews];
  const counts = countByKind(allViews);

  const evidenceDates = allViews
    .filter((c) => c.kind === 'evidence' && c.occurredAt)
    .map((c) => c.occurredAt as string)
    .sort();

  const allEdges = [
    ...upstreamEdges,
    ...outbound.map(edgeToView),
  ];

  return {
    claim,
    upstream: upstreamViews,
    downstream: downstreamViews,
    edges: allEdges,
    chain,
    summary: {
      ...counts,
      oldestEvidenceAt: evidenceDates[0] ?? null,
      depth: chain.length - 1,
    },
  };
}

export async function getProvenanceBySource(
  userId: string,
  ref: SourceRef,
): Promise<NarrativeProvenanceReport | null> {
  const claimRow = await bridgeFromSource(userId, ref);
  if (!claimRow) return null;
  return getProvenanceByClaimId(userId, claimRow.id);
}

export async function getClaimView(userId: string, claimId: string) {
  const row = await resolveClaim(userId, claimId);
  if (!row) return null;
  return enrichClaimWithLegacy(userId, row);
}
