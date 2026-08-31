import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasOverride: vi.fn(),
  from: vi.fn(),
}));

vi.mock('../logger', () => ({ logger: { warn: vi.fn() } }));
vi.mock('./books/booksAggregateService', () => ({
  isVisibleCharacter: (row: { status?: string | null }) => row.status !== 'archived',
  dedupeCharacters: (rows: Array<{ name?: string | null }>) => [
    ...new Map(rows.map((row) => [row.name?.toLowerCase(), row])).values(),
  ],
}));
vi.mock('./conversationCentered/romanticRelationshipEnrichment', () => ({
  enrichRomanticRelationshipsForUser: vi.fn(async (_userId, rows) => rows),
}));
vi.mock('./conversationCentered/romanticRelationshipDedupeService', () => ({
  romanticRelationshipDedupeService: { dedupeAndLink: vi.fn(async () => undefined) },
}));
vi.mock('./conversationCentered/datingEligibilityService', () => ({
  loadDatingEligibilityForRows: vi.fn(async () => new Map([
    ['romance-visible', { visibleInDatingBook: true }],
    ['romance-hidden', { visibleInDatingBook: false }],
  ])),
}));
vi.mock('./events/lifeLogEligibilityPolicy', () => ({
  evaluateLifeLogEligibility: vi.fn(() => ({ eligible: true })),
  isPublishableLifeLogTitle: vi.fn(() => true),
}));
vi.mock('./familyTreeService', () => ({
  familyTreeService: { getUserFamilyTree: vi.fn(async () => ({ members: [{}, {}, {}] })) },
}));
vi.mock('./locationService', () => ({
  locationService: { listLocations: vi.fn(async () => [{}, {}, {}, {}]) },
}));
vi.mock('./metaControlService', () => ({
  metaControlService: { hasOverride: (...args: unknown[]) => mocks.hasOverride(...args) },
}));
vi.mock('./narrative/narrativeAnchorService', () => ({
  narrativeAnchorService: { listAnchors: vi.fn(async () => Array.from({ length: 9 }, () => ({}))) },
}));
vi.mock('./organizationService', () => ({
  organizationService: { listOrganizations: vi.fn(async () => Array.from({ length: 5 }, () => ({}))) },
}));
vi.mock('./projectService', () => ({
  projectService: { listProjects: vi.fn(async () => Array.from({ length: 7 }, () => ({}))) },
}));
vi.mock('./skills/skillService', () => ({
  skillService: { getSkills: vi.fn(async () => Array.from({ length: 8 }, () => ({}))) },
}));
vi.mock('./supabaseClient', () => ({
  supabaseAdmin: { from: (table: string) => mocks.from(table) },
}));

function queryResult(result: { data: unknown[]; error: unknown }) {
  const query: Record<string, unknown> & PromiseLike<unknown> = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

describe('loadNavigationCounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasOverride.mockImplementation(async (_userId, eventId, _type, action) =>
      eventId === 'event-hidden' && action === 'ARCHIVE'
    );
    mocks.from.mockImplementation((table: string) => {
      if (table === 'characters') {
        return queryResult({
          data: [
            { name: 'Marcus', status: 'active' },
            { name: 'marcus', status: 'active' },
            { name: 'Jamie', status: 'active' },
            { name: 'Archived', status: 'archived' },
          ],
          error: null,
        });
      }
      if (table === 'resolved_events') {
        return queryResult({
          data: [
            { id: 'event-visible', title: 'Launch day', metadata: {} },
            { id: 'event-hidden', title: 'Archived day', metadata: {} },
            { id: 'event-quarantined', title: 'Quarantined', metadata: { life_log: { publication_status: 'quarantined' } } },
          ],
          error: null,
        });
      }
      if (table === 'romantic_relationships') {
        return queryResult({
          data: [{ id: 'romance-visible' }, { id: 'romance-hidden' }],
          error: null,
        });
      }
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it('returns the visible count for every Focus on book', async () => {
    const { loadNavigationCounts } = await import('./navigationCountService');

    await expect(loadNavigationCounts('user-1')).resolves.toEqual({
      characters: 2,
      family: 3,
      romantic: 1,
      organizations: 5,
      locations: 4,
      events: 1,
      projects: 7,
      skills: 8,
      anchors: 9,
    });
  });
});
