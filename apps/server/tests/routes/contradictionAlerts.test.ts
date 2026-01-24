import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/services/contradictionAlertService', () => ({
  contradictionAlertService: {
    getActiveAlerts: vi.fn().mockResolvedValue([]),
    getActiveAlert: vi.fn().mockResolvedValue(null),
    handleUserAction: vi.fn().mockResolvedValue(true),
    createAlert: vi.fn().mockResolvedValue(null),
  },
}));

import contradictionAlertsRouter from '../../src/routes/contradictionAlerts';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).user = { id: 'u1' };
  next();
});
app.use('/api/contradiction-alerts', contradictionAlertsRouter);

describe('ContradictionAlerts API Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET / returns alerts', async () => {
    const res = await request(app).get('/api/contradiction-alerts').expect(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('alerts');
  });

  it('GET /:alertId returns 404 when not found', async () => {
    await request(app).get('/api/contradiction-alerts/alert-1').expect(404);
  });

  it('POST /:alertId/action returns success', async () => {
    const res = await request(app)
      .post('/api/contradiction-alerts/alert-1/action')
      .send({ action: 'DISMISS' })
      .expect(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('POST /:alertId/action returns 400 for invalid action', async () => {
    await request(app)
      .post('/api/contradiction-alerts/alert-1/action')
      .send({ action: 'INVALID' })
      .expect(400);
  });

  it('POST /check/:beliefUnitId returns success', async () => {
    const res = await request(app).post('/api/contradiction-alerts/check/belief-1').expect(200);
    expect(res.body).toHaveProperty('success', true);
  });
});
