import type {
  FamilyQueryRequest,
  FamilyQueryResponse,
  FamilyQueryResult,
} from '@lorebook/api-contracts';

import { familyGraphService, type FamilyGraph } from './familyGraphService';
import { householdService, type HouseholdDTO } from './householdService';

const RELATION_TERMS: Record<string, string> = {
  mom: 'parent', mother: 'parent', dad: 'parent', father: 'parent', parent: 'parent', parents: 'parent',
  sister: 'sibling', brother: 'sibling', sibling: 'sibling', siblings: 'sibling',
  grandma: 'grandparent', grandmother: 'grandparent', grandpa: 'grandparent',
  grandfather: 'grandparent', grandparent: 'grandparent', grandparents: 'grandparent',
  aunt: 'aunt', aunts: 'aunt', uncle: 'uncle', uncles: 'uncle',
  cousin: 'cousin', cousins: 'cousin', child: 'child', children: 'child',
  daughter: 'child', son: 'child', spouse: 'spouse', partner: 'spouse',
  'in-law': 'in_law', 'in-laws': 'in_law',
};

const STOP = new Set([
  'a', 'all', 'and', 'are', 'family', 'find', 'how', 'in', 'is', 'list', 'me', 'my',
  'need', 'needs', 'of', 'on', 'related', 'relative', 'relatives', 'show', 'side', 'the', 'to', 'tree', 'what', 'which', 'who',
]);

type FamilyQueryHints = {
  intent: FamilyQueryResponse['intent'];
  relations: string[];
  sides: Array<'maternal' | 'paternal' | 'partner' | 'both' | 'other'>;
  inferenceStatuses: Array<'asserted' | 'inferred' | 'placeholder'>;
  trends: Array<'growing' | 'stable' | 'inactive'>;
  needsReview?: boolean;
  hasCard?: boolean;
  personTerms: string[];
  householdTerms: string[];
  textTerms: string[];
};

function normalize(value: unknown): string {
  return String(value ?? '').toLowerCase().normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '').replace(/[^\p{L}\p{N}-]+/gu, ' ').trim();
}

const unique = <T,>(items: T[]): T[] => [...new Set(items)];

/**
 * Whole-word/phrase match, not substring — plain .includes() let "ben" match
 * inside "Ruben" and pull an unrelated family member into results.
 */
