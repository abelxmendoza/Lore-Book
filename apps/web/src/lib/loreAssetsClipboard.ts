import type { LoreAsset, LoreAssetKind } from '../api/loreAssets';
import { LORE_ASSET_TAB_LABELS } from '../api/loreAssets';
import { buildListClipboardText, type ListClipboardFilterOptions } from './listClipboard';

export function buildLoreAssetsClipboardText(
  assets: LoreAsset[],
  tab: LoreAssetKind | 'stale',
  options?: ListClipboardFilterOptions,
): string {
  return buildListClipboardText({
    title: `Lore Assets / ${LORE_ASSET_TAB_LABELS[tab]}`,
    filters: options?.filters,
    items: assets.map((asset) => ({
      heading: asset.displayName,
      fields: [
        { label: 'Id', value: asset.id },
        { label: 'Type', value: LORE_ASSET_TAB_LABELS[asset.assetKind] },
        { label: 'Subtitle', value: asset.subtitle },
        { label: 'Truth state', value: asset.truthState },
        { label: 'Linked', value: asset.linkedCount },
        { label: 'Confidence', value: asset.confidence },
        { label: 'Stale', value: asset.stale },
        { label: 'Source', value: asset.sourceTable },
        { label: 'Last used in chat', value: asset.lastUsedInChat },
        { label: 'Created', value: asset.createdAt },
        { label: 'Updated', value: asset.updatedAt },
      ],
      body: asset.summary,
    })),
  });
}

export function buildLoreAssetsAuditClipboardText(
  mutations: Array<{
    id: string;
    artifact_type: string;
    artifact_id: string;
    mutation_type: string;
    rationale: string | null;
    created_at: string;
  }>,
): string {
  return buildListClipboardText({
    title: 'Lore Assets / Audit',
    items: mutations.map((m) => ({
      heading: m.mutation_type,
      fields: [
        { label: 'Id', value: m.id },
        { label: 'Artifact type', value: m.artifact_type },
        { label: 'Artifact id', value: m.artifact_id },
        { label: 'Created', value: m.created_at },
      ],
      body: m.rationale ?? undefined,
    })),
  });
}
