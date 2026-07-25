import { supabaseAdmin } from '../supabaseClient';

export type BookEntityType =
  | 'character'
  | 'location'
  | 'organization'
  | 'skill'
  | 'project'
  | 'quest'
  | 'family';

export type BookEntitySummary = {
  id: string;
  name: string;
  type: BookEntityType;
  status: string | null;
  aliases: string[];
  updatedAt: string | null;
};

export type BookEntityQueryResult = {
  entities: BookEntitySummary[];
  counts: Partial<Record<BookEntityType, number>>;
  total: number;
  limit: number;
  offset: number;
};

type QueryConfig = {
  table: string;
  nameColumn: string;
  select: string;
  statusColumn?: string;
  aliasesFrom: (row: Record<string, unknown>) => string[];
  extraFilter?: (query: any) => any;
};

const DEFAULT_TYPES: BookEntityType[] = [
  'character',
  'location',
  'organization',
  'skill',
  'project',
  'quest',
];

const CONFIG: Record<BookEntityType, QueryConfig> = {
  character: {
    table: 'characters',
    nameColumn: 'name',
    select: 'id, name, alias, status, updated_at',
    statusColumn: 'status',
    aliasesFrom: (row) => Array.isArray(row.alias) ? row.alias.filter((v): v is string => typeof v === 'string') : [],
  },
  location: {
    table: 'locations',
    nameColumn: 'name',
    select: 'id, name, metadata, updated_at',
    aliasesFrom: aliasesFromMetadata,
  },
  organization: {
    table: 'organizations',
    nameColumn: 'name',
    select: 'id, name, status, metadata, updated_at',
    statusColumn: 'status',
    aliasesFrom: aliasesFromMetadata,
  },
  skill: {
    table: 'skills',
    nameColumn: 'skill_name',
    select: 'id, skill_name, metadata, updated_at',
    aliasesFrom: aliasesFromMetadata,
  },
  project: {
    table: 'projects',
    nameColumn: 'name',
    select: 'id, name, status, metadata, updated_at',
    statusColumn: 'status',
    aliasesFrom: aliasesFromMetadata,
  },
  quest: {
    table: 'quests',
    nameColumn: 'title',
    select: 'id, title, status, metadata, updated_at',
    statusColumn: 'status',
    aliasesFrom: aliasesFromMetadata,
  },
  family: {
    table: 'organizations',
    nameColumn: 'name',
    select: 'id, name, status, metadata, updated_at',
    statusColumn: 'status',
    aliasesFrom: aliasesFromMetadata,
    extraFilter: (query) => query.eq('type', 'family'),
  },
};

function aliasesFromMetadata(row: Record<string, unknown>): string[] {
  const metadata = row.metadata as Record<string, unknown> | null | undefined;
  const aliases = metadata?.aliases;
  return Array.isArray(aliases) ? aliases.filter((v): v is string => typeof v === 'string') : [];
}

function safeSearch(value: string): string {
  return value.replace(/[%_,().\\]/g, '').trim().slice(0, 120);
}

async function queryType(
  userId: string,
  type: BookEntityType,
  search: string,
  rangeFrom: number,
  rangeThrough: number,
): Promise<{ rows: BookEntitySummary[]; count: number }> {
  const config = CONFIG[type];
  let query: any = supabaseAdmin
    .from(config.table)
    .select(config.select, { count: 'exact' })
    .eq('user_id', userId);

  if (config.extraFilter) {
    query = config.extraFilter(query);
  }
  if (search) {
    query = query.ilike(config.nameColumn, `%${search}%`);
  }

  const { data, error, count } = await query
    .order('updated_at', { ascending: false })
    .range(rangeFrom, rangeThrough);
  if (error) throw error;

  const rows = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    name: String(row[config.nameColumn] ?? ''),
    type,
    status: config.statusColumn ? String(row[config.statusColumn] ?? '') || null : null,
    aliases: config.aliasesFrom(row),
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  })).filter((row) => row.name.length > 0);

  return { rows, count: count ?? rows.length };
}

/**
 * Shared, bounded Books index for server-side search and pagination.
 * Detailed book services remain response shapers; this is the common discovery
 * layer used by chatbot/entity search and Books list surfaces.
 */
export async function queryBookEntities(
  userId: string,
  options: {
    types?: BookEntityType[];
    search?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<BookEntityQueryResult> {
  const types = [...new Set(options.types?.length ? options.types : DEFAULT_TYPES)];
  const limit = Math.max(1, Math.min(options.limit ?? 50, 100));
  const search = safeSearch(options.search ?? '');
  const isSingleType = types.length === 1;
  // A single source can seek directly to any offset while returning at most
  // `limit` rows. Cross-Book merge pagination must inspect every source's
  // prefix, so cap that prefix at 500 rows per source.
  const offset = Math.max(
    0,
    Math.min(options.offset ?? 0, isSingleType ? Number.MAX_SAFE_INTEGER : 400),
  );
  // For one Book, let PostgREST perform the real offset. For a cross-book
  // result, each source must contribute its first offset+limit rows before the
  // merged ordering can be sliced correctly.
  const rangeFrom = isSingleType ? offset : 0;
  const rangeThrough = offset + limit - 1;

  const results = await Promise.all(
    types.map(async (type) => ({
      type,
      ...(await queryType(userId, type, search, rangeFrom, rangeThrough)),
    })),
  );
  const counts: Partial<Record<BookEntityType, number>> = {};
  const combined: BookEntitySummary[] = [];
  for (const result of results) {
    counts[result.type] = result.count;
    combined.push(...result.rows);
  }
  combined.sort((left, right) => {
    const updated = (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '');
    return updated || left.name.localeCompare(right.name);
  });

  return {
    entities: isSingleType ? combined : combined.slice(offset, offset + limit),
    counts,
    total: Object.values(counts).reduce((sum, count) => sum + (count ?? 0), 0),
    limit,
    offset,
  };
}
