/**
 * Lore Assets — user-facing presentation over artifact registry rows.
 * No new storage; maps artifact types to gallery kinds and display metadata.
 */
import type { ArtifactIndexEntry, ArtifactIndexType } from './artifactRegistry';

export type LoreAssetKind =
  | 'moment'
  | 'portrait'
  | 'evidence'
  | 'pattern'
  | 'chapter'
  | 'scene';

export interface LoreAssetView {
  id: string;
  artifactType: ArtifactIndexType;
  assetKind: LoreAssetKind;
  displayName: string;
  subtitle?: string;
  summary?: string;
  truthState?: ArtifactIndexEntry['truthState'];
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

const EMPTY_KIND_COUNTS: LoreAssetKindCounts = {
  moment: 0,
  portrait: 0,
  evidence: 0,
  pattern: 0,
  chapter: 0,
  scene: 0,
};

export function artifactTypeToAssetKind(type: ArtifactIndexType): LoreAssetKind {
  switch (type) {
    case 'journal_entry':
      return 'moment';
    case 'character':
    case 'entity':
      return 'portrait';
    case 'user_file':
      return 'evidence';
    case 'insight':
      return 'pattern';
    case 'biography_snapshot':
      return 'chapter';
    case 'timeline_event':
      return 'scene';
    default:
      return 'moment';
  }
}

function readMeta(row: Record<string, unknown>): Record<string, unknown> {
  const meta = row.metadata;
  return meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : {};
}

function sumDerivedCounts(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return 0;
  const counts = raw as Record<string, unknown>;
  return ['moments', 'facts', 'entities', 'relationships', 'events', 'characterAttributes']
    .reduce((sum, key) => sum + (typeof counts[key] === 'number' ? counts[key] : 0), 0);
}

function countProvenanceLinks(meta: Record<string, unknown>): number {
  const links = meta.provenance_links;
  return Array.isArray(links) ? links.length : 0;
}

function countLinkedEntities(meta: Record<string, unknown>, row: Record<string, unknown>): number {
  const entities = meta.entities ?? row.entities;
  if (Array.isArray(entities)) return entities.length;
  const sourceIds = meta.source_entry_ids;
  if (Array.isArray(sourceIds)) return sourceIds.length;
  if (typeof meta.source_entry_id === 'string') return 1;
  return countProvenanceLinks(meta);
}

function resolveThumbnailUrl(
  entry: ArtifactIndexEntry,
  row: Record<string, unknown>
): string | undefined {
  const meta = readMeta(row);

  if (entry.type === 'user_file') {
    const mime = typeof row.mime_type === 'string' ? row.mime_type : '';
    const url = typeof row.storage_url === 'string' ? row.storage_url : undefined;
    if (url && mime.startsWith('image/')) return url;
    return undefined;
  }

  if (entry.type === 'character') {
    const avatar =
      (typeof row.avatar_url === 'string' && row.avatar_url) ||
      (typeof meta.avatar_url === 'string' ? meta.avatar_url : undefined);
    return avatar;
  }

  if (entry.type === 'entity') {
    const icon = typeof meta.icon_url === 'string' ? meta.icon_url : undefined;
    return icon;
  }

  return undefined;
}

function resolveLinkedCount(entry: ArtifactIndexEntry, row: Record<string, unknown>): number {
  const meta = readMeta(row);

  if (entry.type === 'user_file') {
    return sumDerivedCounts(row.derived_counts) || countProvenanceLinks(meta);
  }

  if (entry.type === 'biography_snapshot' || entry.type === 'timeline_event') {
    const sourceIds = meta.source_entry_ids;
    if (Array.isArray(sourceIds)) return sourceIds.length;
    if (typeof meta.source_entry_id === 'string') return 1;
    return 0;
  }

  if (entry.type === 'insight') {
    const evidence = meta.evidence_count;
    if (typeof evidence === 'number') return evidence;
    return countProvenanceLinks(meta);
  }

  return countLinkedEntities(meta, row);
}

function resolveLastUsedInChat(row: Record<string, unknown>): string | undefined {
  const meta = readMeta(row);
  const candidates = [
    meta.last_used_in_chat,
    meta.last_referenced_at,
    meta.last_chat_at,
    row.updated_at,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function resolveDisplayName(entry: ArtifactIndexEntry, row: Record<string, unknown>): string {
  if (entry.title?.trim()) return entry.title.trim();

  switch (entry.type) {
    case 'journal_entry':
      return 'Untitled moment';
    case 'insight':
      return typeof row.content === 'string' && row.content.length > 0
        ? row.content.slice(0, 60)
        : 'Pattern';
    case 'entity':
      return typeof row.canonical_name === 'string' ? row.canonical_name : 'Unknown';
    case 'character':
      return typeof row.name === 'string' ? row.name : 'Unknown person';
    case 'user_file':
      return typeof row.filename === 'string' ? row.filename : 'Uploaded file';
    case 'biography_snapshot':
      return 'Life chapter';
    case 'timeline_event':
      return 'Timeline scene';
    case 'entry_ir':
      return typeof row.summary === 'string' ? row.summary.slice(0, 60) : 'Compiled memory';
    default:
      return 'Lore asset';
  }
}

function resolveSubtitle(entry: ArtifactIndexEntry, row: Record<string, unknown>): string | undefined {
  if (entry.summary && entry.summary !== entry.title) {
    return entry.summary.length > 120 ? `${entry.summary.slice(0, 117)}…` : entry.summary;
  }

  if (entry.type === 'character' && typeof row.subtitle === 'string') {
    return row.subtitle;
  }

  if (entry.type === 'entity' && typeof row.type === 'string') {
    return row.type.toLowerCase();
  }

  if (entry.type === 'user_file' && typeof row.mime_type === 'string') {
    return row.mime_type;
  }

  return undefined;
}

export function presentLoreAsset(
  entry: ArtifactIndexEntry,
  row: Record<string, unknown>
): LoreAssetView {
  const assetKind = artifactTypeToAssetKind(entry.type);

  return {
    id: entry.id,
    artifactType: entry.type,
    assetKind,
    displayName: resolveDisplayName(entry, row),
    subtitle: resolveSubtitle(entry, row),
    summary: entry.summary,
    truthState: entry.truthState,
    thumbnailUrl: resolveThumbnailUrl(entry, row),
    linkedCount: resolveLinkedCount(entry, row),
    lastUsedInChat: resolveLastUsedInChat(row),
    stale: entry.stale,
    confidence: entry.confidence,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    sourceTable: entry.sourceTable,
  };
}

export function countAssetsByKind(assets: LoreAssetView[]): LoreAssetKindCounts {
  const counts = { ...EMPTY_KIND_COUNTS };
  for (const asset of assets) {
    counts[asset.assetKind] += 1;
  }
  return counts;
}

export const LORE_ASSET_KIND_LABELS: Record<LoreAssetKind, string> = {
  moment: 'Moments',
  portrait: 'People',
  evidence: 'Files',
  pattern: 'Patterns',
  chapter: 'Chapters',
  scene: 'Scenes',
};