function containsWholeTerm(haystack: string, term: string): boolean {
  if (!term) return false;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`).test(haystack);
}

export function deriveFamilyQueryHints(query: string): FamilyQueryHints {
  const normalized = normalize(query);
  const words = normalized.split(/\s+/).filter(Boolean);
  const relations = unique(words.map((word) => RELATION_TERMS[word]).filter(Boolean));
  const sides: FamilyQueryHints['sides'] = [];
  const inferenceStatuses: FamilyQueryHints['inferenceStatuses'] = [];
  const trends: FamilyQueryHints['trends'] = [];
  let intent: FamilyQueryHints['intent'] = query.trim() ? 'person' : 'browse';
  let needsReview: boolean | undefined;
  let hasCard: boolean | undefined;

  if (relations.length) intent = 'kinship';
  if (/\bmaternal|mom(?:'s)? side\b/i.test(query)) { sides.push('maternal'); intent = 'branch'; }
  if (/\bpaternal|dad(?:'s)? side\b/i.test(query)) { sides.push('paternal'); intent = 'branch'; }
  if (/\bpartner branch\b/i.test(query)) { sides.push('partner'); intent = 'branch'; }
  if (/\binferred|unconfirmed\b/i.test(query)) inferenceStatuses.push('inferred');
  if (/\basserted|confirmed\b/i.test(query)) inferenceStatuses.push('asserted');
  if (/\bplaceholder|unknown parent\b/i.test(query)) inferenceStatuses.push('placeholder');
  if (/\bneeds? review|uncertain|questionable\b/i.test(query)) { needsReview = true; intent = 'quality'; }
  if (/\bwithout (?:a )?(?:character )?card|missing (?:a )?(?:character )?card|unlinked\b/i.test(query)) {
    hasCard = false; intent = 'quality';
  }
  if (/\bgrowing|getting closer\b/i.test(query)) { trends.push('growing'); intent = 'strength'; }
  if (/\binactive|distant|faded\b/i.test(query)) { trends.push('inactive'); intent = 'strength'; }
  if (/\bstable\b/i.test(query)) { trends.push('stable'); intent = 'strength'; }

  const householdCapture = query.match(/\b(?:in|at|from)\s+(?:the\s+)?(.+?\b(?:household|house|home|apartment|casa))\b/i);
  const householdTerms = householdCapture?.[1] ? [householdCapture[1].trim()] : [];
  if (/\b(?:household|who lives|residents?|visitors?|head of household)\b/i.test(query)) intent = 'household';

  const personCapture = query.match(/\bhow is\s+(.+?)\s+related to me\??$/i)
    ?? query.match(/\bwhat is\s+(.+?)\s+to me\??$/i);
  const personTerms = personCapture?.[1]?.trim() ? [personCapture[1].trim()] : [];
  const excluded = new Set([
    ...Object.keys(RELATION_TERMS),
    ...relations,
    ...sides,
    ...inferenceStatuses,
    ...trends,
    ...personTerms.flatMap((value) => normalize(value).split(/\s+/)),
    ...householdTerms.flatMap((value) => normalize(value).split(/\s+/)),
    'inferred', 'unconfirmed', 'asserted', 'confirmed', 'review', 'uncertain',
    'questionable', 'without', 'character', 'card', 'missing', 'unlinked',
    'growing', 'closer', 'inactive', 'distant', 'faded', 'stable', 'household',
    'house', 'home', 'apartment', 'casa', 'lives', 'residents', 'visitors', 'head',
    'maternal', 'paternal', 'partner', 'branch',
  ]);
  const textTerms = words.filter((word) => !STOP.has(word) && !excluded.has(word));

  return {
    intent, relations, sides: unique(sides), inferenceStatuses: unique(inferenceStatuses),
    trends: unique(trends), needsReview, hasCard, personTerms, householdTerms,
    textTerms: unique(textTerms),
  };
}

function facet(results: FamilyQueryResult[], key: (result: FamilyQueryResult) => string | null | undefined) {
  const counts = new Map<string, number>();
  for (const result of results) {
    const value = key(result);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function compileFamilyQuery(
  graph: FamilyGraph,
  households: HouseholdDTO[],
  analytics: Awaited<ReturnType<typeof familyGraphService.getAnalytics>>,
  request: FamilyQueryRequest,
): FamilyQueryResponse {
  const hints = deriveFamilyQueryHints(request.query);
  const filters = request.filters ?? {};
  const relations = unique([...(filters.relations ?? []), ...hints.relations]);
  const sides = unique([...(filters.sides ?? []), ...hints.sides]);
  const inferenceStatuses = unique([...(filters.inferenceStatuses ?? []), ...hints.inferenceStatuses]);
  const trends = unique([...(filters.trends ?? []), ...hints.trends]);
  const needsReview = filters.needsReview ?? hints.needsReview;
  const hasCard = filters.hasCard ?? hints.hasCard;
  const analyticById = new Map(analytics.map((item) => [item.characterId, item]));
  const nodeById = new Map(graph.nodes.map((node) => [node.characterId, node]));
  const householdNamesByMember = new Map<string, string[]>();
  for (const household of households) {
    for (const member of household.members) {
      householdNamesByMember.set(member.characterId, [
        ...(householdNamesByMember.get(member.characterId) ?? []),
        household.name,
      ]);
    }
  }

  let results = (graph.tree?.members ?? [])
    .filter((member) => !member.is_self)
    .map<FamilyQueryResult>((member) => {
      const node = nodeById.get(member.id);
      const analytic = analyticById.get(member.id);
      const memberHouseholds = householdNamesByMember.get(member.id) ?? [];
      const reasons: string[] = [];
      let score = 0;
      const searchable = normalize([
        member.name, member.first_name, member.last_name, member.kinship_title,
        member.relation, member.relation_label, ...memberHouseholds,
      ].filter(Boolean).join(' '));
      for (const term of [...hints.personTerms, ...hints.textTerms]) {
        if (containsWholeTerm(searchable, normalize(term))) { score += 10; reasons.push(`Name or family detail matches ${term}`); }
      }
      if (relations.includes(member.relation)) reasons.push(`Relationship: ${member.relation_label}`);
      if (member.side && sides.includes(member.side as typeof sides[number])) reasons.push(`Branch: ${member.side}`);
      if (member.inference_status && inferenceStatuses.includes(member.inference_status)) reasons.push(`Status: ${member.inference_status}`);
      if (analytic?.trend && trends.includes(analytic.trend)) reasons.push(`Trend: ${analytic.trend}`);
      if (needsReview && member.needs_review) reasons.push('Needs family review');
      if (hasCard === false && !member.has_card) reasons.push('Missing a linked Character card');
      return {
        characterId: member.id,
        name: member.name,
        relation: member.relation,
        relationLabel: member.relation_label,
        generation: member.generation,
        side: member.side ?? null,
        inferenceStatus: member.inference_status ?? null,
        closeness: member.closeness ?? null,
        confidence: node?.confidence ?? (member.inference_status === 'asserted' ? 0.95 : 0.8),
        evidenceCount: analytic?.evidenceCount ?? node?.evidenceCount ?? 0,
        mentionCount: analytic?.mentionCount ?? node?.mentionCount ?? 0,
        trend: analytic?.trend ?? null,
        householdNames: unique(memberHouseholds),
        hasCard: member.has_card !== false && !member.is_placeholder,
        needsReview: member.needs_review === true,
        matchedReasons: unique(reasons),
        score,
      } as FamilyQueryResult & { score: number };
    });

  if (filters.memberIds?.length) {
    const ids = new Set(filters.memberIds);
    results = results.filter((item) => ids.has(item.characterId));
  }
  if (relations.length) results = results.filter((item) => relations.includes(item.relation));
  if (sides.length) results = results.filter((item) => item.side && sides.includes(item.side as typeof sides[number]));
  if (filters.generations?.length) results = results.filter((item) => filters.generations!.includes(item.generation));
  if (inferenceStatuses.length) results = results.filter((item) => item.inferenceStatus && inferenceStatuses.includes(item.inferenceStatus as typeof inferenceStatuses[number]));
  if (trends.length) results = results.filter((item) => item.trend && trends.includes(item.trend as typeof trends[number]));
  if (needsReview !== undefined) results = results.filter((item) => item.needsReview === needsReview);
  if (hasCard !== undefined) results = results.filter((item) => item.hasCard === hasCard);
  if (filters.minEvidence !== undefined) results = results.filter((item) => item.evidenceCount >= filters.minEvidence!);
  const householdTerms = unique([...(filters.householdNames ?? []), ...hints.householdTerms]);
  if (householdTerms.length) {
    results = results.filter((item) => householdTerms.every((term) =>
      item.householdNames.some((name) => normalize(name).includes(normalize(term)))));
  }
  if (hints.personTerms.length || hints.textTerms.length) {
    results = results.filter((item) => (item as FamilyQueryResult & { score: number }).score > 0);
  }

  const total = results.length;
  const facets = request.includeFacets ? {
    relations: facet(results, (item) => item.relation),
    sides: facet(results, (item) => item.side),
    generations: facet(results, (item) => String(item.generation)),
    inferenceStatuses: facet(results, (item) => item.inferenceStatus),
    trends: facet(results, (item) => item.trend),
  } : { relations: [], sides: [], generations: [], inferenceStatuses: [], trends: [] };

  results.sort((a, b) => {
    if (request.sort === 'name_asc') return a.name.localeCompare(b.name);
    if (request.sort === 'generation') return a.generation - b.generation || a.name.localeCompare(b.name);
    if (request.sort === 'closeness_desc') return (b.closeness ?? 0) - (a.closeness ?? 0);
    if (request.sort === 'evidence_desc') return b.evidenceCount - a.evidenceCount;
    return ((b as FamilyQueryResult & { score: number }).score - (a as FamilyQueryResult & { score: number }).score)
      || b.evidenceCount - a.evidenceCount || a.name.localeCompare(b.name);
  });

  const householdResults = households
    .filter((household) => !householdTerms.length || householdTerms.every((term) =>
      normalize(`${household.name} ${household.locationName ?? ''}`).includes(normalize(term))))
    .map((household) => ({
      householdId: household.id,
      name: household.name,
      locationName: household.locationName ?? null,
      headOfHousehold: household.headOfHousehold ?? null,
      residentCount: household.residentCount,
      matchedMemberNames: household.members
        .filter((member) => results.some((result) => result.characterId === member.characterId))
        .map((member) => member.name),
      confidence: household.confidence,
    }));

  return {
    query: request.query,
    intent: hints.intent,
    results: results.slice(request.offset, request.offset + request.limit),
    households: hints.intent === 'household' || householdTerms.length ? householdResults : [],
    total,
    limit: request.limit,
    offset: request.offset,
    facets,
    warnings: [],
  };
}

export async function queryFamilyForUser(userId: string, request: FamilyQueryRequest): Promise<FamilyQueryResponse> {
  const [graph, households] = await Promise.all([
    familyGraphService.getGraph(userId),
    householdService.listHouseholds(userId),
  ]);
  const analytics = familyGraphService.analyticsFromGraph(graph);
  return compileFamilyQuery(graph, households, analytics, request);
}
