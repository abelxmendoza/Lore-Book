import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { user: { id: string } }).user = { id: 'user-1' };
    next();
  },
}));

vi.mock('../../src/services/books/booksAggregateService', () => ({
  loadCharactersBook: vi.fn().mockResolvedValue({
    characters: [{ id: 'c1', name: 'Ada' }],
    duplicate_groups: [],
    counts: { characters: 1, locations: 0, events: 0, organizations: 0, skills: 0, projects: 0 },
  }),
}));

import { booksRouter } from '../../src/routes/books';
import { loadCharactersBook } from '../../src/services/books/booksAggregateService';

describe('books BFF routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/books', booksRouter);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/books/characters returns aggregate envelope', async () => {
    const res = await request(app).get('/api/books/characters');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.characters).toHaveLength(1);
    expect(res.body.characters).toHaveLength(1);
    expect(loadCharactersBook).toHaveBeenCalledWith('user-1');
  });
});
