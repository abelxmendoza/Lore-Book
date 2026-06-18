/**
 * R5 artifact registry — read-only index over existing durable tables.
 * No new storage; delegates revision to P2 and provenance to provenance services.
 */
import { correctionAuthority, provenanceEdgeService } from './provenance';
import type { ArtifactType, TruthState } from './provenance/types';
import { supabaseAdmin } from './supabaseClient';
import {
  computeSourceInputVersion,
  isProjectionStale,
} from './projectionVersion';

export type ArtifactIndexType =
  | ArtifactType
  | 'biography_snapshot'
  | 'user_file'
  | 'timeline_event';

export interface ArtifactIndexEntry {
  id: string;
  type: ArtifactIndexType;
  title?: string;
  summary?: string;
  truthState?: TruthState;
  createdAt: string;
  updatedAt?: string;
  sourceTable: string;
  computedFromVersion?: string;
  stale?: boolean;
  confidence?: number;
}

export interface ArtifactListOptions {
  type?: ArtifactIndexType;
  truthState?: TruthState;
  limit?: number;
  includeStale?: boolean;
}

export interface WhatAIKnowsGrouped {
  journal_entries: Array<Record<string, unknown>>;
  insights: Array<Record<string, unknown>>;
  entities: Array<Record<string, unknown>>;
  entry_ir: Array<Record<string, unknown>>;
}

type SourceConfig = {
  type: ArtifactIndexType;
  table: string;
  defaultLimit: number;
  select: string;
  orderField?: string;
  extraFilter?: (q: ReturnType<typeof supabaseAdmin.from>) => ReturnType<typeof supabaseAdmin.from>;
  normalize: (row: Record<string, unknown>) => ArtifactIndexEntry;
  toGrouped?: (row: Record<string, unknown>) => Record<string, unknown>;
  groupedKey?: keyof WhatAIKnowsGrouped;
};

function readTruthState(meta: unknown): TruthState | undefined {
  if (!meta || typeof meta !== 'object') return undefined;
  const raw = (meta as Record<string, unknown>).truth_state;
  return typeof raw === 'string' ? (raw as TruthState) : undefined;
}

function readComputedVersion(meta: unknown): string | undefined {
  if (!meta || typeof meta !== 'object') return undefined;
  const raw = (meta as Record<string, unknown>).computed_from_version;
  return typeof raw === 'string' ? raw : undefined;
}

