import {
  BOOK_QUERY_DOMAINS,
  familyQueryRequestSchema,
  locationQueryRequestSchema,
  organizationQueryRequestSchema,
  projectQueryRequestSchema,
  questQueryRequestSchema,
  romanceQueryRequestSchema,
  skillQueryRequestSchema,
  type BookQueryConnection,
  type BookQueryDomain,
  type UniversalBookQueryRequest,
  type UniversalBookQueryResponse,
  type UniversalBookQueryResult,
} from '@lorebook/api-contracts';

import { logger } from '../../logger';
import { queryBookEntities } from '../entities/bookEntityQueryService';
import { userFileRegistry } from '../ingestion/userFileRegistry';
import { queryFamilyForUser } from '../kinship/familyQueryService';
import { queryLocationsForUser } from '../locations/locationQueryService';
import { narrativeAnchorService } from '../narrative/narrativeAnchorService';
import { queryOrganizationsForUser } from '../organizations/organizationQueryService';
import { queryProjectsForUser } from '../projects/projectQueryService';
import { queryQuestsForUser } from '../quests/questQueryService';
import { queryRomanceForUser } from '../romance/romanceQueryService';
import { querySkillsForUser } from '../skills/skillQueryService';
import { supabaseAdmin } from '../supabaseClient';

import { detectBookQueryDomains } from './bookQueryIntent';
import { BOOK_QUERY_DOMAIN_CONCURRENCY } from './bookQuerySourceCaps';

export type BookQueryRegistryEntry = {
  domain: BookQueryDomain;
  label: string;
  description: string;
  route: string;
  supportsDemo: boolean;
  supportsEvidence: boolean;
};

export const BOOK_QUERY_REGISTRY: readonly BookQueryRegistryEntry[] = [
  { domain: 'character', label: 'People', description: 'People, aliases, roles, and relationship context', route: '/characters', supportsDemo: true, supportsEvidence: true },
  { domain: 'organization', label: 'Groups & Organizations', description: 'Membership, rosters, activity, and locations', route: '/organizations', supportsDemo: true, supportsEvidence: true },
  { domain: 'family', label: 'Family', description: 'Kinship, branches, households, and confidence', route: '/family', supportsDemo: true, supportsEvidence: true },
  { domain: 'location', label: 'Places', description: 'Visits, people, groups, hierarchy, and geography', route: '/locations', supportsDemo: true, supportsEvidence: true },
  { domain: 'romance', label: 'Dating & Romance', description: 'Romantic history, status, evidence, and review', route: '/love', supportsDemo: true, supportsEvidence: true },
  { domain: 'project', label: 'Projects', description: 'Status, type, activity, importance, and links', route: '/projects', supportsDemo: true, supportsEvidence: true },
  { domain: 'skill', label: 'Skills', description: 'Practice, growth, proficiency, work, and projects', route: '/skills', supportsDemo: true, supportsEvidence: true },
  { domain: 'quest', label: 'Quests', description: 'Active work, priorities, progress, blockers, and deadlines', route: '/quests', supportsDemo: true, supportsEvidence: true },
  { domain: 'event', label: 'Life Log', description: 'Events, people, places, participation, and chronology', route: '/events', supportsDemo: true, supportsEvidence: true },
  { domain: 'document', label: 'Documents', description: 'Uploaded files, processing state, and derived lore', route: '/documents', supportsDemo: true, supportsEvidence: true },
  { domain: 'narrative', label: 'Narrative Anchors', description: 'Durable eras, relationships, projects, and themes', route: '/narrative-anchors', supportsDemo: true, supportsEvidence: true },
] as const;

