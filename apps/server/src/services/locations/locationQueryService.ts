import type {
  LocationQueryRequest,
  LocationQueryResponse,
  LocationQueryResult,
  LocationQueryVisitState,
} from '@lorebook/api-contracts';

import { logger } from '../../logger';
import type { LocationProfile } from '../../types';
import { locationService } from '../locationService';
import { supabaseAdmin } from '../supabaseClient';

type OrganizationLinkRow = {
  location_id: string;
  organization_id: string;
};

type QueryHints = {
  intent: LocationQueryResponse['intent'];
  personNames: string[];
  organizationNames: string[];
  parentNames: string[];
  visitStates: LocationQueryVisitState[];
  hasCoordinates?: boolean;
  needsReview?: boolean;
  textTerms: string[];
};

const STOP_WORDS = new Set([
  'a', 'all', 'are', 'at', 'been', 'did', 'do', 'find', 'for', 'go', 'have', 'i',
  'in', 'is', 'list', 'location', 'locations', 'me', 'my', 'of', 'place', 'places',
  'show', 'the', 'to', 'venue', 'venues', 'what', 'where', 'which', 'with',
]);

function normalize(value: unknown): string {
  return String(value ?? '')
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function capture(query: string, patterns: RegExp[]): string[] {
  for (const pattern of patterns) {
    const candidate = query.match(pattern)?.[1]?.trim().replace(/[?.!]+$/, '');
    if (candidate && candidate.length <= 160) return [candidate];
  }
  return [];
}

export function deriveLocationQueryHints(query: string): QueryHints {
  const visitStates: LocationQueryVisitState[] = [];
  let intent: QueryHints['intent'] = query.trim() ? 'find' : 'browse';
  let hasCoordinates: boolean | undefined;
  let needsReview: boolean | undefined;

  const personNames = capture(query, [
    /\b(?:places?|locations?|venues?)\s+(?:did\s+)?i\s+(?:go|went|visit|visited|was|have been)\s+(?:to\s+)?with\s+(.+?)$/i,
    /\bwhere\s+did\s+i\s+(?:go|visit|spend time)\s+with\s+(.+?)$/i,
    /\b(?:places?|locations?|venues?)\s+(?:associated|connected|linked)\s+with\s+(.+?)$/i,
  ]);
  if (personNames.length) intent = 'person';

  const organizationNames = capture(query, [
    /\b(?:places?|locations?|venues?)\s+(?:used|owned|operated|linked to|associated with|connected to)\s+(?:by\s+)?(.+?)$/i,
    /\bwhere\s+(?:is|was)\s+(.+?)\s+(?:based|located)\??$/i,
  ]);
  if (organizationNames.length && !personNames.length) intent = 'organization';

  const parentNames = capture(query, [
    /\b(?:places?|locations?|venues?)\s+(?:inside|within|under|nested in|part of)\s+(.+?)$/i,
    /\b(?:what|which)\s+is\s+(?:inside|within|under)\s+(.+?)$/i,
  ]);
  if (parentNames.length) intent = 'hierarchy';

  if (/\b(?:mentioned only|only mentioned|mentioned but (?:never|not) visited)\b/i.test(query)) {
    visitStates.push('mentioned_only');
    intent = 'activity';
  } else if (/\b(?:never visited|not visited|haven't visited|have not visited|unvisited)\b/i.test(query)) {
    visitStates.push('unvisited');
    intent = 'activity';
  } else if (/\b(?:visit|visited|been to|went to|places i go|places i went)\b/i.test(query)) {
    visitStates.push('visited');
    intent = personNames.length ? 'person' : 'activity';
  }

  if (/\b(?:without|missing|no)\s+(?:coordinates|location data|map pin)\b/i.test(query)) {
    hasCoordinates = false;
    intent = 'quality';
  } else if (/\b(?:with|has|have)\s+(?:coordinates|map pins?)\b/i.test(query)) {
    hasCoordinates = true;
    intent = 'quality';
  }

  if (/\b(?:needs? review|unresolved|uncertain|cleanup|incomplete)\b/i.test(query)) {
    needsReview = true;
    intent = 'quality';
  }
  if (/\b(?:inside|within|under|children of|nested in|part of)\b/i.test(query)) intent = 'hierarchy';
  if (/\b(?:in|near|around)\s+[\p{L}\p{N}]/iu.test(query) && intent === 'find') intent = 'geography';
  if (/\b(?:recent|lately|most visited|frequent|activity|trend)\b/i.test(query)) intent = 'activity';

  const excluded = new Set([
    ...personNames.flatMap((name) => normalize(name).split(/\s+/)),
    ...organizationNames.flatMap((name) => normalize(name).split(/\s+/)),
    ...parentNames.flatMap((name) => normalize(name).split(/\s+/)),
    'visit', 'visited', 'unvisited', 'mentioned', 'only', 'never', 'not', 'haven', 't', 'coordinates', 'coordinate',
    'map', 'pin', 'pins', 'need', 'needs', 'review', 'unresolved', 'uncertain', 'cleanup', 'incomplete',
    'recent', 'lately', 'most', 'frequent', 'activity', 'trend', 'inside', 'within',
    'under', 'children', 'nested', 'associated', 'connected', 'linked', 'used',
    'owned', 'operated', 'based', 'located',
  ]);
  const textTerms = normalize(query)
    .split(/\s+/)
    .filter(Boolean)
    .filter((term) => !STOP_WORDS.has(term) && !excluded.has(term));

  return {
    intent,
    personNames,
    organizationNames,
    parentNames,
    visitStates: unique(visitStates),
    hasCoordinates,
    needsReview,
    textTerms: unique(textTerms),
  };
}

function aliasesOf(location: LocationProfile): string[] {
  const aliases = location.metadata?.aliases;
  return Array.isArray(aliases)
    ? aliases.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];
}

function locationKind(location: LocationProfile): string {
  return location.root_type || location.spatial_category || location.type || 'other';
}

function visitState(location: LocationProfile): LocationQueryVisitState {
  if (location.visitCount > 0) return 'visited';
  if ((location.mentionCount ?? 0) > 0) return 'mentioned_only';
  return 'unvisited';
}

function needsReview(location: LocationProfile): boolean {
  const metadata = location.metadata ?? {};
  return (
    metadata.needs_review === true ||
    metadata.needsReview === true ||
    ['pending', 'needs_review', 'unresolved'].includes(normalize(metadata.review_status))
  );
}

function facet(items: LocationQueryResult[], key: (item: LocationQueryResult) => string | null | undefined) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = key(item);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function containsAll(values: string[], targets: string[]): boolean {
  return targets.every((target) => values.some((value) => normalize(value).includes(normalize(target))));
}

export function compileLocationQuery(
  locations: LocationProfile[],
  organizationNamesByLocation: Map<string, string[]>,
  request: LocationQueryRequest,
): LocationQueryResponse {
  const hints = deriveLocationQueryHints(request.query);
  const filters = request.filters ?? {};
  const personNames = unique([...(filters.personNames ?? []), ...hints.personNames]);
  const organizationNames = unique([...(filters.organizationNames ?? []), ...hints.organizationNames]);
  const visitStates = unique([...(filters.visitStates ?? []), ...hints.visitStates]);
  const hasCoordinates = filters.hasCoordinates ?? hints.hasCoordinates;
  const reviewRequired = filters.needsReview ?? hints.needsReview;
  const nameById = new Map(locations.map((location) => [location.id, location.name]));

  let results = locations.map<LocationQueryResult>((location) => {
    const aliases = aliasesOf(location);
    const peopleNames = location.relatedPeople.map((person) => person.name);
    const linkedOrganizations = organizationNamesByLocation.get(location.id) ?? [];
    const analytics = (location as LocationProfile & {
      analytics?: { trend?: string; importance_score?: number };
    }).analytics;
    const reasons: string[] = [];
    let score = 0;

    for (const term of hints.textTerms) {
      const directFields = [
        location.name, ...aliases, location.type, location.address, location.city,
        location.region, location.country, location.root_type, location.spatial_category,
        location.spatial_subcategory,
      ].map(normalize);
      if (directFields.some((value) => value.includes(term))) {
        score += normalize(location.name).includes(term) ? 12 : 8;
        reasons.push(`matches “${term}”`);
      } else if (peopleNames.some((name) => normalize(name).includes(term))) {
        score += 7;
        reasons.push(`linked to ${peopleNames.find((name) => normalize(name).includes(term))}`);
      } else if (linkedOrganizations.some((name) => normalize(name).includes(term))) {
        score += 7;
        reasons.push(`linked to ${linkedOrganizations.find((name) => normalize(name).includes(term))}`);
      } else {
        const tag = [
          ...(location.intrinsicTags ?? []),
          ...(location.visitContextTags ?? location.tagCounts),
          ...(location.storyTags ?? []),
        ].find((value) => normalize(value.tag).includes(term));
        const chapter = location.chapters.find((value) => normalize(value.title).includes(term));
        if (tag) {
          score += 5;
          reasons.push(`tagged ${tag.tag}`);
        } else if (chapter) {
          score += 5;
          reasons.push(`appears in ${chapter.title}`);
        } else {
          score -= 100;
        }
      }
    }

    if (personNames.length && containsAll(peopleNames, personNames)) {
      score += 20;
      reasons.push(`connected to ${personNames.join(', ')}`);
    }
    if (organizationNames.length && containsAll(linkedOrganizations, organizationNames)) {
      score += 20;
      reasons.push(`connected to ${organizationNames.join(', ')}`);
    }
    const parentName = location.parent_location_id ? nameById.get(location.parent_location_id) : null;
    if (hints.parentNames.length && parentName && containsAll([parentName], hints.parentNames)) {
      score += 20;
      reasons.push(`inside ${parentName}`);
    }
    const state = visitState(location);
    if (visitStates.includes(state)) reasons.push(state === 'visited' ? 'visited place' : state.replace('_', ' '));
    if (hasCoordinates === false && !location.coordinates) reasons.push('missing coordinates');
    if (reviewRequired && needsReview(location)) reasons.push('needs review');
    if (reasons.length === 0) reasons.push(`${location.visitCount} visits · ${location.mentionCount ?? 0} mentions`);

    return {
      locationId: location.id,
      name: location.name,
      aliases,
      type: location.type,
      kind: locationKind(location),
      address: location.address,
      city: location.city,
      region: location.region,
      country: location.country,
      parentLocationId: location.parent_location_id,
      visitState: state,
      visitCount: location.visitCount,
      mentionCount: location.mentionCount ?? 0,
      attendanceCount: location.attendanceCount ?? 0,
      lastVisited: location.lastVisited ?? null,
      lastMentioned: location.lastMentioned ?? null,
      hasCoordinates: Boolean(location.coordinates),
      peopleNames,
      organizationNames: linkedOrganizations,
      trend: analytics?.trend ?? null,
      importanceScore: analytics?.importance_score ?? null,
      needsReview: needsReview(location),
      score,
      matchedReasons: unique(reasons),
    };
  });

  if (hints.textTerms.length) results = results.filter((item) => item.score >= 0);
  if (filters.locationIds?.length) results = results.filter((item) => filters.locationIds!.includes(item.locationId));
  if (filters.types?.length) results = results.filter((item) => filters.types!.some((type) => normalize(item.type) === normalize(type)));
  if (filters.kinds?.length) results = results.filter((item) => filters.kinds!.some((kind) => normalize(item.kind) === normalize(kind)));
  if (filters.cities?.length) results = results.filter((item) => containsAll([item.city ?? ''], filters.cities!));
  if (filters.regions?.length) results = results.filter((item) => containsAll([item.region ?? ''], filters.regions!));
  if (filters.countries?.length) results = results.filter((item) => containsAll([item.country ?? ''], filters.countries!));
  if (personNames.length) results = results.filter((item) => containsAll(item.peopleNames, personNames));
  if (organizationNames.length) results = results.filter((item) => containsAll(item.organizationNames, organizationNames));
  if (hints.parentNames.length) {
    results = results.filter((item) => {
      const parentName = item.parentLocationId ? nameById.get(item.parentLocationId) : null;
      return Boolean(parentName && containsAll([parentName], hints.parentNames));
    });
  }
  if (filters.parentLocationIds?.length) results = results.filter((item) => item.parentLocationId && filters.parentLocationIds!.includes(item.parentLocationId));
  if (visitStates.length) results = results.filter((item) => visitStates.includes(item.visitState));
  if (filters.trends?.length) results = results.filter((item) => item.trend && filters.trends!.includes(item.trend as 'increasing' | 'stable' | 'decreasing'));
  if (hasCoordinates !== undefined) results = results.filter((item) => item.hasCoordinates === hasCoordinates);
  if (reviewRequired !== undefined) results = results.filter((item) => item.needsReview === reviewRequired);
  if (filters.minVisits !== undefined) results = results.filter((item) => item.visitCount >= filters.minVisits!);
  if (filters.minMentions !== undefined) results = results.filter((item) => item.mentionCount >= filters.minMentions!);

  const allMatches = [...results];
  const dateValue = (item: LocationQueryResult) =>
    Date.parse(item.lastVisited || item.lastMentioned || '') || 0;
  const inferredSort =
    request.sort === 'relevance' && /\b(?:recent|lately)\b/i.test(request.query)
      ? 'recent'
      : request.sort === 'relevance' && /\b(?:most visited|frequent)\b/i.test(request.query)
        ? 'visits_desc'
        : request.sort;
  if (inferredSort === 'name_asc') results.sort((a, b) => a.name.localeCompare(b.name));
  else if (inferredSort === 'recent') results.sort((a, b) => dateValue(b) - dateValue(a));
  else if (inferredSort === 'visits_desc') results.sort((a, b) => b.visitCount - a.visitCount);
  else if (inferredSort === 'mentions_desc') results.sort((a, b) => b.mentionCount - a.mentionCount);
  else if (inferredSort === 'importance_desc') results.sort((a, b) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0));
  else results.sort((a, b) => b.score - a.score || b.visitCount - a.visitCount || a.name.localeCompare(b.name));

  return {
    query: request.query,
    intent: hints.intent,
    results: results.slice(request.offset, request.offset + request.limit),
    total: results.length,
    limit: request.limit,
    offset: request.offset,
    facets: request.includeFacets
      ? {
          types: facet(allMatches, (item) => item.type),
          kinds: facet(allMatches, (item) => item.kind),
          cities: facet(allMatches, (item) => item.city),
          visitStates: facet(allMatches, (item) => item.visitState),
          trends: facet(allMatches, (item) => item.trend),
        }
      : { types: [], kinds: [], cities: [], visitStates: [], trends: [] },
    warnings: [],
  };
}

