import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { summaryRouter } from '../../src/routes/summary';
import { requireAuth } from '../../src/middleware/auth';
import { memoryService } from '../../src/services/memoryService';
import { chatService } from '../../src/services/chatService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/memoryService');
vi.mock('../../src/services/chatService');

const app = express();
app.use(express.json());
app.use('/api/summary', summaryRouter);

describe('Summary API Routes', () => {
  const mockUser = { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  describe('POST /api/summary', () => {
    it('should return summary and entry count', async () => {
      vi.mocked(memoryService.searchEntriesWithCorrections).mockResolvedValue([{ id: '1', content: 'x' }] as any);
      vi.mocked(chatService.summarizeEntries).mockResolvedValue('Summary text' as any);

      const response = await request(app)
        .post('/api/summary')
        .send({ from: '2024-01-01', to: '2024-01-31' })
        .expect(200);
      expect(response.body).toHaveProperty('summary', 'Summary text');
      expect(response.body.entryCount).toBe(1);
    });

    it('should return 400 for invalid body', async () => {
      await request(app).post('/api/summary').send({}).expect(400);
    });
  });

  describe('POST /api/summary/reflect', () => {
    it('should return reflection', async () => {
      vi.mocked(memoryService.searchEntriesWithCorrections).mockResolvedValue([]);
      vi.mocked(chatService.reflectOnEntries).mockResolvedValue('Reflection' as any);

      const response = await request(app)
        .post('/api/summary/reflect')
        .send({ mode: 'month', month: '2024-01' })
        .expect(200);
      expect(response.body).toHaveProperty('reflection');
    });

    it('should return 400 for invalid mode', async () => {
      await request(app).post('/api/summary/reflect').send({ mode: 'invalid' }).expect(400);
    });
  });
});
