/**
 * Lore constellation — graph view over lore assets and provenance edges.
 */
import { artifactRegistry } from './artifactRegistry';
import { presentLoreAsset } from './loreAssetPresentation';
import { provenanceEdgeService } from './provenance';
import { supabaseAdmin } from './supabaseClient';

export interface ConstellationNode {
  id: string;
  label: string;
  kind: string;
  artifactType: string;
  color?: string;
}

export interface ConstellationLink {
  source: string;
  target: string;
  relation: string;
  weight: number;
}

export interface LoreConstellation {
  nodes: ConstellationNode[];
  links: ConstellationLink[];
  centerId?: string;
}

const KIND_COLORS: Record<string, string> = {
  moment: '#a855f7',
  portrait: '#ec4899',
  evidence: '#06b6d4',
  pattern: '#8b5cf6',
  chapter: '#f59e0b',
  scene: '#10b981',
};

export async function buildLoreConstellation(
  userId: string,
  options: { centerId?: string; limit?: number } = {}
): Promise<LoreConstellation> {
  const limit = Math.min(options.limit ?? 60, 120);
  const batch = await artifactRegistry.listLoreAssets(userId, { limit: 200 });
  let assets = batch.assets;

  if (options.centerId) {
    const neighborhood = new Set<string>([options.centerId]);
    const edges = await provenanceEdgeService.getEdgesForArtifact(options.centerId, userId);
    for (const edge of edges) {
      neighborhood.add(edge.source_id);
      neighborhood.add(edge.target_id);
    }
    assets = assets.filter((a) => neighborhood.has(a.id));
    if (assets.length === 0) {
      const centered = batch.assets.find((a) => a.id === options.centerId);
      if (centered) assets = [centered];
    }
  }

  assets = assets.slice(0, limit);
  const nodeIds = new Set(assets.map((a) => a.id));

  const nodes: ConstellationNode[] = assets.map((a) => ({
    id: a.id,
    label: a.displayName,
    kind: a.assetKind,
    artifactType: a.artifactType,
    color: KIND_COLORS[a.assetKind] ?? '#71717a',
  }));

  const links: ConstellationLink[] = [];
  const seenLinks = new Set<string>();

  for (const nodeId of nodeIds) {
    const edges = await provenanceEdgeService.getEdgesForArtifact(nodeId, userId);
    for (const edge of edges) {
      if (!nodeIds.has(edge.source_id) || !nodeIds.has(edge.target_id)) continue;
      const key = [edge.source_id, edge.target_id].sort().join('::');
      if (seenLinks.has(key)) continue;
      seenLinks.add(key);
      links.push({
        source: edge.source_id,
        target: edge.target_id,
        relation: edge.relation,
        weight: edge.confidence ?? 1,
      });
    }
  }

  if (links.length === 0 && assets.length > 1) {
    const { data: entries } = await supabaseAdmin
      .from('journal_entries')
      .select('id, metadata')
      .eq('user_id', userId)
      .in('id', assets.filter((a) => a.artifactType === 'journal_entry').map((a) => a.id))
      .limit(50);

    const portraits = assets.filter((a) => a.assetKind === 'portrait');
    for (const entry of entries ?? []) {
      const meta = (entry.metadata ?? {}) as Record<string, unknown>;
      const entityIds = Array.isArray(meta.entities)
        ? (meta.entities as Array<{ id?: string }>).map((e) => e.id).filter(Boolean)
        : [];
      for (const portrait of portraits) {
        if (entityIds.includes(portrait.id)) {
          const key = [entry.id, portrait.id].sort().join('::');
          if (seenLinks.has(key)) continue;
          seenLinks.add(key);
          links.push({
            source: entry.id,
            target: portrait.id,
            relation: 'MENTIONED',
            weight: 0.7,
          });
        }
      }
    }
  }

  return {
    nodes,
    links,
    centerId: options.centerId,
  };
}

export async function getLoreAssetDetail(userId: string, artifactId: string, artifactType?: string) {
  const result = await artifactRegistry.get(
    userId,
    artifactId,
    artifactType as Parameters<typeof artifactRegistry.get>[2]
  );
  if (!result) return null;
  return {
    asset: presentLoreAsset(result.entry, result.record),
    record: result.record,
  };
}
