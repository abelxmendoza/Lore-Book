import { describe, it, expect, vi, beforeEach } from 'vitest';

const mergeMock = vi.fn();
const getProjectMock = vi.fn();

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: { user?: { id: string } }, _res: unknown, next: () => void) => {
    req.user = { id: 'user-1' };
    next();
  },
}));

vi.mock('../../src/services/projectMergeService', () => ({
  projectMergeService: { merge: (...args: unknown[]) => mergeMock(...args) },
}));

vi.mock('../../src/services/projectService', () => ({
  projectService: { getProject: (...args: unknown[]) => getProjectMock(...args) },
}));

import express from 'express';
import request from 'supertest';
import { projectsRouter } from '../../src/routes/projects';

const SOURCE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TARGET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', projectsRouter);
  return app;
}

describe('POST /api/projects/merge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mergeMock.mockResolvedValue({
      sourceId: SOURCE,
      targetId: TARGET,
      canonicalName: 'Alpha Project',
      reviewFlags: ['Only Alpha details here.'],
      factsMoved: 2,
    });
    getProjectMock.mockResolvedValue({ id: TARGET, name: 'Alpha Project' });
  });

  it('forwards reason and returns report + survivor project', async () => {
    const res = await request(makeApp())
      .post('/api/projects/merge')
      .send({ source_id: SOURCE, target_id: TARGET, reason: 'Merged from Projects Book' })
      .expect(200);

    expect(mergeMock).toHaveBeenCalledWith('user-1', SOURCE, TARGET, {
      reason: 'Merged from Projects Book',
    });
    expect(res.body).toMatchObject({
      merged: true,
      report: { canonicalName: 'Alpha Project', factsMoved: 2 },
      project: { id: TARGET, name: 'Alpha Project' },
    });
  });

  it('rejects invalid payload', async () => {
    await request(makeApp()).post('/api/projects/merge').send({ source_id: 'x', target_id: TARGET }).expect(400);
    expect(mergeMock).not.toHaveBeenCalled();
  });
});