async function loadOrganizationNames(userId: string, locationIds: string[]): Promise<Map<string, string[]>> {
  const names = new Map<string, string[]>();
  if (!locationIds.length) return names;
  const { data: links, error: linkError } = await supabaseAdmin
    .from('organization_locations')
    .select('location_id, organization_id')
    .eq('user_id', userId)
    .in('location_id', locationIds);
  if (linkError) {
    logger.warn({ err: linkError, userId }, 'Location query could not load organization links');
    return names;
  }
  const typedLinks = (links ?? []) as OrganizationLinkRow[];
  const organizationIds = unique(typedLinks.map((link) => link.organization_id));
  if (!organizationIds.length) return names;
  const { data: organizations, error: organizationError } = await supabaseAdmin
    .from('organizations')
    .select('id, name')
    .eq('user_id', userId)
    .in('id', organizationIds);
  if (organizationError) {
    logger.warn({ err: organizationError, userId }, 'Location query could not load linked organizations');
    return names;
  }
  const nameById = new Map((organizations ?? []).map((organization) => [organization.id, organization.name]));
  for (const link of typedLinks) {
    const name = nameById.get(link.organization_id);
    if (!name) continue;
    names.set(link.location_id, unique([...(names.get(link.location_id) ?? []), name]));
  }
  return names;
}

export async function queryLocationsForUser(
  userId: string,
  request: LocationQueryRequest,
): Promise<LocationQueryResponse> {
  const locations = await locationService.listLocations(userId);
  const organizations = await loadOrganizationNames(userId, locations.map((location) => location.id));
  return compileLocationQuery(locations, organizations, request);
}
