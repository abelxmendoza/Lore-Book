import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { notebookRouter } from '../../src/routes/notebook';
import { requireAuth } from '../../src/middleware/auth';
import { chapterService } from '../../src/services/chapterService';
import { memoryService } from '../../src/services/memoryService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/chapterService');
vi.mock('../../src/services/memoryService');

const app = express();
app.use(express.json());
app.use('/api/notebook', notebookRouter);

describe('Notebook API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('GET /arcs/suggestions should return arcs', async () => {
    vi.mocked(chapterService.listChapters).mockResolvedValue([]);
    const res = await request(app).get('/api/notebook/arcs/suggestions').expect(200);
    expect(res.body).toHaveProperty('arcs');
  });

  it('POST /moods/score should return mood', async () => {
    const res = await request(app).post('/api/notebook/moods/score').send({}).expect(200);
    expect(res.body).toHaveProperty('mood');
  });

  it('POST /memory-preview should return previews', async () => {
    vi.mocked(memoryService.searchEntries).mockResolvedValue([]);
    const res = await request(app).post('/api/notebook/memory-preview').send({}).expect(200);
    expect(res.body).toHaveProperty('previews');
  });
});
