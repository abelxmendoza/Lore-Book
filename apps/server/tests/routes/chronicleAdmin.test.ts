import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../src/middleware/auth', () => ({
  requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock('../../src/middleware/rbac', () => ({
  requireAdmin: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock('../../src/services/chronicle/projectChronicleService', () => ({
  getProjectChronicle: vi.fn(async () => ({
    product: { name: 'LoreBook' },
    milestones: [],
    pendingDetections: [],
  })),
  refreshChronicleSources: vi.fn(async () => ({ newDetections: 0, autoPromoted: 1 })),
  acceptDetection: vi.fn(async () => ({ id: 'ms-new', title: 'New' })),
  rejectDetection: vi.fn(async () => true),
}));

import { chronicleAdminRouter } from '../../src/routes/chronicleAdmin';
import {
  getProjectChronicle,
  refreshChronicleSources,
  acceptDetection,
  rejectDetection,
} from '../../src/services/chronicle/projectChronicleService';

describe('chronicleAdmin routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/chronicle', chronicleAdminRouter);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET / returns chronicle snapshot', async () => {
    const res = await request(app).get('/api/admin/chronicle').expect(200);
    expect(res.body.product.name).toBe('LoreBook');
    expect(getProjectChronicle).toHaveBeenCalled();
  });

  it('POST /refresh scans sources and returns chronicle', async () => {
    const res = await request(app).post('/api/admin/chronicle/refresh').expect(200);
    expect(res.body.newDetections).toBe(0);
    expect(res.body.autoPromoted).toBe(1);
    expect(refreshChronicleSources).toHaveBeenCalled();
    expect(getProjectChronicle).toHaveBeenCalled();
  });

  it('POST /detections/:id/accept promotes detection', async () => {
    await request(app).post('/api/admin/chronicle/detections/det-1/accept').expect(200);
    expect(acceptDetection).toHaveBeenCalledWith('det-1');
  });

  it('POST /detections/:id/reject dismisses detection', async () => {
    await request(app).post('/api/admin/chronicle/detections/det-1/reject').expect(200);
    expect(rejectDetection).toHaveBeenCalledWith('det-1');
  });
});
