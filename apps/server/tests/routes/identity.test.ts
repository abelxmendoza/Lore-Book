import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { identityRouter } from '../../src/routes/identity';
import { requireAuth } from '../../src/middleware/auth';
import { personaService } from '../../src/services/personaService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/personaService');
vi.mock('../../src/realtime/orchestratorEmitter', () => ({ emitDelta: vi.fn() }));

const app = express();
app.use(express.json());
app.use('/api/identity', identityRouter);

describe('Identity API Routes', () => {
  const mockUser = { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('GET /api/identity/pulse', () => {
    it('should return pulse', async () => {
      vi.mocked(personaService.getPersona).mockReturnValue({ version: '1', motifs: ['a', 'b'] } as any);

      const response = await request(app).get('/api/identity/pulse').expect(200);
      expect(response.body).toHaveProperty('pulse');
      expect(response.body.pulse).toHaveProperty('persona', '1');
    });
  });

  describe('POST /api/identity/recompute', () => {
    it('should return snapshot', async () => {
      const snapshot = { version: '2', motifs: [] };
      vi.mocked(personaService.updatePersona).mockReturnValue(snapshot as any);

      const response = await request(app).post('/api/identity/recompute').send({}).expect(200);
      expect(response.body).toHaveProperty('snapshot');
    });
  });
});
