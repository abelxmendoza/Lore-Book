import type {
  OrganizationQueryRequest,
  OrganizationQueryResponse,
  OrganizationQueryResult,
  OrganizationQueryStance,
} from '@lorebook/api-contracts';

import { organizationService, type Organization } from '../organizationService';
import { isReviewPending } from '../reviewableRecord';

const MINE_RELATIONSHIPS = new Set(['founder', 'leader', 'member', 'alumnus', 'former_member']);
const CLOSE_RELATIONSHIPS = new Set(['adjacent', 'collaborator']);

const QUERY_STOP_WORDS = new Set([
  'a', 'all', 'am', 'are', 'associated', 'belong', 'connected', 'do', 'find',
  'for', 'group', 'groups', 'i', 'in', 'is', 'list', 'me', 'my', 'of', 'organization',
  'organizations', 'part', 'show', 'the', 'to', 'what', 'which', 'who', 'with',
]);

const GROUP_TYPE_TERMS: Record<string, string> = {
  band: 'band',
  bands: 'band',
  company: 'company',
  companies: 'company',
  crew: 'crew',
  crews: 'crew',
  family: 'family',
  families: 'family',
  club: 'club',
  clubs: 'club',
  team: 'team',
  teams: 'team',
  community: 'community',
  communities: 'community',
  collective: 'collective',
  collectives: 'collective',
  nonprofit: 'nonprofit',
  nonprofits: 'nonprofit',
  scene: 'scene',
  scenes: 'scene',
};

type QueryHints = {
  intent: OrganizationQueryResponse['intent'];
  stances: OrganizationQueryStance[];
  groupTypes: string[];
  memberNames: string[];
  locationNames: string[];
  hasUnlinkedMembers?: boolean;
  textTerms: string[];
};

function normalize(value: unknown): string {
  return String(value ?? '')
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function extractCapturedName(query: string): string | null {
  const patterns = [
    /(?:what|which)\s+(?:groups?|organizations?)\s+(?:is|are)\s+(.+?)\s+(?:in|part\s+of|connected\s+to|associated\s+with)\??$/i,
    /(?:groups?|organizations?)\s+(?:with|including|that\s+include)\s+(.+?)\??$/i,
  ];
  for (const pattern of patterns) {
    const match = query.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate && candidate.length <= 160) return candidate;
  }
  return null;
}

