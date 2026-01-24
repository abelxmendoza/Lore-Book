import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { personaRouter } from '../../src/routes/persona';
import { requireAuth } from '../../src/middleware/auth';
import { personaService } from '../../src/services/personaService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/personaService', () => ({
  personaService: {
    getPersona: vi.fn(),
    history: vi.fn(),
    updatePersona: vi.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use('/api/persona', personaRouter);

describe('Persona API Routes', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };
  const mockPersona = { version: '1', motifs: [], toneProfile: {}, description: '', emotionalVector: {} };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
    vi.mocked(personaService.getPersona).mockReturnValue(mockPersona as any);
    vi.mocked(personaService.history).mockReturnValue([] as any);
  });

  describe('GET /api/persona', () => {
    it('should return persona and history', async () => {
      const response = await request(app).get('/api/persona').expect(200);
      expect(response.body).toHaveProperty('persona');
      expect(response.body).toHaveProperty('history');
      expect(personaService.getPersona).toHaveBeenCalledWith('user-123');
      expect(personaService.history).toHaveBeenCalledWith('user-123');
    });
  });

  describe('GET /api/persona/description', () => {
    it('should return persona description', async () => {
      const response = await request(app).get('/api/persona/description').expect(200);
      expect(response.body).toHaveProperty('description');
    });
  });
});
