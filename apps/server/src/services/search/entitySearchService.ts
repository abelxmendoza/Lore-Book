import { normalizeNameKey } from '../../utils/nameNormalization';
import { jaroWinkler } from '../../utils/jaroWinkler';
import { supabaseAdmin } from '../supabaseClient';
import { listCertifiedEntities } from '../entities/certifiedEntityIndexService';
import { listMentionableEntities } from '../entities/entityMentionIndexService';
import type {
  EntitySearchInput,
  EntitySearchMatchKind,
  EntitySearchResponse,
  EntitySearchResult,
  EntitySearchType,
} from './entitySearchTypes';

type IndexedEntity = EntitySearchResult & {
  normalizedName: string;
  normalizedAliases: string[];
  certifiedType: string;
  recencyMs: number;
};

const PREVIEW_TYPE_TO_SEARCH: Record<string, EntitySearchType[]> = {
  PERSON: ['person'],
  PLACE: ['place'],
  DEPLOYMENT_SITE: ['place'],
  ORGANIZATION: ['organization', 'group'],
  GROUP: ['group', 'organization', 'community'],
  COMMUNITY: ['community', 'group', 'organization'],
  SKILL: ['skill'],
  EVENT: ['event', 'place'],
  ROLE: ['person', 'organization'],
};

function certifiedToSearchType(
  type: string,
  metadata?: Record<string, unknown>
): EntitySearchType {
  if (type === 'character') return 'person';
  if (type === 'location') return 'place';
  if (type === 'skill') return 'skill';
  if (type === 'event') return 'event';
  const orgKind = String(metadata?.group_type ?? metadata?.kind ?? '').toLowerCase();
  if (orgKind.includes('community')) return 'community';
  if (orgKind.includes('group') || orgKind.includes('team') || orgKind.includes('club')) return 'group';
  return 'organization';
}

function sourceLabel(certifiedType: string, status: 'known' | 'suggestion'): string {
  if (status === 'suggestion') return 'suggestions';
  switch (certifiedType) {
    case 'character': return 'characters';
    case 'location': return 'places';
    case 'organization': return 'organizations';
    case 'skill': return 'skills';
    case 'event': return 'events';
    default: return 'lorebook';
  }
}

function typeCompatible(
  entityType: EntitySearchType,
  filterTypes: EntitySearchType[] | undefined,
  preferredPreviewType?: string
): boolean {
  if (filterTypes?.length) {
    if (filterTypes.includes(entityType)) return true;
    if (entityType === 'organization' && filterTypes.includes('group')) return true;
    if (entityType === 'group' && filterTypes.includes('organization')) return true;
    return false;
  }
  if (!preferredPreviewType) return true;
  const preferred = PREVIEW_TYPE_TO_SEARCH[preferredPreviewType] ?? [];
  if (!preferred.length) return true;
  return (
    preferred.includes(entityType)
    || (entityType === 'organization' && preferred.includes('group'))
    || (entityType === 'group' && preferred.includes('organization'))
  );
}

function scoreEntity(
  query: string,
  entity: IndexedEntity,
  filterTypes: EntitySearchType[] | undefined,
  preferredPreviewType?: string
): { score: number; matchKind: EntitySearchMatchKind } | null {
  const q = normalizeNameKey(query);
  if (!q || q.length < 1) return null;

  if (!typeCompatible(entity.entityType, filterTypes, preferredPreviewType)) {
    return null;
  }

  let matchKind: EntitySearchMatchKind = 'fuzzy';
  let base = 0;

  if (entity.normalizedName === q) {
    matchKind = 'exact';
    base = 1.0;
  } else if (entity.normalizedAliases.some((a) => a === q)) {
    matchKind = 'alias';
    base = 0.94;
  } else if (entity.normalizedName.includes(q) || q.includes(entity.normalizedName)) {
    base = 0.78;
  } else {
    const nameScore = jaroWinkler(q, entity.normalizedName);
    let aliasScore = 0;
    for (const alias of entity.normalizedAliases) {
      aliasScore = Math.max(aliasScore, jaroWinkler(q, alias));
    }
    base = Math.max(nameScore, aliasScore);
    if (base < 0.72) return null;
  }

  let score = base;
  if (entity.knownStatus === 'known') score += 0.03;
  if (typeCompatible(entity.entityType, PREVIEW_TYPE_TO_SEARCH[preferredPreviewType ?? ''] ?? [], preferredPreviewType)) {
    score += 0.04;
  }
  if (entity.recencyMs > 0) {
    const days = (Date.now() - entity.recencyMs) / (1000 * 60 * 60 * 24);
    if (days < 30) score += 0.05;
    else if (days < 180) score += 0.02;
  }

  return { score: Math.min(score, 1), matchKind };
}

