import type {
  CharacterBookQueryRequest,
  CharacterBookQueryResponse,
  CharacterBookQueryResult,
  CharacterBookQueryScope,
} from '@lorebook/api-contracts';

import { logger } from '../../logger';
import { characterDeduplicationService } from '../characterDeduplicationService';
import { organizationService } from '../organizationService';
import { isSelfCharacterMetadata } from '../relationships/relatedPersonType';
import { supabaseAdmin } from '../supabaseClient';

const STOP_WORDS = new Set([
  'a', 'all', 'and', 'are', 'at', 'book', 'character', 'characters', 'connected',
  'do', 'find', 'for', 'from', 'i', 'in', 'is', 'know', 'list', 'me', 'my', 'of',
  'people', 'person', 'persons', 'show', 'the', 'to', 'what', 'which', 'who', 'with',
]);

export type CharacterBookQueryRow = {
  id: string;
  name: string;
  aliases: string[];
  role?: string | null;
  status: string;
  tags: string[];
  summary?: string | null;
  metadata: Record<string, unknown>;
  updatedAt?: string | null;
  importanceScore: number;
  organizationNames: string[];
};

type QueryHints = {
  scopes: CharacterBookQueryScope[];
  organizationNames: string[];
  excludeSelf: boolean;
  sort?: CharacterBookQueryRequest['sort'];
  textTerms: string[];
};

function normalize(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function dateMs(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function overlaps(values: string[], needles: string[] | undefined): boolean {
  if (!needles?.length) return true;
  const haystack = values.map(normalize);
  return needles.some((needle) => haystack.some((value) => value.includes(normalize(needle))));
}

export function isCharacterSimilarityQuery(query: string): boolean {
  return /\b(similar|duplicates?|should be merged|look related|related people)\b/i.test(query);
}

export function deriveCharacterBookQueryHints(query: string): QueryHints {
  const text = normalize(query);
  const scopes: CharacterBookQueryScope[] = [];
  if (/\b(active|current)\b/.test(text)) scopes.push('active');
  if (/\b(inactive|archived|retired)\b/.test(text)) scopes.push('inactive');
  if (/\b(needs? review|unverified|weak evidence|low confidence|uncertain)\b/.test(text)) {
    scopes.push('needs_review');
  }
  if (/\b(auto detected|automatically detected|inferred)\b/.test(text)) scopes.push('auto_detected');
  if (/\b(myself|self card|protagonist)\b/.test(text)) scopes.push('self');
  if (/\b(i (?:have )?met|known people|people i know)\b/.test(text)) scopes.push('known');
  if (isCharacterSimilarityQuery(query)) scopes.push('similar');

  const organizationMatch = query.match(
    /\b(?:from|at|with|connected to|linked to|who do i know (?:from|at))\s+(.+?)\??$/i,
  );
  const capturedOrg = organizationMatch?.[1]
    ?.replace(/\b(?:the group|the company|the org(?:anization)?)\b/gi, '')
    .trim() ?? '';
  const organizationNames =
    capturedOrg
    && capturedOrg.length <= 160
    && !/^(?:character book|people book|book)$/i.test(capturedOrg)
      ? [capturedOrg]
      : [];

  const excludeSelf =
    /\b(?:who do i know|people i know|coworkers?|colleagues?|from|at)\b/i.test(query)
    && !/\b(?:myself|self card|including me)\b/i.test(query);

  let sort: CharacterBookQueryRequest['sort'] | undefined;
  if (/\b(most important|highest importance|closest)\b/.test(text)) sort = 'importance_desc';
  else if (/\b(recent|recently|latest)\b/.test(text)) sort = 'recent';
  else if (/\b(alphabetical|a to z|a-z)\b/.test(text)) sort = 'name_asc';

  const excluded = new Set([
    ...organizationNames.flatMap((name) => normalize(name).split(/\s+/)),
    'review',
    'unverified',
    'similar',
    'duplicate',
    'duplicates',
    'active',
    'inactive',
    'archived',
    'known',
    'auto',
    'detected',
  ]);
  const textTerms = text
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term) && !excluded.has(term));

  return {
    scopes: unique(scopes),
    organizationNames,
    excludeSelf,
    sort,
    textTerms: unique(textTerms),
  };
}

function isAutoDetected(metadata: Record<string, unknown>): boolean {
  return metadata.auto_detected === true || metadata.source === 'auto_detected';
}

