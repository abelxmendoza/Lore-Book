import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockUser = { id: 'u1', email: 'a@b.com' };
const { queryBooksForUserMock, runQueryEngineMock } = vi.hoisted(() => ({
  queryBooksForUserMock: vi.fn(),
  runQueryEngineMock: vi.fn(),
}));

vi.mock('../../src/cognition/query/QueryEngine', () => ({
  queryEngine: { run: runQueryEngineMock },
}));
vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = mockUser;
    next();
  },
}));
vi.mock('../../src/services/embeddingService', () => ({ embeddingService: { embed: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../src/services/query/bookQueryRegistry', () => ({
  BOOK_QUERY_REGISTRY: [{
    domain: 'skill',
    label: 'Skills',
    description: 'Synthetic skill registry',
    route: '/skills',
    supportsDemo: true,
    supportsEvidence: true,
  }],
  queryBooksForUser: queryBooksForUserMock,
}));
vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

import entitiesRouter from '../../src/routes/entities';

const app = express();
app.use(express.json());
app.use('/api/entities', entitiesRouter);

describe('Entities API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /auto-update returns 400 when required fields missing', async () => {
    await request(app).post('/api/entities/auto-update').send({}).expect(400);
  });

  it('POST /auto-update returns 400 when conversation missing', async () => {
    await request(app)
      .post('/api/entities/auto-update')
      .send({ entity_type: 'character', entity_id: 'e1' })
      .expect(400);
  });

  it('GET /query-registry returns authenticated Book capabilities', async () => {
    const response = await request(app).get('/api/entities/query-registry').expect(200);
    expect(response.body.books).toEqual([
      expect.objectContaining({ domain: 'skill', route: '/skills' }),
    ]);
  });

  it('POST /query validates input and scopes execution to the authenticated user', async () => {
    queryBooksForUserMock.mockResolvedValue({
      query: 'What skills support my quests?',
      intent: 'cross_book',
      results: [],
      connections: [],
      groups: [],
      total: 0,
      facets: { domains: [], statuses: [] },
      warnings: ['No grounded book records matched. LoreBook did not invent an answer.'],
      diagnostics: {
        queriedDomains: ['skill', 'quest'],
        degradedDomains: [],
        elapsedMs: 1,
      },
    });

    const response = await request(app)
      .post('/api/entities/query')
      .send({
        query: 'What skills support my quests?',
        domains: ['skill', 'quest'],
      })
      .expect(200);

    expect(queryBooksForUserMock).toHaveBeenCalledWith(
      mockUser.id,
      expect.objectContaining({
        query: 'What skills support my quests?',
        domains: ['skill', 'quest'],
      }),
    );
    expect(response.body).toMatchObject({
      success: true,
      result: { total: 0 },
    });

    await request(app)
      .post('/api/entities/query')
      .send({ query: '' })
      .expect(400);
  });

  it('POST /query returns evidence-bearing graph paths for connection questions', async () => {
    const base = {
      query: 'Who introduced me to Marcus?',
      intent: 'cross_book',
      results: [],
      connections: [],
      groups: [],
      total: 0,
      facets: { domains: [], statuses: [] },
      warnings: [],
      diagnostics: {
        queriedDomains: ['character'],
        degradedDomains: [],
        elapsedMs: 2,
      },
    };
    runQueryEngineMock.mockResolvedValue({
      results: [
        { source: 'books', raw: base },
        {
          source: 'graph',
          raw: {
            paths: [{
              nodes: [
                { id: 'char-1', type: 'character', name: 'Marcus' },
                { id: 'org-1', type: 'organization', name: 'Vanguard Robotics' },
              ],
              edges: [{
                fromId: 'char-1',
                toId: 'org-1',
                type: 'member',
                evidence: [{
                  sourceTable: 'organization_members',
                  sourceId: 'member-1',
                  label: 'Membership',
                }],
              }],
            }],
            visited: 2,
          },
        },
      ],
    });

    const response = await request(app)
      .post('/api/entities/query')
      .send({ query: 'Who introduced me to Marcus?' })
      .expect(200);

    expect(runQueryEngineMock).toHaveBeenCalledWith({
      userId: mockUser.id,
      message: 'Who introduced me to Marcus?',
    });
    expect(response.body.result.connections).toEqual([
      expect.objectContaining({
        fromId: 'char-1',
        toId: 'org-1',
        reason: 'Marcus —[member]→ Vanguard Robotics',
      }),
    ]);
  });
});
