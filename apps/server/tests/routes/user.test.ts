import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { userRouter } from '../../src/routes/user';
import { requireAuth } from '../../src/middleware/auth';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(),
    auth: {
      admin: {
        getUserById: vi.fn(),
        updateUserById: vi.fn(),
      },
    },
  },
}));

const app = express();
app.use(express.json());
app.use('/api/user', userRouter);

describe('User API Routes', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    user_metadata: { full_name: 'Test User', bio: 'Bio' },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('GET /api/user/profile', () => {
    it('should return user profile from req.user', async () => {
      const response = await request(app)
        .get('/api/user/profile')
        .expect(200);

      expect(response.body).toHaveProperty('profile');
      expect(response.body.profile).toHaveProperty('id', 'user-123');
      expect(response.body.profile).toHaveProperty('email', 'test@example.com');
      expect(response.body.profile).toHaveProperty('name', 'Test User');
      expect(response.body.profile).toHaveProperty('bio', 'Bio');
    });
  });
});