const STOP_WORDS = new Set([
  'a', 'about', 'all', 'am', 'and', 'are', 'at', 'book', 'books', 'did', 'do',
  'does', 'find', 'for', 'from', 'have', 'i', 'in', 'is', 'it', 'lorebook', 'me',
  'my', 'of', 'on', 'or', 'records', 'show', 'the', 'to', 'what', 'when', 'where',
  'which', 'who', 'with',
  ...BOOK_QUERY_DOMAINS,
  'people', 'person', 'characters', 'groups', 'organizations', 'places', 'locations',
  'relationships', 'dating', 'romance', 'projects', 'skills', 'quests', 'events',
  'timeline', 'documents', 'files', 'stories', 'anchors',
]);

type DomainQuery = (userId: string, request: UniversalBookQueryRequest) => Promise<UniversalBookQueryResult[]>;

function normalize(value: unknown): string {
  return String(value ?? '').toLowerCase().normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function queryTerms(query: string): string[] {
  return [...new Set(normalize(query).split(/\s+/).filter((term) => term.length > 2 && !STOP_WORDS.has(term)))];
}

function evidence(
  sourceTable: string,
  sourceId: string,
  label: string,
  confidence?: number | null,
  observedAt?: string | null,
) {
  return { sourceTable, sourceId, label, confidence, observedAt };
}

export function selectBookQueryDomains(request: UniversalBookQueryRequest): BookQueryDomain[] {
  if (request.domains?.length) return [...new Set(request.domains)];
  const matched = detectBookQueryDomains(request.query);
  return matched.length ? matched : [...BOOK_QUERY_DOMAINS];
}

export function inferBookQueryIntent(
  query: string,
  domains: BookQueryDomain[],
): UniversalBookQueryResponse['intent'] {
  if (domains.length > 1) return 'cross_book';
  if (/\b(?:timeline|when|before|after|during|year|month|recent)\b/i.test(query)) return 'timeline';
  if (/\b(?:relationship|related|connected|with|member|family)\b/i.test(query)) return 'relationship';
  if (/\b(?:needs? review|missing|uncertain|unlinked|low confidence)\b/i.test(query)) return 'quality';
  if (/\b(?:active|paused|completed|status|blocked|progress)\b/i.test(query)) return 'status';
  return 'find';
}

const queryCharacters: DomainQuery = async (userId, request) => {
  const response = await queryBookEntities(userId, { types: ['character'], limit: 100 });
  const terms = queryTerms(request.query);
  return response.entities
    .filter((row) => {
      if (!terms.length) return true;
      const searchable = normalize([row.name, ...row.aliases, row.status].join(' '));
      return terms.some((term) => searchable.includes(term));
    })
    .slice(0, request.perDomainLimit)
    .map((row) => ({
      id: row.id,
      domain: 'character' as const,
      title: row.name,
      subtitle: row.aliases.length ? `Also known as ${row.aliases.join(', ')}` : 'Character Book',
      status: row.status,
      updatedAt: row.updatedAt,
      score: terms.filter((term) => normalize([row.name, ...row.aliases].join(' ')).includes(term)).length * 10 + 1,
      matchedReasons: terms.length ? ['Matches a name or alias in Character Book'] : ['Character Book record'],
      evidence: request.includeEvidence ? [evidence('characters', row.id, 'Canonical Character Book record', null, row.updatedAt)] : [],
      relatedEntities: [],
    }));
};

const queryOrganizations: DomainQuery = async (userId, request) => {
  const response = await queryOrganizationsForUser(userId, organizationQueryRequestSchema.parse({
    query: request.query, limit: request.perDomainLimit, includeFacets: false,
  }));
  return response.results.map((row) => ({
    id: row.organizationId,
    domain: 'organization',
    title: row.name,
    subtitle: `${row.groupType.replaceAll('_', ' ')} · ${row.memberCount} member${row.memberCount === 1 ? '' : 's'}`,
    status: row.status,
    updatedAt: row.updatedAt,
    score: row.score,
    matchedReasons: row.matchedReasons,
    evidence: request.includeEvidence
      ? [evidence('organizations', row.organizationId, `${row.stance.replaceAll('_', ' ')} organization`, null, row.updatedAt)]
      : [],
    relatedEntities: row.evidence
      .filter((item) => item.kind === 'member' || item.kind === 'location')
      .map((item) => ({
        domain: item.kind === 'member' ? 'character' as const : 'location' as const,
        id: item.sourceId,
        name: item.label,
        relation: item.kind === 'member' ? 'member' : 'located at',
      })),
  }));
};

const queryFamily: DomainQuery = async (userId, request) => {
  const response = await queryFamilyForUser(userId, familyQueryRequestSchema.parse({
    query: request.query, limit: request.perDomainLimit, includeFacets: false,
  }));
  return response.results.map((row) => ({
    id: row.characterId,
    domain: 'family',
    title: row.name,
    subtitle: `${row.relationLabel}${row.side ? ` · ${row.side}` : ''}`,
    status: row.needsReview ? 'needs_review' : row.inferenceStatus,
    score: row.confidence * 100 + row.evidenceCount,
    matchedReasons: row.matchedReasons,
    evidence: request.includeEvidence
      ? [evidence('characters', row.characterId, `${row.evidenceCount} family evidence item${row.evidenceCount === 1 ? '' : 's'}`, row.confidence)]
      : [],
    relatedEntities: row.householdNames.map((name) => ({
      domain: 'location' as const, name, relation: 'household',
    })),
  }));
};

const queryLocations: DomainQuery = async (userId, request) => {
  const response = await queryLocationsForUser(userId, locationQueryRequestSchema.parse({
    query: request.query, limit: request.perDomainLimit, includeFacets: false,
  }));
  return response.results.map((row) => ({
    id: row.locationId,
    domain: 'location',
    title: row.name,
    subtitle: [row.type, row.city, row.visitCount ? `${row.visitCount} visits` : null].filter(Boolean).join(' · '),
    status: row.needsReview ? 'needs_review' : row.visitState,
    occurredAt: row.lastVisited,
    updatedAt: row.lastMentioned,
    score: row.score,
    matchedReasons: row.matchedReasons,
    evidence: request.includeEvidence
      ? [evidence('locations', row.locationId, `${row.visitCount} visits · ${row.mentionCount} mentions`, row.importanceScore, row.lastMentioned)]
      : [],
    relatedEntities: [
      ...row.peopleNames.map((name) => ({ domain: 'character' as const, name, relation: 'associated person' })),
      ...row.organizationNames.map((name) => ({ domain: 'organization' as const, name, relation: 'associated organization' })),
    ],
  }));
};

const queryRomance: DomainQuery = async (userId, request) => {
  const response = await queryRomanceForUser(userId, romanceQueryRequestSchema.parse({
    query: request.query, limit: request.perDomainLimit, includeFacets: false,
  }));
  return response.results.map((row) => ({
    id: row.relationshipId,
    domain: 'romance',
    title: row.personName,
    subtitle: `${row.relationshipType.replaceAll('_', ' ')} · ${row.evidenceStrength} evidence`,
    status: row.needsReview ? 'needs_review' : row.status,
    occurredAt: row.startDate,
    score: row.score,
    matchedReasons: row.matchedReasons,
    evidence: request.includeEvidence
      ? [evidence('romantic_relationships', row.relationshipId, `${row.evidenceStrength} relationship evidence`, null, row.startDate)]
      : [],
    relatedEntities: row.characterId
      ? [{ domain: 'character', id: row.characterId, name: row.personName, relation: 'character card' }]
      : [],
  }));
};

const queryProjects: DomainQuery = async (userId, request) => {
  const response = await queryProjectsForUser(userId, projectQueryRequestSchema.parse({
    query: request.query, limit: request.perDomainLimit, includeFacets: false,
  }));
  return response.results.map((row) => ({
    id: row.projectId,
    domain: 'project',
    title: row.name,
    subtitle: `${row.type} · ${row.associatedCharacterCount} people · ${row.associatedLocationCount} places`,
    status: row.needsReview ? 'needs_review' : row.status,
    occurredAt: row.startedAt,
    updatedAt: row.updatedAt,
    score: row.score,
    matchedReasons: row.matchedReasons,
    evidence: request.includeEvidence
      ? [evidence('projects', row.projectId, row.source ? `Source: ${row.source}` : 'Project Book record', row.importanceScore, row.updatedAt)]
      : [],
    relatedEntities: [],
  }));
};

const querySkills: DomainQuery = async (userId, request) => {
  const response = await querySkillsForUser(userId, skillQueryRequestSchema.parse({
    query: request.query, limit: request.perDomainLimit, includeFacets: false,
  }));
  return response.results.map((row) => ({
    id: row.skillId,
    domain: 'skill',
    title: row.name,
    subtitle: `${row.category} · level ${row.currentLevel} · ${row.practiceCount} practices`,
    status: row.needsReview ? 'needs_review' : row.active ? 'active' : 'inactive',
    occurredAt: row.lastPracticedAt,
    updatedAt: row.lastPracticedAt ?? row.firstMentionedAt,
    score: row.score,
    matchedReasons: row.matchedReasons,
    evidence: request.includeEvidence
      ? [evidence('skills', row.skillId, `${row.evidenceCount} skill evidence item${row.evidenceCount === 1 ? '' : 's'}`, row.confidenceScore, row.lastPracticedAt)]
      : [],
    relatedEntities: row.relatedProjects.map((name) => ({
      domain: 'project' as const, name, relation: 'used by project',
    })),
  }));
};

const queryQuests: DomainQuery = async (userId, request) => {
  const response = await queryQuestsForUser(userId, questQueryRequestSchema.parse({
    query: request.query, limit: request.perDomainLimit, includeFacets: false,
  }));
  return response.results.map((row) => ({
    id: row.questId,
    domain: 'quest',
    title: row.title,
    subtitle: `${row.type} quest · ${row.progress}% complete`,
    status: row.needsReview ? 'needs_review' : row.status,
    occurredAt: row.dueAt,
    updatedAt: row.lastActivityAt,
    score: row.score,
    matchedReasons: row.matchedReasons,
    evidence: request.includeEvidence
      ? [evidence('quests', row.questId, `Priority ${row.priority} · progress ${row.progress}%`, null, row.lastActivityAt)]
      : [],
    relatedEntities: [],
  }));
};

const queryEvents: DomainQuery = async (userId, request) => {
  const { data, error } = await supabaseAdmin
    .from('resolved_events')
    .select('id, title, summary, event_type, start_time, updated_at, confidence, people, locations, activities, metadata')
    .eq('user_id', userId)
    .order('start_time', { ascending: false })
    .limit(250);
  if (error) throw error;
  const terms = queryTerms(request.query);
  return (data ?? []).flatMap((row) => {
    const people = Array.isArray(row.people) ? row.people.filter((value): value is string => typeof value === 'string') : [];
    const locations = Array.isArray(row.locations) ? row.locations.filter((value): value is string => typeof value === 'string') : [];
    const activities = Array.isArray(row.activities) ? row.activities.filter((value): value is string => typeof value === 'string') : [];
    const searchable = normalize([row.title, row.summary, row.event_type, ...people, ...locations, ...activities].join(' '));
    const matched = terms.filter((term) => searchable.includes(term));
    if (terms.length && !matched.length) return [];
    return [{
      id: String(row.id),
      domain: 'event' as const,
      title: String(row.title || 'Untitled event'),
      subtitle: String(row.summary || row.event_type || 'Life Log event'),
      status: normalize((row.metadata as Record<string, unknown> | null)?.participation_role) || null,
      occurredAt: row.start_time ? String(row.start_time) : null,
      updatedAt: row.updated_at ? String(row.updated_at) : null,
      score: matched.length * 12 + Number(row.confidence ?? 0) * 10,
      matchedReasons: matched.length ? matched.slice(0, 3).map((term) => `Matches "${term}"`) : ['Life Log event'],
      evidence: request.includeEvidence
        ? [evidence('resolved_events', String(row.id), 'Canonical Life Log event', Number(row.confidence ?? 0), row.start_time ? String(row.start_time) : null)]
        : [],
      relatedEntities: [
        ...people.map((name) => ({ domain: 'character' as const, name, relation: 'event participant' })),
        ...locations.map((name) => ({ domain: 'location' as const, name, relation: 'event location' })),
      ],
    }];
  }).slice(0, request.perDomainLimit);
};

const queryDocuments: DomainQuery = async (userId, request) => {
  const rows = await userFileRegistry.listForUser(userId);
  const terms = queryTerms(request.query);
  return rows.flatMap((row) => {
    const searchable = normalize([row.filename, row.mime_type, row.ingest_kind, row.processing_status].join(' '));
    const matched = terms.filter((term) => searchable.includes(term));
    if (terms.length && !matched.length) return [];
    const counts = row.derived_counts ?? {};
    return [{
      id: row.id,
      domain: 'document' as const,
      title: row.filename,
      subtitle: `${row.ingest_kind ?? 'document'} · ${Number(counts.facts ?? 0)} facts · ${Number(counts.events ?? 0)} events`,
      status: row.processing_status,
      occurredAt: row.uploaded_at,
      updatedAt: row.uploaded_at,
      score: matched.length * 10 + Number(counts.facts ?? 0) + Number(counts.events ?? 0),
      matchedReasons: matched.length ? matched.slice(0, 3).map((term) => `Matches "${term}"`) : ['Uploaded document'],
      evidence: request.includeEvidence
        ? [evidence('user_files', row.id, 'Private uploaded source file', null, row.uploaded_at)]
        : [],
      relatedEntities: [],
    }];
  }).slice(0, request.perDomainLimit);
};

const queryNarrative: DomainQuery = async (userId, request) => {
  const rows = await narrativeAnchorService.listAnchors(userId, { limit: 100 });
  const terms = queryTerms(request.query);
  return rows.flatMap((row) => {
    const memberNames = [...row.entities, ...row.events, ...row.groups, ...row.places].map((item) => item.name);
    const searchable = normalize([row.title, row.anchorType, ...memberNames].join(' '));
    const matched = terms.filter((term) => searchable.includes(term));
    if (terms.length && !matched.length) return [];
    return [{
      id: row.id,
      domain: 'narrative' as const,
      title: row.title,
      subtitle: `${row.anchorType.replaceAll('_', ' ')} · ${memberNames.length} connected records`,
      status: row.confidence < 0.5 ? 'needs_review' : 'grounded',
      occurredAt: row.startDate,
      updatedAt: row.endDate,
      score: matched.length * 12 + row.gravityScore * 10,
      matchedReasons: matched.length ? matched.slice(0, 3).map((term) => `Matches "${term}"`) : ['Narrative anchor'],
      evidence: request.includeEvidence
        ? row.evidence.slice(0, 5).map((item, index) => evidence(
            item.source,
            item.sourceRef ?? item.id ?? `${row.id}:${index}`,
            item.label,
            item.confidence,
            row.startDate,
          ))
        : [],
      relatedEntities: [
        ...row.entities.map((item) => ({ domain: 'character' as const, id: item.id, name: item.name, relation: item.role ?? 'anchor member' })),
        ...row.groups.map((item) => ({ domain: 'organization' as const, id: item.id, name: item.name, relation: item.role ?? 'anchor group' })),
        ...row.places.map((item) => ({ domain: 'location' as const, id: item.id, name: item.name, relation: item.role ?? 'anchor place' })),
        ...row.events.map((item) => ({ domain: 'event' as const, id: item.id, name: item.name, relation: item.role ?? 'anchor event' })),
      ],
    }];
  }).slice(0, request.perDomainLimit);
};

const DOMAIN_QUERIES: Record<BookQueryDomain, DomainQuery> = {
  character: queryCharacters,
  organization: queryOrganizations,
  family: queryFamily,
  location: queryLocations,
  romance: queryRomance,
  project: queryProjects,
  skill: querySkills,
  quest: queryQuests,
  event: queryEvents,
  document: queryDocuments,
  narrative: queryNarrative,
};

export function buildBookQueryConnections(results: UniversalBookQueryResult[]): BookQueryConnection[] {
  const byDomainAndName = new Map<string, UniversalBookQueryResult>();
  const byDomainAndId = new Map<string, UniversalBookQueryResult>();
  for (const result of results) {
    byDomainAndName.set(`${result.domain}:${normalize(result.title)}`, result);
    byDomainAndId.set(`${result.domain}:${result.id}`, result);
  }
  const connections = new Map<string, BookQueryConnection>();
  for (const result of results) {
    for (const related of result.relatedEntities) {
      const target = (related.id ? byDomainAndId.get(`${related.domain}:${related.id}`) : undefined)
        ?? byDomainAndName.get(`${related.domain}:${normalize(related.name)}`);
      if (!target || target.id === result.id) continue;
      const key = [result.id, target.id].sort().join(':');
      connections.set(key, {
        fromId: result.id,
        toId: target.id,
        relation: related.relation,
        reason: `${result.title} is connected to ${target.title}`,
      });
    }
  }
  return [...connections.values()];
}

function facet<T extends string>(values: T[]): Array<{ value: T; count: number }> {
  const counts = new Map<T, number>();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

export async function queryBooksForUser(
  userId: string,
  request: UniversalBookQueryRequest,
): Promise<UniversalBookQueryResponse> {
  const startedAt = Date.now();
  const domains = selectBookQueryDomains(request);
  const settled: Array<{ domain: BookQueryDomain; results: UniversalBookQueryResult[]; error?: boolean }> = [];
  for (let i = 0; i < domains.length; i += BOOK_QUERY_DOMAIN_CONCURRENCY) {
    const chunk = domains.slice(i, i + BOOK_QUERY_DOMAIN_CONCURRENCY);
    const chunkSettled = await Promise.all(chunk.map(async (domain) => {
      try {
        return { domain, results: await DOMAIN_QUERIES[domain](userId, request) };
      } catch (error) {
        logger.warn({ error, domain, userId }, 'book query domain degraded');
        return { domain, results: [] as UniversalBookQueryResult[], error: true };
      }
    }));
    settled.push(...chunkSettled);
  }
  const degradedDomains = settled.filter((item) => item.error).map((item) => item.domain);
  const allResults = settled.flatMap((item) => item.results)
    .sort((left, right) => right.score - left.score || (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''));
  const results = allResults.slice(0, request.limit);
  const groups = domains.map((domain) => ({
    domain,
    count: allResults.filter((result) => result.domain === domain).length,
    results: results.filter((result) => result.domain === domain),
  })).filter((group) => group.count > 0);
  const warnings = degradedDomains.length
    ? [`Some books could not be searched: ${degradedDomains.join(', ')}.`]
    : [];
  if (!results.length && !warnings.length) {
    warnings.push('No grounded book records matched. LoreBook did not invent an answer.');
  }
  return {
    query: request.query,
    intent: inferBookQueryIntent(request.query, domains),
    results,
    connections: buildBookQueryConnections(results),
    groups,
    total: allResults.length,
    facets: {
      domains: facet(allResults.map((result) => result.domain)),
      statuses: facet(allResults.map((result) => result.status ?? '').filter(Boolean)),
    },
    warnings,
    diagnostics: {
      queriedDomains: domains,
      degradedDomains,
      elapsedMs: Date.now() - startedAt,
    },
  };
}