function needsReview(row: CharacterBookQueryRow, isSelf: boolean): boolean {
  if (isSelf) return false;
  if (row.metadata.needs_review === true) return true;
  const status = normalize(row.status);
  if (status === 'unverified' || status === 'suggested' || status === 'needs_review') return true;
  if (isAutoDetected(row.metadata) && row.metadata.user_confirmed !== true && !row.summary?.trim()) return true;
  return !row.summary?.trim() && (row.importanceScore ?? 0) < 20;
}

function scopesFor(row: CharacterBookQueryRow, isSelf: boolean): CharacterBookQueryScope[] {
  const scopes: CharacterBookQueryScope[] = [];
  const status = normalize(row.status);
  scopes.push(status === 'inactive' || status === 'archived' ? 'inactive' : 'active');
  if (isSelf) scopes.push('self');
  if (isAutoDetected(row.metadata)) scopes.push('auto_detected');
  if (needsReview(row, isSelf)) scopes.push('needs_review');
  if (row.metadata.has_met === true || row.importanceScore >= 20) scopes.push('known');
  return unique(scopes);
}

function similarIdsFor(rows: CharacterBookQueryRow[]): Set<string> {
  const ids = new Set<string>();
  const records = rows.map((row) => ({ id: row.id, name: row.name, alias: row.aliases, metadata: row.metadata }));
  for (const row of rows) {
    const matches = characterDeduplicationService.findCandidates(
      row.name,
      records.filter((record) => record.id !== row.id),
    );
    if (matches.length) {
      ids.add(row.id);
      for (const match of matches) ids.add(match.characterId);
    }
  }
  return ids;
}

function intentFor(
  hints: QueryHints,
  request: CharacterBookQueryRequest,
): CharacterBookQueryResponse['intent'] {
  const scopes = unique([...(request.filters.scopes ?? []), ...hints.scopes]);
  if (scopes.includes('similar') || isCharacterSimilarityQuery(request.query)) return 'similar';
  if (scopes.includes('needs_review') || request.filters.needsReview) return 'quality';
  if (request.filters.organizationNames?.length || hints.organizationNames.length) return 'organization';
  if (request.sort !== 'relevance' || hints.sort === 'importance_desc') return 'ranking';
  if (request.query.trim()) return 'find';
  return 'browse';
}

