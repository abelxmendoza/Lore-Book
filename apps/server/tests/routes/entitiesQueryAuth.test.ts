import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/embeddingService', () => ({
  embeddingService: { embed: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../src/services/query/bookQueryRegistry', () => ({
  BOOK_QUERY_REGISTRY: [],
  queryBooksForUser: vi.fn(),
}));
vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import entitiesRouter from '../../src/routes/entities';

const app = express();
app.use(express.json());
app.use('/api/entities', entitiesRouter);

describe('Book query route authentication', () => {
  it('rejects a query when no authenticated session is supplied', async () => {
    const response = await request(app)
      .post('/api/entities/query')
      .send({ query: 'Show skills and quests' })
      .expect(401);

    expect(response.body).toEqual({ error: 'Missing Authorization header' });
  });
});
