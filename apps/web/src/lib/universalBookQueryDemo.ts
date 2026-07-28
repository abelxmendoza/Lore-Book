import type {
  BookQueryDomain,
  UniversalBookQueryResponse,
  UniversalBookQueryResult,
} from './api-contracts';

const DEMO_ROWS: UniversalBookQueryResult[] = [
  {
    id: 'demo-character-marcus',
    domain: 'character',
    title: 'Marcus Hale',
    subtitle: 'Close friend · Character Book',
    status: 'active',
    updatedAt: '2026-07-18T12:00:00.000Z',
    score: 92,
    matchedReasons: ['Name and relationship context match'],
    evidence: [{ sourceTable: 'characters', sourceId: 'demo-character-marcus', label: 'Synthetic Character Book record', confidence: 0.92 }],
    relatedEntities: [{ domain: 'organization', id: 'demo-org-vanguard', name: 'Vanguard Robotics', relation: 'member' }],
  },
  {
    id: 'demo-org-vanguard',
    domain: 'organization',
    title: 'Vanguard Robotics',
    subtitle: 'Team · 4 members',
    status: 'active',
    updatedAt: '2026-07-20T12:00:00.000Z',
    score: 90,
    matchedReasons: ['Active organization connected to a project'],
    evidence: [{ sourceTable: 'organizations', sourceId: 'demo-org-vanguard', label: 'Synthetic organization record', confidence: 0.9 }],
    relatedEntities: [{ domain: 'project', id: 'demo-project-memovault', name: 'MemoVault', relation: 'supports project' }],
  },
  {
    id: 'demo-family-jamie',
    domain: 'family',
    title: 'Jamie Hale',
    subtitle: 'Cousin · maternal branch',
    status: 'asserted',
    score: 84,
    matchedReasons: ['Maternal family relationship matches'],
    evidence: [{ sourceTable: 'characters', sourceId: 'demo-family-jamie', label: 'Synthetic family evidence', confidence: 0.84 }],
    relatedEntities: [],
  },
  {
    id: 'demo-location-workshop',
    domain: 'location',
    title: 'Vanguard Workshop',
    subtitle: 'Workshop · 8 visits',
    status: 'visited',
    occurredAt: '2026-07-19T12:00:00.000Z',
    score: 88,
    matchedReasons: ['Project and organization location match'],
    evidence: [{ sourceTable: 'locations', sourceId: 'demo-location-workshop', label: 'Synthetic visit evidence', confidence: 0.88 }],
    relatedEntities: [{ domain: 'organization', id: 'demo-org-vanguard', name: 'Vanguard Robotics', relation: 'organization location' }],
  },
  {
    id: 'demo-romance-jamie',
    domain: 'romance',
    title: 'Jamie Rivera',
    subtitle: 'Past relationship · strong evidence',
    status: 'ended',
    score: 78,
    matchedReasons: ['Relationship history matches'],
    evidence: [{ sourceTable: 'romantic_relationships', sourceId: 'demo-romance-jamie', label: 'Synthetic reviewed relationship', confidence: 0.78 }],
    relatedEntities: [],
  },
  {
    id: 'demo-project-memovault',
    domain: 'project',
    title: 'MemoVault',
    subtitle: 'Software · 3 people · 1 place',
    status: 'active',
    updatedAt: '2026-07-22T12:00:00.000Z',
    score: 96,
    matchedReasons: ['Active software project matches'],
    evidence: [{ sourceTable: 'projects', sourceId: 'demo-project-memovault', label: 'Synthetic Project Book record', confidence: 0.96 }],
    relatedEntities: [{ domain: 'skill', id: 'demo-skill-typescript', name: 'TypeScript', relation: 'uses skill' }],
  },
  {
    id: 'demo-skill-typescript',
    domain: 'skill',
    title: 'TypeScript',
    subtitle: 'Technical · level 7 · 22 practices',
    status: 'active',
    updatedAt: '2026-07-21T12:00:00.000Z',
    score: 94,
    matchedReasons: ['Used by an active software project'],
    evidence: [{ sourceTable: 'skills', sourceId: 'demo-skill-typescript', label: 'Synthetic practice evidence', confidence: 0.94 }],
    relatedEntities: [{ domain: 'project', id: 'demo-project-memovault', name: 'MemoVault', relation: 'used by project' }],
  },
  {
    id: 'demo-quest-launch',
    domain: 'quest',
    title: 'Launch the MemoVault beta',
    subtitle: 'Main quest · 65% complete',
    status: 'active',
    updatedAt: '2026-07-23T12:00:00.000Z',
    score: 98,
    matchedReasons: ['Current high-priority work matches'],
    evidence: [{ sourceTable: 'quests', sourceId: 'demo-quest-launch', label: 'Synthetic progress evidence', confidence: 0.98 }],
    relatedEntities: [{ domain: 'project', id: 'demo-project-memovault', name: 'MemoVault', relation: 'advances project' }],
  },
  {
    id: 'demo-event-prototype',
    domain: 'event',
    title: 'First working prototype',
    subtitle: 'The team completed the first end-to-end MemoVault flow.',
    status: 'direct_participant',
    occurredAt: '2026-07-17T18:00:00.000Z',
    score: 89,
    matchedReasons: ['Project milestone event matches'],
    evidence: [{ sourceTable: 'resolved_events', sourceId: 'demo-event-prototype', label: 'Synthetic Life Log event', confidence: 0.89 }],
    relatedEntities: [{ domain: 'project', id: 'demo-project-memovault', name: 'MemoVault', relation: 'project milestone' }],
  },
  {
    id: 'demo-document-plan',
    domain: 'document',
    title: 'MemoVault product plan.pdf',
    subtitle: 'document · 12 facts · 2 events',
    status: 'completed',
    occurredAt: '2026-07-16T12:00:00.000Z',
    score: 82,
    matchedReasons: ['Uploaded source document matches'],
    evidence: [{ sourceTable: 'user_files', sourceId: 'demo-document-plan', label: 'Synthetic private source file', confidence: 0.82 }],
    relatedEntities: [{ domain: 'project', id: 'demo-project-memovault', name: 'MemoVault', relation: 'documents project' }],
  },
  {
    id: 'demo-anchor-building',
    domain: 'narrative',
    title: 'Building MemoVault',
    subtitle: 'Project arc · 6 connected records',
    status: 'grounded',
    occurredAt: '2026-04-01T12:00:00.000Z',
    score: 91,
    matchedReasons: ['Durable project arc matches'],
    evidence: [{ sourceTable: 'narrative_anchors', sourceId: 'demo-anchor-building', label: 'Synthetic narrative anchor evidence', confidence: 0.91 }],
    relatedEntities: [{ domain: 'project', id: 'demo-project-memovault', name: 'MemoVault', relation: 'anchor project' }],
  },
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function compileDemoUniversalBookQuery(
  query: string,
  domains?: BookQueryDomain[],
): UniversalBookQueryResponse {
  const requested = domains?.length ? new Set(domains) : null;
  const terms = normalize(query).split(/\s+/).filter((term) => term.length > 2);
  let results = DEMO_ROWS.filter((row) => !requested || requested.has(row.domain));
  const matched = results.filter((row) => {
    const searchable = normalize([
      row.title,
      row.subtitle ?? '',
      row.status ?? '',
      row.domain,
      ...row.relatedEntities.map((related) => related.name),
    ].join(' '));
    return terms.some((term) => searchable.includes(term));
  });
  if (terms.length) results = matched;

  const visibleIds = new Set(results.map((row) => row.id));
  const connections = results.flatMap((row) =>
    row.relatedEntities.flatMap((related) => {
      const target = results.find((candidate) =>
        candidate.domain === related.domain &&
        (candidate.id === related.id || normalize(candidate.title) === normalize(related.name)));
      if (!target || !visibleIds.has(target.id)) return [];
      return [{
        fromId: row.id,
        toId: target.id,
        relation: related.relation,
        reason: `${row.title} is connected to ${target.title}`,
      }];
    }),
  );
  const uniqueConnections = [...new Map(connections.map((connection) => [
    [connection.fromId, connection.toId].sort().join(':'),
    connection,
  ])).values()];
  const domainValues = [...new Set(results.map((row) => row.domain))];
  const statusValues = [...new Set(results.map((row) => row.status).filter((value): value is string => Boolean(value)))];

  return {
    query,
    intent: domainValues.length > 1 ? 'cross_book' : 'find',
    results,
    connections: uniqueConnections,
    groups: domainValues.map((domain) => ({
      domain,
      count: results.filter((row) => row.domain === domain).length,
      results: results.filter((row) => row.domain === domain),
    })),
    total: results.length,
    facets: {
      domains: domainValues.map((value) => ({ value, count: results.filter((row) => row.domain === value).length })),
      statuses: statusValues.map((value) => ({ value, count: results.filter((row) => row.status === value).length })),
    },
    warnings: [],
    diagnostics: {
      queriedDomains: domains?.length ? domains : domainValues,
      degradedDomains: [],
      elapsedMs: 4,
    },
  };
}
