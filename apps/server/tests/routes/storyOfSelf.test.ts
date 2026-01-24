import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/storyOfSelf/storyOfSelfEngine', () => ({
  StoryOfSelfEngine: vi.fn().mockImplementation(function (this: unknown) {
    return { process: vi.fn().mockResolvedValue({}) };
  }),
}));
vi.mock('../../src/services/memoryService', () => ({
  memoryService: { searchEntries: vi.fn().mockResolvedValue([]) },
}));

import { requireAuth } from '../../src/middleware/auth';
import storyOfSelfRouter from '../../src/routes/storyOfSelf';

const app = express();
app.use(express.json());
app.use('/api/story-of-self', storyOfSelfRouter);

describe('StoryOfSelf API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('POST /analyze returns result', async () => {
    const res = await request(app).post('/api/story-of-self/analyze').expect(200);
    expect(res.body).toBeDefined();
  });
});
