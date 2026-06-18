/**
 * Lore Pack export — portable bundle of selected lore assets + provenance.
 */
import { artifactRegistry } from './artifactRegistry';
import { presentLoreAsset } from './loreAssetPresentation';
import type { ArtifactIndexType } from './artifactRegistry';

export interface LorePackSelection {
  id: string;
  artifactType: ArtifactIndexType;
}

export interface LorePackAsset {
  asset: ReturnType<typeof presentLoreAsset>;
  record: Record<string, unknown>;
  provenance?: Awaited<ReturnType<typeof artifactRegistry.provenance>>;
}

export interface LorePackExport {
  version: 1;
  exportedAt: string;
  assetCount: number;
  assets: LorePackAsset[];
}

export async function exportLorePack(
  userId: string,
  selections: LorePackSelection[]
): Promise<LorePackExport> {
  const unique = new Map<string, LorePackSelection>();
  for (const sel of selections) {
    unique.set(`${sel.artifactType}:${sel.id}`, sel);
  }

  const assets: LorePackAsset[] = [];

  for (const sel of unique.values()) {
    const result = await artifactRegistry.get(userId, sel.id, sel.artifactType);
    if (!result) continue;

    let provenance: LorePackAsset['provenance'];
    try {
      provenance = await artifactRegistry.provenance(userId, sel.id);
    } catch {
      provenance = undefined;
    }

    assets.push({
      asset: presentLoreAsset(result.entry, result.record),
      record: result.record,
      provenance,
    });
  }

  assets.sort((a, b) => b.asset.createdAt.localeCompare(a.asset.createdAt));

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    assetCount: assets.length,
    assets,
  };
}
