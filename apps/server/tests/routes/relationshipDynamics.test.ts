import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockUser = { id: 'u1', email: 'a@b.com' };

const m = vi.hoisted(() => ({
  analyzeRelationship: vi.fn(),
  getRelationshipDynamics: vi.fn(),
  getAllRelationships: vi.fn(),
  generateInsights: vi.fn(),
  getStats: vi.fn(),
}));

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = mockUser;
    next();
  },
}));
vi.mock('../../src/services/relationshipDynamics/relationshipEngine', () => ({
  RelationshipDynamicsEngine: vi.fn().mockImplementation(function (this: unknown) { return m; }),
}));

import relationshipDynamicsRouter from '../../src/routes/relationshipDynamics';

const app = express();
app.use(express.json());
app.use('/api/relationship-dynamics', relationshipDynamicsRouter);

describe('Relationship Dynamics API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.analyzeRelationship.mockResolvedValue({ personName: 'Alice' });
    m.getRelationshipDynamics.mockResolvedValue({ personName: 'Alice' });
    m.getStats.mockResolvedValue({ total: 0 });
    m.generateInsights.mockResolvedValue([]);
  });

  it('POST /analyze returns dynamics', async () => {
    const res = await request(app)
      .post('/api/relationship-dynamics/analyze')
      .send({ personName: 'Alice' })
      .expect(200);
    expect(res.body).toHaveProperty('personName');
  });

  it('POST /analyze returns 400 without personName', async () => {
    await request(app).post('/api/relationship-dynamics/analyze').send({}).expect(400);
  });

  it('GET /:personName returns dynamics', async () => {
    const res = await request(app).get('/api/relationship-dynamics/Alice').expect(200);
    expect(res.body).toHaveProperty('personName');
  });

  it('GET /:personName returns 200 + null when none exist (not a 404)', async () => {
    m.getRelationshipDynamics.mockResolvedValue(null);
    const res = await request(app).get('/api/relationship-dynamics/Nobody').expect(200);
    expect(res.body).toBeNull();
  });

  it('GET /stats is not shadowed by /:personName', async () => {
    const res = await request(app).get('/api/relationship-dynamics/stats').expect(200);
    expect(res.body).toHaveProperty('total');
    expect(m.getStats).toHaveBeenCalled();
    expect(m.getRelationshipDynamics).not.toHaveBeenCalled();
  });
});
