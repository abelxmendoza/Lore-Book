import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockUser = { id: 'u1', email: 'a@b.com' };

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = mockUser;
    next();
  },
}));
vi.mock('../../src/services/relationshipDynamics/relationshipEngine', () => ({
  RelationshipDynamicsEngine: vi.fn().mockImplementation(function (this: unknown) {
    return {
      analyzeRelationship: vi.fn().mockResolvedValue({ personName: 'Alice' }),
      getRelationshipDynamics: vi.fn().mockResolvedValue({ personName: 'Alice' }),
    };
  }),
}));

import relationshipDynamicsRouter from '../../src/routes/relationshipDynamics';

const app = express();
app.use(express.json());
app.use('/api/relationship-dynamics', relationshipDynamicsRouter);

describe('Relationship Dynamics API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

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
});
