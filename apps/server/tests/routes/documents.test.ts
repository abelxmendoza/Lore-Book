import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { documentsRouter } from '../../src/routes/documents';
import { requireAuth } from '../../src/middleware/auth';
import { documentService } from '../../src/services/documentService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/documentService');

const app = express();
app.use(express.json());
app.use('/api/documents', documentsRouter);

describe('Documents API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('GET /language-style should return languageStyle', async () => {
    vi.mocked(documentService.getLanguageStyle).mockResolvedValue({ formality: 0.5 } as any);
    const res = await request(app).get('/api/documents/language-style').expect(200);
    expect(res.body).toHaveProperty('languageStyle');
  });
});
