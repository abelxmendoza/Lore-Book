import { supabaseAdmin } from '../supabaseClient';
import { normalizeNameKey } from '../../utils/nameNormalization';

export type EntityCoverageRow = {
  id: string;
  name: string;
  type: 'character' | 'people_place' | 'omega_entity';
  episodes: number;
  events: number;
  relationships: number;
  evidence: number;
  coverageScore: number;
  gaps: string[];
};

export type MemoryCoverageAudit = {
  generatedAt: string;
  userId: string;
  summary: {
    totalEntities: number;
    healthy: number;
    weak: number;
    orphaned: number;
    averageCoverageScore: number;
  };
  entities: EntityCoverageRow[];
};

function scoreCoverage(parts: {
  episodes: number;
  events: number;
  relationships: number;
  evidence: number;
}): number {
  const episodeScore = Math.min(1, parts.episodes / 2) * 0.35;
  const eventScore = Math.min(1, parts.events / 2) * 0.25;
  const relationshipScore = Math.min(1, parts.relationships / 2) * 0.2;
  const evidenceScore = Math.min(1, parts.evidence / 3) * 0.2;
  return Math.round((episodeScore + eventScore + relationshipScore + evidenceScore) * 100);
}

function gapsFor(row: Pick<EntityCoverageRow, 'episodes' | 'events' | 'relationships' | 'evidence'>): string[] {
  const gaps: string[] = [];
  if (row.episodes === 0) gaps.push('no episodes');
  if (row.events === 0) gaps.push('no events');
  if (row.relationships === 0) gaps.push('no relationships');
  if (row.evidence === 0) gaps.push('no evidence');
  return gaps;
}

