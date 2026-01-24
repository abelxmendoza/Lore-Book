import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { githubRouter } from '../../src/routes/github';
import { requireAuth } from '../../src/middleware/auth';
import { githubSyncManager } from '../../src/services/github/githubSyncManager';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/github/githubSyncManager');

const app = express();
app.use(express.json());
app.use('/api/github', githubRouter);

describe('GitHub API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('POST /link should return 400 when repoUrl missing', async () => {
    await request(app).post('/api/github/link').send({}).expect(400);
  });

  it('POST /link should return repo on success', async () => {
    vi.mocked(githubSyncManager.linkRepo).mockResolvedValue({ id: 'r1' } as any);
    const res = await request(app).post('/api/github/link').send({ repoUrl: 'https://github.com/a/b' }).expect(200);
    expect(res.body).toHaveProperty('repo');
  });

  it('POST /sync should return 400 when repoUrl missing', async () => {
    await request(app).post('/api/github/sync').send({}).expect(400);
  });

  it('GET /summaries should return summaries', async () => {
    vi.mocked(githubSyncManager.listSummaries).mockResolvedValue([]);
    const res = await request(app).get('/api/github/summaries').expect(200);
    expect(res.body).toHaveProperty('summaries');
  });
});