async function loadIndexedEntities(userId: string): Promise<IndexedEntity[]> {
  const [certified, mentionable, glossaryRows] = await Promise.all([
    listCertifiedEntities(userId),
    listMentionableEntities(userId),
    supabaseAdmin
      .from('user_glossary_terms')
      .select('id, term, category, aliases, updated_at')
      .eq('user_id', userId)
      .limit(300)
      .then((r) => r.data ?? [])
      .catch(() => []),
  ]);

  const mentionStatus = new Map(mentionable.map((m) => [`${m.type}:${m.id}`, m.status]));
  const recencyBySlot = new Map<string, number>();

  const { data: charRows } = await supabaseAdmin
    .from('characters')
    .select('id, updated_at, summary')
    .eq('user_id', userId)
    .limit(500);
  for (const row of charRows ?? []) {
    recencyBySlot.set(`character:${row.id}`, row.updated_at ? Date.parse(row.updated_at) : 0);
  }

  const indexed: IndexedEntity[] = [];

  for (const entity of certified) {
    const slot = `${entity.type}:${entity.id}`;
    const status = mentionStatus.get(slot) === 'suggestion' ? 'suggestion' : 'known';
    const meta =
      entity.type === 'location' || entity.type === 'organization' || entity.type === 'skill'
        ? undefined
        : undefined;

    indexed.push({
      entityId: entity.id,
      entityType: certifiedToSearchType(entity.type, meta),
      displayName: entity.name,
      aliases: entity.aliases,
      knownStatus: status,
      confidence: status === 'known' ? 0.94 : 0.72,
      source: sourceLabel(entity.type, status),
      subtitle: entity.type === 'character'
        ? (charRows?.find((c) => c.id === entity.id)?.summary as string | undefined)?.slice(0, 80)
        : undefined,
      lastSeenAt: recencyBySlot.get(slot)
        ? new Date(recencyBySlot.get(slot)!).toISOString()
        : undefined,
      normalizedName: normalizeNameKey(entity.name),
      normalizedAliases: entity.aliases.map((a) => normalizeNameKey(a)).filter(Boolean),
      certifiedType: entity.type,
      recencyMs: recencyBySlot.get(slot) ?? 0,
    });
  }

  for (const row of glossaryRows as Array<{
    id: string;
    term: string;
    category?: string;
    aliases?: string[];
    updated_at?: string;
  }>) {
    const aliases = (row.aliases ?? []).filter(Boolean);
    const cat = String(row.category ?? '').toLowerCase();
    let entityType: EntitySearchType = 'person';
    if (cat.includes('place') || cat.includes('location')) entityType = 'place';
    else if (cat.includes('org')) entityType = 'organization';
    else if (cat.includes('group') || cat.includes('community')) entityType = 'group';
    else if (cat.includes('skill')) entityType = 'skill';
    else if (cat.includes('event')) entityType = 'event';

    indexed.push({
      entityId: row.id,
      entityType,
      displayName: row.term,
      aliases,
      knownStatus: 'known',
      confidence: 0.88,
      source: 'glossary',
      normalizedName: normalizeNameKey(row.term),
      normalizedAliases: aliases.map((a) => normalizeNameKey(a)).filter(Boolean),
      certifiedType: 'glossary',
      recencyMs: row.updated_at ? Date.parse(row.updated_at) : 0,
    });
  }

  const deduped = new Map<string, IndexedEntity>();
  for (const item of indexed) {
    const key = `${item.entityType}:${item.entityId}`;
    if (!deduped.has(key)) deduped.set(key, item);
  }
  return [...deduped.values()];
}

export async function searchEntities(input: EntitySearchInput): Promise<EntitySearchResponse> {
  const query = input.query.trim().slice(0, 120);
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
  const filterTypes = input.types?.length ? input.types : undefined;

  if (!query) {
    return { query, results: [] };
  }

  const index = await loadIndexedEntities(input.userId);
  const ranked: Array<EntitySearchResult & { _score: number }> = [];

  for (const entity of index) {
    const scored = scoreEntity(query, entity, filterTypes, input.preferredPreviewType);
    if (!scored) continue;
    ranked.push({
      entityId: entity.entityId,
      entityType: entity.entityType,
      displayName: entity.displayName,
      aliases: entity.aliases,
      knownStatus: entity.knownStatus,
      confidence: Math.round(scored.score * 100) / 100,
      source: entity.source,
      subtitle: entity.subtitle,
      lastSeenAt: entity.lastSeenAt,
      matchKind: scored.matchKind,
      _score: scored.score,
    });
  }

  ranked.sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    if (a.knownStatus !== b.knownStatus) return a.knownStatus === 'known' ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });

  return {
    query,
    results: ranked.slice(0, limit).map(({ _score: _, ...rest }) => rest),
  };
}

const TABLE_BY_TYPE: Record<EntitySearchType, string | null> = {
  person: 'characters',
  place: 'locations',
  organization: 'organizations',
  group: 'organizations',
  community: 'organizations',
  skill: 'skills',
  event: 'timeline_events',
};

/** Verify entity belongs to user before applying link correction. */
export async function validateEntityOwnership(
  userId: string,
  entityId: string,
  entityType: EntitySearchType
): Promise<boolean> {
  const table = TABLE_BY_TYPE[entityType];
  if (!table) return false;

  const { data } = await supabaseAdmin
    .from(table)
    .select('id')
    .eq('user_id', userId)
    .eq('id', entityId)
    .maybeSingle();

  if (data?.id) return true;

  if (entityType === 'person') {
    const { data: glossary } = await supabaseAdmin
      .from('user_glossary_terms')
      .select('id')
      .eq('user_id', userId)
      .eq('id', entityId)
      .maybeSingle();
    return !!glossary?.id;
  }

  return false;
}

export function previewTypeToDefaultSearchTypes(previewType: string): EntitySearchType[] {
  return PREVIEW_TYPE_TO_SEARCH[previewType] ?? ['person', 'organization', 'place', 'group', 'skill', 'event'];
}