const INDEX_SOURCES: SourceConfig[] = [
  {
    type: 'journal_entry',
    table: 'journal_entries',
    defaultLimit: 100,
    select: 'id, title, content, metadata, created_at, updated_at',
    groupedKey: 'journal_entries',
    normalize: (row) => ({
      id: String(row.id),
      type: 'journal_entry',
      title: typeof row.title === 'string' ? row.title : undefined,
      summary: typeof row.content === 'string' ? row.content.slice(0, 200) : undefined,
      truthState: readTruthState(row.metadata),
      createdAt: String(row.created_at),
      updatedAt: typeof row.updated_at === 'string' ? row.updated_at : undefined,
      sourceTable: 'journal_entries',
      computedFromVersion: readComputedVersion(row.metadata),
    }),
    toGrouped: (row) => row,
  },
  {
    type: 'insight',
    table: 'insights',
    defaultLimit: 50,
    select: 'id, content, metadata, created_at',
    groupedKey: 'insights',
    normalize: (row) => ({
      id: String(row.id),
      type: 'insight',
      summary: typeof row.content === 'string' ? row.content.slice(0, 200) : undefined,
      truthState: readTruthState(row.metadata),
      createdAt: String(row.created_at),
      sourceTable: 'insights',
      computedFromVersion: readComputedVersion(row.metadata),
    }),
    toGrouped: (row) => row,
  },
  {
    type: 'entity',
    table: 'entities',
    defaultLimit: 200,
    select: 'id, canonical_name, type, metadata, created_at',
    groupedKey: 'entities',
    normalize: (row) => ({
      id: String(row.id),
      type: 'entity',
      title: typeof row.canonical_name === 'string' ? row.canonical_name : undefined,
      summary: typeof row.type === 'string' ? row.type : undefined,
      truthState: readTruthState(row.metadata),
      createdAt: String(row.created_at),
      sourceTable: 'entities',
      computedFromVersion: readComputedVersion(row.metadata),
    }),
    toGrouped: (row) => row,
  },
  {
    type: 'entry_ir',
    table: 'entry_ir',
    defaultLimit: 50,
    select: 'id, summary, confidence, metadata, created_at',
    groupedKey: 'entry_ir',
    extraFilter: (q) => q.in('status', ['PENDING', 'PROMOTED']),
    normalize: (row) => ({
      id: String(row.id),
      type: 'entry_ir',
      summary: typeof row.summary === 'string' ? row.summary : undefined,
      truthState: readTruthState(row.metadata),
      createdAt: String(row.created_at),
      sourceTable: 'entry_ir',
      confidence: typeof row.confidence === 'number' ? row.confidence : undefined,
      computedFromVersion: readComputedVersion(row.metadata),
    }),
    toGrouped: (row) => row,
  },
  {
    type: 'character',
    table: 'characters',
    defaultLimit: 200,
    select: 'id, name, subtitle, metadata, created_at, updated_at',
    normalize: (row) => ({
      id: String(row.id),
      type: 'character',
      title: typeof row.name === 'string' ? row.name : undefined,
      summary: typeof row.subtitle === 'string' ? row.subtitle : undefined,
      truthState: readTruthState(row.metadata),
      createdAt: String(row.created_at),
      updatedAt: typeof row.updated_at === 'string' ? row.updated_at : undefined,
      sourceTable: 'characters',
      computedFromVersion: readComputedVersion(row.metadata),
    }),
  },
  {
    type: 'biography_snapshot',
    table: 'narrative_accounts',
    defaultLimit: 5,
    orderField: 'recorded_at',
    select: 'id, narrative_text, metadata, recorded_at, updated_at',
    extraFilter: (q) => q.eq('account_type', 'biography_snapshot'),
    normalize: (row) => {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      return {
        id: String(row.id),
        type: 'biography_snapshot',
        title: 'Biography snapshot',
        summary: typeof row.narrative_text === 'string' ? row.narrative_text.slice(0, 200) : undefined,
        createdAt: String(row.recorded_at ?? row.created_at),
        updatedAt: typeof row.updated_at === 'string' ? row.updated_at : undefined,
        sourceTable: 'narrative_accounts',
        computedFromVersion:
          readComputedVersion(row.metadata) ??
          (typeof meta.computed_from_version === 'string' ? meta.computed_from_version : undefined),
      };
    },
  },
  {
    type: 'timeline_event',
    table: 'resolved_events',
    defaultLimit: 100,
    select: 'id, title, summary, metadata, created_at, updated_at',
    normalize: (row) => {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      return {
        id: String(row.id),
        type: 'timeline_event',
        title: typeof row.title === 'string' ? row.title : undefined,
        summary: typeof row.summary === 'string' ? row.summary : undefined,
        createdAt: String(row.created_at),
        updatedAt: typeof row.updated_at === 'string' ? row.updated_at : undefined,
        sourceTable: 'resolved_events',
        computedFromVersion:
          readComputedVersion(row.metadata) ??
          (typeof meta.computed_from_version === 'string' ? meta.computed_from_version : undefined),
      };
    },
  },
  {
    type: 'user_file',
    table: 'user_files',
    defaultLimit: 50,
    select: 'id, filename, mime_type, metadata, created_at',
    normalize: (row) => ({
      id: String(row.id),
      type: 'user_file',
      title: typeof row.filename === 'string' ? row.filename : undefined,
      summary: typeof row.mime_type === 'string' ? row.mime_type : undefined,
      createdAt: String(row.created_at),
      sourceTable: 'user_files',
      computedFromVersion: readComputedVersion(row.metadata),
    }),
  },
];

const SOURCE_BY_TYPE = new Map(INDEX_SOURCES.map((s) => [s.type, s]));

