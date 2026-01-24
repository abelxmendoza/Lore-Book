import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/services/knowledgeTypeEngineService', () => ({
  knowledgeTypeEngineService: {
    getKnowledgeUnitsForUtterance: vi.fn().mockResolvedValue([]),
    getKnowledgeUnitsByType: vi.fn().mockResolvedValue([]),
    classifyKnowledge: vi.fn().mockReturnValue('EXPERIENCE'),
    initialConfidence: vi.fn().mockReturnValue(0.9),
    inferSource: vi.fn().mockReturnValue('DIRECT_EXPERIENCE'),
    inferTemporalScope: vi.fn().mockReturnValue('MOMENT'),
  },
}));

import knowledgeTypeEngineRouter from '../../src/routes/knowledgeTypeEngine';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).user = { id: 'u1' };
  next();
});
app.use('/api/knowledge-type', knowledgeTypeEngineRouter);

describe('KnowledgeTypeEngine API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /units/:utteranceId returns units', async () => {
    const res = await request(app).get('/api/knowledge-type/units/u1').expect(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('units');
  });

  it('GET /units with type returns units', async () => {
    const res = await request(app).get('/api/knowledge-type/units').query({ type: 'EVENT' }).expect(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('POST /classify returns type', async () => {
    const res = await request(app)
      .post('/api/knowledge-type/classify')
      .send({ text: 'I went to the store' })
      .expect(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('classification');
    expect(res.body.classification).toHaveProperty('type');
  });
});