export function deriveOrganizationQueryHints(query: string): QueryHints {
  const normalized = normalize(query);
  const words = normalized.split(/\s+/).filter(Boolean);
  const stances: OrganizationQueryStance[] = [];
  const groupTypes: string[] = [];
  const memberNames: string[] = [];
  let intent: QueryHints['intent'] = query.trim() ? 'find' : 'browse';
  let hasUnlinkedMembers: boolean | undefined;

  if (/\b(?:my groups?|(?:which|what) (?:groups?|organizations?) am i in|groups? (?:i am|i'm|im) (?:in|part of)|belong to)\b/i.test(query)) {
    stances.push('mine');
    intent = 'membership';
  }
  if (/\b(?:close to|near me|my orbit)\b/i.test(query)) stances.push('close_to');
  if (/\b(?:their world|their groups?|people i know are in)\b/i.test(query)) stances.push('their_world');
  if (/\b(?:mentioned|background|reference only)\b/i.test(query)) stances.push('mentioned');
  if (/\b(?:unlinked|unresolved|not linked|missing character)\b/i.test(query)) {
    hasUnlinkedMembers = true;
    intent = 'quality';
  }

  for (const word of words) {
    const groupType = GROUP_TYPE_TERMS[word];
    if (groupType) groupTypes.push(groupType);
  }

  const capturedName = extractCapturedName(query);
  if (capturedName) {
    memberNames.push(capturedName);
    intent = 'membership';
  }

  const locationMatch = query.match(/\b(?:at|based in|located in)\s+(.+?)\??$/i);
  const locationNames = locationMatch?.[1]?.trim() ? [locationMatch[1].trim()] : [];
  if (locationNames.length > 0) intent = 'location';

  if (/\b(?:events?|stories|activity|active lately|recent)\b/i.test(query)) {
    intent = 'activity';
  }

  const excluded = new Set([
    ...memberNames.flatMap((name) => normalize(name).split(/\s+/)),
    ...locationNames.flatMap((name) => normalize(name).split(/\s+/)),
    ...groupTypes,
    ...Object.keys(GROUP_TYPE_TERMS),
    'unlinked',
    'unresolved',
    'missing',
    'character',
    'mentioned',
    'background',
    'reference',
    'only',
    'mine',
    'close',
    'near',
    'their',
    'world',
    'people',
    'know',
    'active',
    'lately',
    'recent',
    'events',
    'event',
    'stories',
    'story',
    'activity',
  ]);
  const textTerms = words.filter((word) => !QUERY_STOP_WORDS.has(word) && !excluded.has(word));

  return {
    intent,
    stances: unique(stances),
    groupTypes: unique(groupTypes),
    memberNames,
    locationNames,
    hasUnlinkedMembers,
    textTerms: unique(textTerms),
  };
}

export function resolveOrganizationQueryStance(org: Organization): OrganizationQueryStance {
  if (MINE_RELATIONSHIPS.has(org.user_relationship)) return 'mine';
  if (CLOSE_RELATIONSHIPS.has(org.user_relationship)) return 'close_to';
  const confirmed = org.metadata?.user_relationship_source === 'user_confirmed';
  if (confirmed && org.user_relationship === 'aware_of') return 'their_world';
  if (confirmed && (org.user_relationship === 'referenced' || org.user_relationship === 'fan')) {
    return 'mentioned';
  }
  const members = org.members ?? [];
  const linkedCount = members.filter((member) => Boolean(member.character_id)).length;
  const rosterCount = members.length || org.member_count || 0;
  if (linkedCount > 0 || (rosterCount > 0 && !org.is_public_entity)) return 'their_world';
  return 'mentioned';
}

function facet(items: OrganizationQueryResult[], key: (item: OrganizationQueryResult) => string) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function includesEvery(haystacks: string[], needles: string[]): boolean {
  return needles.every((needle) => haystacks.some((haystack) => haystack.includes(normalize(needle))));
}

export function compileOrganizationQuery(
  organizations: Organization[],
  request: OrganizationQueryRequest,
): OrganizationQueryResponse {
  const hints = deriveOrganizationQueryHints(request.query);
  const filters = request.filters ?? {};
  const visibleOrganizations = organizations.filter((organization) => !isReviewPending(organization.metadata));
  const stances = unique([...(filters.stances ?? []), ...hints.stances]);
  const groupTypes = unique([...(filters.groupTypes ?? []), ...hints.groupTypes]);
  const statuses = unique(filters.statuses ?? []);
  const memberNames = unique([...(filters.memberNames ?? []), ...hints.memberNames]);
  const locationNames = unique([...(filters.locationNames ?? []), ...hints.locationNames]);
  const hasUnlinkedMembers = filters.hasUnlinkedMembers ?? hints.hasUnlinkedMembers;

  let results = visibleOrganizations.map<OrganizationQueryResult>((org) => {
    const members = org.members ?? [];
    const locations = org.locations ?? [];
    const stories = org.stories ?? [];
    const events = org.events ?? [];
    const evidence: OrganizationQueryResult['evidence'] = [];
    const reasons: string[] = [];
    let score = 0;

    for (const term of hints.textTerms) {
      if (normalize(org.name).includes(term)) {
        score += 12;
        evidence.push({ kind: 'name', label: org.name });
      } else {
        const alias = (org.aliases ?? []).find((value) => normalize(value).includes(term));
        const member = members.find((value) => normalize(value.character_name).includes(term));
        const location = locations.find((value) => normalize(value.location_name).includes(term));
        if (alias) {
          score += 9;
          evidence.push({ kind: 'alias', label: alias });
        } else if (member) {
          score += 8;
          evidence.push({ kind: 'member', label: member.character_name, sourceId: member.id });
        } else if (location) {
          score += 7;
          evidence.push({ kind: 'location', label: location.location_name, sourceId: location.id });
        } else if (normalize(org.description).includes(term)) {
          score += 5;
          evidence.push({ kind: 'description', label: org.description ?? '' });
        }
      }
    }

    const linkedMemberCount = members.filter((member) => Boolean(member.character_id)).length;
    const memberCount = members.length || org.member_count || 0;
    const unlinkedMemberCount = Math.max(0, memberCount - linkedMemberCount);
    const activityCount = stories.length + events.length;
    const stance = resolveOrganizationQueryStance(org);

    if (stances.includes(stance)) reasons.push(`Relationship: ${stance.replace('_', ' ')}`);
    if (groupTypes.includes(org.group_type)) reasons.push(`Type: ${org.group_type.replaceAll('_', ' ')}`);
    if (memberNames.length && includesEvery(members.map((member) => normalize(member.character_name)), memberNames)) {
      reasons.push(`Roster includes ${memberNames.join(', ')}`);
    }
    if (locationNames.length && includesEvery(locations.map((location) => normalize(location.location_name)), locationNames)) {
      reasons.push(`Linked to ${locationNames.join(', ')}`);
    }
    if (hasUnlinkedMembers && unlinkedMemberCount > 0) reasons.push(`${unlinkedMemberCount} unlinked roster member${unlinkedMemberCount === 1 ? '' : 's'}`);
    for (const item of evidence) {
      if (item.kind === 'member') reasons.push(`Member match: ${item.label}`);
      else if (item.kind === 'location') reasons.push(`Location match: ${item.label}`);
      else if (item.kind === 'alias') reasons.push(`Alias match: ${item.label}`);
    }

    return {
      organizationId: org.id,
      name: org.name,
      aliases: org.aliases ?? [],
      description: org.description ?? null,
      groupType: org.group_type,
      status: org.status,
      userRelationship: org.user_relationship ?? null,
      stance,
      memberCount,
      linkedMemberCount,
      unlinkedMemberCount,
      activityCount,
      locationCount: locations.length,
      updatedAt: org.updated_at ?? null,
      score,
      matchedReasons: unique(reasons),
      evidence,
    };
  });

  if (filters.organizationIds?.length) {
    const ids = new Set(filters.organizationIds);
    results = results.filter((result) => ids.has(result.organizationId));
  }
  if (stances.length) results = results.filter((result) => stances.includes(result.stance));
  if (groupTypes.length) results = results.filter((result) => groupTypes.includes(result.groupType));
  if (statuses.length) results = results.filter((result) => statuses.includes(result.status));
  if (memberNames.length) {
    results = results.filter((result) => {
      const org = visibleOrganizations.find((candidate) => candidate.id === result.organizationId);
      return includesEvery((org?.members ?? []).map((member) => normalize(member.character_name)), memberNames);
    });
  }
  if (locationNames.length) {
    results = results.filter((result) => {
      const org = visibleOrganizations.find((candidate) => candidate.id === result.organizationId);
      return includesEvery((org?.locations ?? []).map((location) => normalize(location.location_name)), locationNames);
    });
  }
  if (hasUnlinkedMembers !== undefined) {
    results = results.filter((result) => (result.unlinkedMemberCount > 0) === hasUnlinkedMembers);
  }
  if (hints.textTerms.length) {
    results = results.filter((result) => result.score > 0);
  }

  const total = results.length;
  const facets = request.includeFacets
    ? {
        stances: facet(results, (result) => result.stance),
        groupTypes: facet(results, (result) => result.groupType),
        statuses: facet(results, (result) => result.status),
      }
    : { stances: [], groupTypes: [], statuses: [] };

  results.sort((a, b) => {
    switch (request.sort) {
      case 'name_asc': return a.name.localeCompare(b.name);
      case 'name_desc': return b.name.localeCompare(a.name);
      case 'recent': return Date.parse(b.updatedAt ?? '') - Date.parse(a.updatedAt ?? '');
      case 'member_count_desc': return b.memberCount - a.memberCount || a.name.localeCompare(b.name);
      case 'activity_desc': return b.activityCount - a.activityCount || a.name.localeCompare(b.name);
      default: return b.score - a.score || b.activityCount - a.activityCount || a.name.localeCompare(b.name);
    }
  });

  return {
    query: request.query,
    intent: hints.intent,
    results: results.slice(request.offset, request.offset + request.limit),
    total,
    limit: request.limit,
    offset: request.offset,
    facets,
    appliedFilters: {
      stances,
      groupTypes,
      statuses,
      memberNames,
      locationNames,
      ...(hasUnlinkedMembers === undefined ? {} : { hasUnlinkedMembers }),
    },
    warnings: [],
  };
}

export async function queryOrganizationsForUser(
  userId: string,
  request: OrganizationQueryRequest,
): Promise<OrganizationQueryResponse> {
  const organizations = await organizationService.listOrganizations(userId);
  return compileOrganizationQuery(organizations, request);
}
