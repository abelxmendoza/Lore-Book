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

export const LORE_ASSET_TAB_LABELS: Record<LoreAssetKind | 'stale' | 'audit', string> = {
  moment: 'Moments',
  portrait: 'People',
  evidence: 'Files',
  pattern: 'Patterns',
  chapter: 'Chapters',
  scene: 'Scenes',
  stale: 'Stale',
  audit: 'Audit',
};

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
