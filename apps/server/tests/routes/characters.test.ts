import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { peoplePlacesService } from '../../src/services/peoplePlacesService';
import { requireAuth } from '../../src/middleware/auth';
import { charactersRouter } from '../../src/routes/characters';

// Mock dependencies
vi.mock('../../src/services/peoplePlacesService');
vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/supabaseClient');
vi.mock('../../src/utils/avatar');
vi.mock('../../src/utils/cacheAvatar');

const app = express();
app.use(express.json());
app.use('/api/characters', charactersRouter);

describe('Characters API Routes', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };
  const mockCharacter = {
    id: 'char-1',
    name: 'Test Character',
    user_id: 'user-123',
    created_at: new Date().toISOString()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('GET /api/characters', () => {
    it('should return characters list', async () => {
      vi.mocked(peoplePlacesService.listCharacters).mockResolvedValue([mockCharacter]);

      const response = await request(app)
        .get('/api/characters')
        .expect(200);

      expect(response.body).toHaveProperty('characters');
      expect(Array.isArray(response.body.characters)).toBe(true);
    });
  });

  describe('POST /api/characters', () => {
    it('should create a new character', async () => {
      vi.mocked(peoplePlacesService.createCharacter).mockResolvedValue(mockCharacter);

      const response = await request(app)
        .post('/api/characters')
        .send({
          name: 'Test Character',
          firstName: 'Test',
          lastName: 'Character'
        })
        .expect(201);

      expect(response.body).toHaveProperty('character');
      expect(response.body.character.name).toBe('Test Character');
    });

    it('should validate character schema', async () => {
      const response = await request(app)
        .post('/api/characters')
        .send({
          name: '' // Empty name should fail
        })
        .expect(400);

      expect(response.body).toHaveProperty('fieldErrors');
    });
  });
});

