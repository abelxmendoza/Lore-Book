import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import entitiesRouter from '../../src/routes/entities';

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    (req as { user: { id: string } }).user = { id: 'user-search-1' };
    next();
  },
}));

vi.mock('../../src/services/search/entitySearchService', () => ({
  searchEntities: vi.fn(),
}));

vi.mock('../../src/services/entities/bookEntityQueryService', () => ({
  queryBookEntities: vi.fn(),
}));

import { queryBookEntities } from '../../src/services/entities/bookEntityQueryService';
import { searchEntities } from '../../src/services/search/entitySearchService';

const app = express();
app.use(express.json());
app.use('/api/entities', entitiesRouter);

describe('GET /api/entities/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(searchEntities).mockResolvedValue({
      query: 'oscar',
      results: [
        {
          entityId: 'oscar-id',
          entityType: 'person',
          displayName: 'Oscar Trujillo',
          aliases: ['Oscar'],
          knownStatus: 'known',
          confidence: 0.96,
          source: 'characters',
        },
      ],
    });
  });

  it('returns search results for authenticated user', async () => {
    const res = await request(app)
      .get('/api/entities/search')
      .query({ q: 'oscar', types: 'person,group', limit: 10 })
      .expect(200);

    expect(res.body.results).toHaveLength(1);
    expect(searchEntities).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-search-1',
        query: 'oscar',
        types: ['person', 'group'],
        limit: 10,
      })
    );
  });
});

describe('GET /api/entities/book-index', () => {
  it('returns the shared paginated Books index', async () => {
    vi.mocked(queryBookEntities).mockResolvedValue({
      entities: [{
        id: 'project-1',
        name: 'MemoVault',
        type: 'project',
        status: 'active',
        aliases: ['LoreBook'],
        updatedAt: '2026-07-20T00:00:00Z',
      }],
      counts: { project: 1 },
      total: 1,
      limit: 20,
      offset: 0,
    });

    const res = await request(app)
      .get('/api/entities/book-index')
      .query({ q: 'memo', types: 'project,quest', limit: 20, offset: 0 })
      .expect(200);

    expect(res.body.entities).toHaveLength(1);
    expect(queryBookEntities).toHaveBeenCalledWith('user-search-1', {
      types: ['project', 'quest'],
      search: 'memo',
      limit: 20,
      offset: 0,
    });
  });
});