function facet(
  rows: CharacterBookQueryResult[],
  read: (row: CharacterBookQueryResult) => string[],
): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const value of unique(read(row).filter(Boolean))) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function compileCharacterBookQuery(
  inputRows: CharacterBookQueryRow[],
  request: CharacterBookQueryRequest,
): CharacterBookQueryResponse {
  const hints = deriveCharacterBookQueryHints(request.query);
  const filters = request.filters;
  const requestedScopes = unique([...(filters.scopes ?? []), ...hints.scopes]);
  const organizationNames = unique([...(filters.organizationNames ?? []), ...hints.organizationNames]);
  const excludeSelf = filters.excludeSelf ?? hints.excludeSelf;
  const similarIds = requestedScopes.includes('similar') ? similarIdsFor(inputRows) : new Set<string>();
  const queryTerms = unique([
    ...hints.textTerms,
    ...normalize(request.query)
      .split(/[^\p{L}\p{N}_-]+/u)
      .filter((term) => term.length > 2 && !STOP_WORDS.has(term)),
  ]);

  let matches = inputRows.flatMap<CharacterBookQueryResult>((row) => {
    const isSelf = isSelfCharacterMetadata(row.metadata, row.name);
    if (excludeSelf && isSelf) return [];
    if (filters.characterIds?.length && !filters.characterIds.includes(row.id)) return [];
    if (filters.names?.length && !filters.names.some((name) => normalize(row.name).includes(normalize(name)))) {
      return [];
    }
    if (filters.roles?.length && !filters.roles.some((role) => normalize(row.role).includes(normalize(role)))) {
      return [];
    }
    if (filters.statuses?.length && !filters.statuses.some((status) => normalize(status) === normalize(row.status))) {
      return [];
    }
    if (!overlaps(row.tags, filters.tags)) return [];
    if (!overlaps(row.organizationNames, organizationNames)) return [];

    const scopes = scopesFor(row, isSelf);
    if (requestedScopes.includes('similar')) scopes.push('similar');
    if (requestedScopes.some((scope) => scope !== 'similar' && !scopes.includes(scope))) return [];
    if (requestedScopes.includes('similar') && !similarIds.has(row.id)) return [];
    const review = needsReview(row, isSelf);
    if (filters.needsReview !== undefined && review !== filters.needsReview) return [];

    const searchable = normalize([
      row.name,
      ...row.aliases,
      row.role,
      row.status,
      row.summary,
      ...row.tags,
      ...row.organizationNames,
    ].join(' '));
    const matchedTerms = queryTerms.filter((term) => searchable.includes(term));
    const reasons = [
      ...requestedScopes.filter((scope) => scopes.includes(scope)).map((scope) => scope.replace(/_/g, ' ')),
      ...organizationNames
        .filter((name) => overlaps(row.organizationNames, [name]))
        .map((name) => `connected to ${name}`),
      ...matchedTerms.slice(0, 3).map((term) => `matches "${term}"`),
    ].filter(Boolean);

    const score =
      matchedTerms.length * 12 +
      requestedScopes.filter((scope) => scopes.includes(scope)).length * 10 +
      organizationNames.filter((name) => overlaps(row.organizationNames, [name])).length * 14 +
      (row.importanceScore || 0) / 10 +
      (review ? 2 : 0);

    return [{
      characterId: row.id,
      name: row.name,
      aliases: row.aliases,
      role: row.role ?? null,
      status: row.status || 'active',
      tags: row.tags,
      summary: row.summary ?? null,
      isSelf,
      autoDetected: isAutoDetected(row.metadata),
      needsReview: review,
      organizationNames: row.organizationNames,
      importanceScore: row.importanceScore,
      updatedAt: row.updatedAt ?? null,
      scopes: unique(scopes),
      score,
      matchedReasons: reasons.length ? unique(reasons) : ['Character Book record'],
    }];
  });

  const sort = hints.sort ?? request.sort;
  matches.sort((left, right) => {
    if (sort === 'name_asc') return left.name.localeCompare(right.name);
    if (sort === 'recent') return dateMs(right.updatedAt) - dateMs(left.updatedAt);
    if (sort === 'importance_desc') return right.importanceScore - left.importanceScore;
    return right.score - left.score || left.name.localeCompare(right.name);
  });

  const total = matches.length;
  const results = matches.slice(request.offset, request.offset + request.limit);

  return {
    query: request.query,
    intent: intentFor(hints, request),
    results,
    total,
    limit: request.limit,
    offset: request.offset,
    facets: request.includeFacets
      ? {
          statuses: facet(matches, (row) => [row.status]),
          roles: facet(matches, (row) => (row.role ? [row.role] : [])),
          organizations: facet(matches, (row) => row.organizationNames),
          scopes: facet(matches, (row) => row.scopes),
        }
      : { statuses: [], roles: [], organizations: [], scopes: [] },
    warnings: [],
  };
}

function aliasesFrom(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function tagsFrom(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

export async function queryCharactersForUser(
  userId: string,
  request: CharacterBookQueryRequest,
): Promise<CharacterBookQueryResponse> {
  const { data, error } = await supabaseAdmin
    .from('characters')
    .select('id, name, alias, role, status, tags, summary, metadata, updated_at, importance_score')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(500);

  if (error) {
    logger.error({ err: error, userId }, 'characterBookQuery: failed to load characters');
    throw error;
  }

  const organizations = await organizationService.listOrganizations(userId).catch((err) => {
    logger.warn({ err, userId }, 'characterBookQuery: organization membership lookup failed');
    return [];
  });
  const orgsByCharacter = new Map<string, string[]>();
  for (const org of organizations) {
    for (const member of org.members ?? []) {
      const key = member.character_id || normalize(member.character_name);
      if (!key) continue;
      const names = orgsByCharacter.get(key) ?? [];
      names.push(org.name);
      orgsByCharacter.set(key, names);
    }
  }

  const rows: CharacterBookQueryRow[] = (data ?? []).map((row) => {
    const aliases = aliasesFrom(row.alias);
    const byId = orgsByCharacter.get(row.id) ?? [];
    const byName = orgsByCharacter.get(normalize(row.name)) ?? [];
    return {
      id: String(row.id),
      name: String(row.name ?? 'Unnamed'),
      aliases,
      role: typeof row.role === 'string' ? row.role : null,
      status: String(row.status || 'active'),
      tags: tagsFrom(row.tags),
      summary: typeof row.summary === 'string' ? row.summary : null,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      updatedAt: row.updated_at ? String(row.updated_at) : null,
      importanceScore: Number(row.importance_score ?? 0),
      organizationNames: unique([...byId, ...byName]),
    };
  });

  return compileCharacterBookQuery(rows, request);
}
