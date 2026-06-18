import { fetchJson } from '../lib/api';

export type LoreAssetKind =
  | 'moment'
  | 'portrait'
  | 'evidence'
  | 'pattern'
  | 'chapter'
  | 'scene';

export type LoreAssetTruthState =
  | 'CANONICAL'
  | 'CONTEXTUAL'
  | 'REVISED'
  | 'DISPUTED'
  | 'INFERRED'
  | 'PENDING_VERIFICATION';

export interface LoreAsset {
  id: string;
  artifactType: string;
  assetKind: LoreAssetKind;
  displayName: string;
  subtitle?: string;
  summary?: string;
  truthState?: LoreAssetTruthState;
  thumbnailUrl?: string;
  linkedCount: number;
  lastUsedInChat?: string;
  stale?: boolean;
  confidence?: number;
  createdAt: string;
  updatedAt?: string;
  sourceTable: string;
}

export type LoreAssetKindCounts = Record<LoreAssetKind, number>;

export interface LoreAssetsResponse {
  assets: LoreAsset[];
  total: number;
  countsByKind: LoreAssetKindCounts;
}

export const LORE_ASSET_TAB_LABELS: Record<LoreAssetKind | 'stale' | 'audit' | 'constellation', string> = {
  moment: 'Moments',
  portrait: 'People',
  evidence: 'Files',
  pattern: 'Patterns',
  chapter: 'Chapters',
  scene: 'Scenes',
  stale: 'Stale',
  audit: 'Audit',
  constellation: 'Constellation',
};

export function loreAssetUrl(params: {
  tab?: LoreAssetKind | 'stale' | 'constellation';
  assetId?: string;
  artifactType?: string;
  centerId?: string;
}): string {
  const query = new URLSearchParams();
  if (params.tab) query.set('tab', params.tab);
  if (params.assetId) query.set('assetId', params.assetId);
  if (params.artifactType) query.set('artifactType', params.artifactType);
  if (params.centerId) query.set('centerId', params.centerId);
  const qs = query.toString();
  return qs ? `/what-ai-knows?${qs}` : '/what-ai-knows';
}

export async function fetchLoreAssets(params?: {
  assetKind?: LoreAssetKind;
  staleOnly?: boolean;
  limit?: number;
}): Promise<LoreAssetsResponse> {
  const query = new URLSearchParams({ view: 'assets' });
  if (params?.assetKind) query.set('assetKind', params.assetKind);
  if (params?.staleOnly) query.set('staleOnly', 'true');
  if (params?.limit) query.set('limit', String(params.limit));
  return fetchJson<LoreAssetsResponse>(`/api/artifacts?${query.toString()}`);
}

export type LorePackExport = {
  version: 1;
  exportedAt: string;
  assetCount: number;
  assets: Array<{
    asset: LoreAsset;
    record: Record<string, unknown>;
    provenance?: unknown;
  }>;
};

export async function exportLorePack(
  assets: Array<{ id: string; artifactType: string }>
): Promise<LorePackExport> {
  return fetchJson<LorePackExport>('/api/artifacts/export', {
    method: 'POST',
    body: JSON.stringify({ assets }),
  });
}

export function downloadLorePack(pack: LorePackExport) {
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `lore-pack-${pack.exportedAt.slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