async function annotateStale(
  userId: string,
  entry: ArtifactIndexEntry,
  row: Record<string, unknown>
): Promise<ArtifactIndexEntry> {
  if (entry.type !== 'biography_snapshot' && entry.type !== 'timeline_event') {
    return entry;
  }

  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  if (meta.stale === true) {
    return { ...entry, stale: true };
  }

  const sourceEntryIds = Array.isArray(meta.source_entry_ids)
    ? (meta.source_entry_ids as string[])
    : typeof meta.source_entry_id === 'string'
      ? [meta.source_entry_id]
      : [];

  if (sourceEntryIds.length === 0 || !entry.computedFromVersion) {
    return entry;
  }

  const currentVersion = await computeSourceInputVersion(userId, sourceEntryIds);
  return {
    ...entry,
    stale: isProjectionStale(entry.computedFromVersion, currentVersion),
  };
}

async function querySource(
  userId: string,
  source: SourceConfig,
  limit: number
): Promise<Array<{ entry: ArtifactIndexEntry; row: Record<string, unknown> }>> {
  let q = supabaseAdmin
    .from(source.table)
    .select(source.select)
    .eq('user_id', userId)
    .order(source.orderField ?? 'created_at', { ascending: false })
    .limit(limit);

  if (source.extraFilter) {
    q = source.extraFilter(q);
  }

  const { data, error } = await q;
  if (error || !data) return [];

  const rows = data as Record<string, unknown>[];
  const results: Array<{ entry: ArtifactIndexEntry; row: Record<string, unknown> }> = [];

  for (const row of rows) {
    const entry = await annotateStale(userId, source.normalize(row), row);
    results.push({ entry, row });
  }

  return results;
}

export class ArtifactRegistry {
  async list(userId: string, options: ArtifactListOptions = {}): Promise<ArtifactIndexEntry[]> {
    const limit = Math.min(options.limit ?? 100, 500);
    const sources = options.type
      ? [SOURCE_BY_TYPE.get(options.type)].filter(Boolean) as SourceConfig[]
      : INDEX_SOURCES;

    const batches = await Promise.all(
      sources.map((source) => querySource(userId, source, options.type ? limit : source.defaultLimit))
    );

    let entries = batches.flat().map((b) => b.entry);

    if (options.truthState) {
      entries = entries.filter((e) => e.truthState === options.truthState);
    }

    if (options.includeStale === false) {
      entries = entries.filter((e) => !e.stale);
    }

    entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return entries.slice(0, limit);
  }

  /** Backward-compatible shape for What AI Knows page. */
  async listGrouped(userId: string, limit = 100): Promise<WhatAIKnowsGrouped> {
    const grouped: WhatAIKnowsGrouped = {
      journal_entries: [],
      insights: [],
      entities: [],
      entry_ir: [],
    };

    const groupedSources = INDEX_SOURCES.filter((s) => s.groupedKey);
    const batches = await Promise.all(
      groupedSources.map((source) => querySource(userId, source, Math.min(limit, source.defaultLimit)))
    );

    for (const batch of batches) {
      for (const { entry, row } of batch) {
        const source = SOURCE_BY_TYPE.get(entry.type);
        if (!source?.groupedKey || !source.toGrouped) continue;
        grouped[source.groupedKey].push(source.toGrouped(row));
      }
    }

    return grouped;
  }

  async get(
    userId: string,
    artifactId: string,
    type?: ArtifactIndexType
  ): Promise<{ entry: ArtifactIndexEntry; record: Record<string, unknown> } | null> {
    const sources = type
      ? [SOURCE_BY_TYPE.get(type)].filter(Boolean) as SourceConfig[]
      : INDEX_SOURCES;

    for (const source of sources) {
      let q = supabaseAdmin
        .from(source.table)
        .select('*')
        .eq('user_id', userId)
        .eq('id', artifactId);

      if (source.extraFilter) {
        q = source.extraFilter(q);
      }

      const { data } = await q.maybeSingle();
      if (!data) continue;

      const row = data as Record<string, unknown>;
      const entry = await annotateStale(userId, source.normalize(row), row);
      return { entry, record: row };
    }

    return null;
  }

  async provenance(userId: string, artifactId: string) {
    const [history, edges] = await Promise.all([
      correctionAuthority.getMutationHistory(artifactId, userId),
      provenanceEdgeService.getEdgesForArtifact(artifactId, userId),
    ]);

    return { artifactId, history, edges };
  }
}

export const artifactRegistry = new ArtifactRegistry();