function countBy<T extends Record<string, unknown>>(rows: T[], key: keyof T): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = row[key];
    if (typeof value !== 'string' || !value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

export async function buildMemoryCoverageAudit(userId: string): Promise<MemoryCoverageAudit> {
  const [
    charactersResult,
    peoplePlacesResult,
    omegaResult,
    characterMemoriesResult,
    characterEventsResult,
    characterRelationshipsResult,
    entityFactsResult,
    omegaClaimsResult,
    authorityMapResult,
  ] = await Promise.all([
    supabaseAdmin.from('characters').select('id, name').eq('user_id', userId),
    supabaseAdmin.from('people_places').select('id, name, type, related_entries').eq('user_id', userId),
    supabaseAdmin.from('omega_entities').select('id, primary_name, type, mention_count').eq('user_id', userId).limit(500),
    supabaseAdmin.from('character_memories').select('character_id').eq('user_id', userId),
    supabaseAdmin.from('character_timeline_events').select('character_id').eq('user_id', userId),
    supabaseAdmin.from('character_relationships').select('source_character_id, target_character_id').eq('user_id', userId),
    supabaseAdmin.from('entity_facts').select('entity_id, entity_type').eq('user_id', userId).eq('status', 'active'),
    supabaseAdmin.from('omega_claims').select('entity_id').eq('user_id', userId).eq('is_active', true),
    supabaseAdmin.from('character_authority_map').select('source_id, canonical_character_id').eq('user_id', userId).eq('source_table', 'omega_entities'),
  ]);

  const memoryCounts = countBy((characterMemoriesResult.data ?? []) as any[], 'character_id');
  const eventCounts = countBy((characterEventsResult.data ?? []) as any[], 'character_id');
  const factCounts = countBy(
    ((entityFactsResult.data ?? []) as any[]).filter((row) => row.entity_type === 'character'),
    'entity_id'
  );
  const omegaClaimCounts = countBy((omegaClaimsResult.data ?? []) as any[], 'entity_id');

  const relationshipCounts = new Map<string, number>();
  for (const row of (characterRelationshipsResult.data ?? []) as any[]) {
    for (const id of [row.source_character_id, row.target_character_id]) {
      if (typeof id === 'string') relationshipCounts.set(id, (relationshipCounts.get(id) ?? 0) + 1);
    }
  }

  const omegaCharIdByEntityId = new Map<string, string>();
  for (const row of (authorityMapResult.data ?? []) as any[]) {
    if (typeof row.source_id === 'string' && typeof row.canonical_character_id === 'string') {
      omegaCharIdByEntityId.set(row.source_id, row.canonical_character_id);
    }
  }

  const charIdByNameKey = new Map<string, string>();
  for (const row of (charactersResult.data ?? []) as any[]) {
    const key = normalizeNameKey(String(row.name ?? ''));
    if (key) charIdByNameKey.set(key, row.id);
  }

  const characterStatsForId = (charId: string) => ({
    episodes: memoryCounts.get(charId) ?? 0,
    events: eventCounts.get(charId) ?? 0,
    relationships: relationshipCounts.get(charId) ?? 0,
    evidence: factCounts.get(charId) ?? 0,
  });

  const linkedCharacterStats = (name: string, omegaEntityId?: string) => {
    const charId =
      (omegaEntityId ? omegaCharIdByEntityId.get(omegaEntityId) : undefined) ??
      charIdByNameKey.get(normalizeNameKey(name));
    if (!charId) return null;
    return characterStatsForId(charId);
  };

  const entities: EntityCoverageRow[] = [];

  for (const row of (charactersResult.data ?? []) as any[]) {
    const base = {
      episodes: memoryCounts.get(row.id) ?? 0,
      events: eventCounts.get(row.id) ?? 0,
      relationships: relationshipCounts.get(row.id) ?? 0,
      evidence: factCounts.get(row.id) ?? 0,
    };
    entities.push({
      id: row.id,
      name: row.name,
      type: 'character',
      ...base,
      coverageScore: scoreCoverage(base),
      gaps: gapsFor(base),
    });
  }

  for (const row of (peoplePlacesResult.data ?? []) as any[]) {
    const relatedEntries = Array.isArray(row.related_entries) ? row.related_entries.length : 0;
    const linked = linkedCharacterStats(String(row.name ?? ''));
    const base = linked
      ? {
          episodes: Math.max(relatedEntries, linked.episodes),
          events: linked.events,
          relationships: linked.relationships,
          evidence: linked.evidence,
        }
      : {
          episodes: relatedEntries,
          events: 0,
          relationships: 0,
          evidence: 0,
        };
    entities.push({
      id: row.id,
      name: row.name,
      type: 'people_place',
      ...base,
      coverageScore: scoreCoverage(base),
      gaps: gapsFor(base),
    });
  }

  for (const row of (omegaResult.data ?? []) as any[]) {
    const linked = linkedCharacterStats(String(row.primary_name ?? ''), row.id);
    const base = linked
      ? {
          episodes: Math.max(Number(row.mention_count ?? 0), linked.episodes),
          events: linked.events,
          relationships: linked.relationships,
          evidence: Math.max(omegaClaimCounts.get(row.id) ?? 0, linked.evidence),
        }
      : {
          episodes: Number(row.mention_count ?? 0),
          events: 0,
          relationships: 0,
          evidence: omegaClaimCounts.get(row.id) ?? 0,
        };
    entities.push({
      id: row.id,
      name: row.primary_name,
      type: 'omega_entity',
      ...base,
      coverageScore: scoreCoverage(base),
      gaps: gapsFor(base),
    });
  }

  const averageCoverageScore = entities.length
    ? Math.round(entities.reduce((sum, entity) => sum + entity.coverageScore, 0) / entities.length)
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    userId,
    summary: {
      totalEntities: entities.length,
      healthy: entities.filter((entity) => entity.coverageScore >= 70).length,
      weak: entities.filter((entity) => entity.coverageScore > 0 && entity.coverageScore < 70).length,
      orphaned: entities.filter((entity) => entity.coverageScore === 0).length,
      averageCoverageScore,
    },
    entities: entities.sort((a, b) => a.coverageScore - b.coverageScore || a.name.localeCompare(b.name)),
  };
}
