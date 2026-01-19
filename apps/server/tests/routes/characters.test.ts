import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { peoplePlacesService } from '../../src/services/peoplePlacesService';
import { requireAuth } from '../../src/middleware/auth';
import { charactersRouter } from '../../src/routes/characters';

// Mock dependencies
import { peoplePlacesService } from '../../src/services/peoplePlacesService';
import { supabaseAdmin } from '../../src/services/supabaseClient';

vi.mock('../../src/services/peoplePlacesService', () => ({
  peoplePlacesService: {
    listCharacters: vi.fn(),
    createCharacter: vi.fn(),
  },
}));

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

vi.mock('../../src/middleware/auth');
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
      // Mock supabase to return characters
      const mockFrom = vi.mocked(supabaseAdmin.from);
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockResolvedValue({
        data: [mockCharacter],
        error: null,
      });

      mockFrom.mockReturnValue({
        select: mockSelect.mockReturnValue({
          eq: mockEq.mockReturnValue({
            order: mockOrder,
          }),
        }),
      } as any);

      const response = await request(app)
        .get('/api/characters/list')
        .expect(200);

      expect(response.body).toHaveProperty('characters');
      expect(Array.isArray(response.body.characters)).toBe(true);
    });
  });

  describe('POST /api/characters', () => {
    it('should create a new character', async () => {
      // Mock supabase insert
      const mockFrom = vi.mocked(supabaseAdmin.from);
      const mockInsert = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: mockCharacter,
        error: null,
      });

      mockFrom.mockReturnValue({
        insert: mockInsert.mockReturnValue({
          select: mockSelect.mockReturnValue({
            single: mockSingle,
          }),
        }),
      } as any);

      // Mock avatar and cache functions
      const { characterAvatarUrl, avatarStyleFor } = await import('../../src/utils/avatar');
      const { cacheAvatar } = await import('../../src/utils/cacheAvatar');
      vi.mocked(characterAvatarUrl).mockReturnValue('https://avatar.url');
      vi.mocked(avatarStyleFor).mockReturnValue('adventurer');
      vi.mocked(cacheAvatar).mockResolvedValue('https://cached.avatar.url');

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

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('details');
    });
  });
});

