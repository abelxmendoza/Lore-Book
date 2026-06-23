import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const TEST_USER = { id: 'user-1', email: 'u@test.com' };

const m = vi.hoisted(() => ({
  deleteLocation: vi.fn(),
  resolveLoc: vi.fn(),
  deleteProject: vi.fn(),
  resolveProj: vi.fn(),
  deleteGoal: vi.fn(),
  deleteEvent: vi.fn(),
}));

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: () => void) => {
    (req as express.Request & { user?: typeof TEST_USER }).user = TEST_USER;
    next();
  },
}));

vi.mock('../../src/services/locationService', () => ({
  locationService: { deleteLocation: (...a: unknown[]) => m.deleteLocation(...a) },
}));
vi.mock('../../src/services/locationMergeService', () => ({
  locationMergeService: { resolveCanonicalLocationId: (...a: unknown[]) => m.resolveLoc(...a) },
}));
vi.mock('../../src/services/projectService', () => ({
  projectService: { deleteProject: (...a: unknown[]) => m.deleteProject(...a) },
}));
vi.mock('../../src/services/projectMergeService', () => ({
  projectMergeService: { resolveCanonicalProjectId: (...a: unknown[]) => m.resolveProj(...a) },
}));
vi.mock('../../src/services/goalValueAlignmentService', () => ({
  goalValueAlignmentService: { deleteGoal: (...a: unknown[]) => m.deleteGoal(...a) },
}));
vi.mock('../../src/services/events/storageService', () => ({
  EventStorage: class {
    deleteEvent = (...a: unknown[]) => m.deleteEvent(...a);
    loadAll = vi.fn().mockResolvedValue([]);
    updateEvent = vi.fn();
  },
}));
vi.mock('../../src/services/events/eventResolver', () => ({
  EventResolver: class {
    process = vi.fn();
  },
}));

import { locationsRouter } from '../../src/routes/locations';
import { projectsRouter } from '../../src/routes/projects';
import { goalsRouter } from '../../src/routes/goals';
import eventsRouter from '../../src/routes/events';

function app(mount: string, router: express.Router) {
  const a = express();
  a.use(express.json());
  a.use(mount, router);
  return a;
}

describe('entity DELETE routes (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.resolveLoc.mockResolvedValue(null);
    m.resolveProj.mockResolvedValue(null);
  });

  describe('DELETE /api/locations/:id', () => {
    it('200 + calls deleteLocation when it exists', async () => {
      m.deleteLocation.mockResolvedValue(true);
      const res = await request(app('/api/locations', locationsRouter)).delete('/api/locations/loc-1').expect(200);
      expect(res.body.success).toBe(true);
      expect(m.deleteLocation).toHaveBeenCalledWith('user-1', 'loc-1');
    });
    it('404 when the location does not exist', async () => {
      m.deleteLocation.mockResolvedValue(false);
      await request(app('/api/locations', locationsRouter)).delete('/api/locations/missing').expect(404);
    });
  });

  describe('DELETE /api/projects/:id', () => {
    it('200 + calls deleteProject when it exists', async () => {
      m.deleteProject.mockResolvedValue(true);
      const res = await request(app('/api/projects', projectsRouter)).delete('/api/projects/p-1').expect(200);
      expect(res.body.success).toBe(true);
      expect(m.deleteProject).toHaveBeenCalledWith('user-1', 'p-1');
    });
    it('404 when the project does not exist', async () => {
      m.deleteProject.mockResolvedValue(false);
      await request(app('/api/projects', projectsRouter)).delete('/api/projects/missing').expect(404);
    });
  });

  describe('DELETE /api/goals/goals/:id', () => {
    it('200 + calls deleteGoal when it exists', async () => {
      m.deleteGoal.mockResolvedValue(true);
      const res = await request(app('/api/goals', goalsRouter)).delete('/api/goals/goals/g-1').expect(200);
      expect(res.body.success).toBe(true);
      expect(m.deleteGoal).toHaveBeenCalledWith('user-1', 'g-1');
    });
    it('404 when the goal does not exist', async () => {
      m.deleteGoal.mockResolvedValue(false);
      await request(app('/api/goals', goalsRouter)).delete('/api/goals/goals/missing').expect(404);
    });
  });

  describe('DELETE /api/events/:id', () => {
    it('200 + calls deleteEvent when it exists', async () => {
      m.deleteEvent.mockResolvedValue(true);
      const res = await request(app('/api/events', eventsRouter)).delete('/api/events/e-1').expect(200);
      expect(res.body.success).toBe(true);
      expect(m.deleteEvent).toHaveBeenCalledWith('user-1', 'e-1');
    });
    it('404 when the event does not exist', async () => {
      m.deleteEvent.mockResolvedValue(false);
      await request(app('/api/events', eventsRouter)).delete('/api/events/missing').expect(404);
    });
  });
});
