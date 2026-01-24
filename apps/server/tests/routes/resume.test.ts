import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import resumeRouter from '../../src/routes/resume';
import { requireAuth } from '../../src/middleware/auth';
import { resumeParsingService } from '../../src/services/profileClaims/resumeParsingService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/profileClaims/resumeParsingService');
vi.mock('../../src/services/profileClaims/profileClaimsService');

const app = express();
app.use(express.json());
app.use('/api/resume', resumeRouter);

describe('Resume API Routes', () => {
  const mockUser = { id: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
  });

  it('GET /documents should return documents', async () => {
    vi.mocked(resumeParsingService.getResumeDocuments).mockResolvedValue([]);
    const res = await request(app).get('/api/resume/documents').expect(200);
    expect(res.body).toHaveProperty('documents');
  });

  it('GET /documents/:id should return 404 when not found', async () => {
    vi.mocked(resumeParsingService.getResumeDocument).mockResolvedValue(null);
    await request(app).get('/api/resume/documents/doc1').expect(404);
  });
});
