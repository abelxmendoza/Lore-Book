import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { documentsRouter } from '../../src/routes/documents';
import { requireAuth } from '../../src/middleware/auth';
import { documentService } from '../../src/services/documentService';
import { unifiedFileIngestionService } from '../../src/services/ingestion/unifiedFileIngestionService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/documentService');
vi.mock('../../src/services/ingestion/unifiedFileIngestionService');

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

  it('POST /upload passes binary buffer to unified ingestion (not utf-8 string)', async () => {
    vi.mocked(unifiedFileIngestionService.ingest).mockResolvedValue({
      userFileId: 'uf-1',
      processingStatus: 'completed',
      derivedCounts: { moments: 2, facts: 0, entities: 1, relationships: 0, events: 0 },
      momentsCreated: 2,
      charactersCreated: 1,
      sectionsCreated: 0,
      entryIds: ['e1', 'e2'],
    });

    const pdfBytes = Buffer.from('%PDF-1.4 fake');
    const res = await request(app)
      .post('/api/documents/upload')
      .attach('file', pdfBytes, { filename: 'life.pdf', contentType: 'application/pdf' })
      .expect(200);

    expect(res.body.userFileId).toBe('uf-1');
    expect(unifiedFileIngestionService.ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        buffer: expect.any(Buffer),
        filename: 'life.pdf',
        mimeType: 'application/pdf',
        kind: 'document',
      })
    );
    const call = vi.mocked(unifiedFileIngestionService.ingest).mock.calls[0][0];
    expect(call.buffer.equals(pdfBytes)).toBe(true);
  });

  it('POST /upload returns 400 when no file uploaded', async () => {
    await request(app).post('/api/documents/upload').expect(400);
  });

  it('POST /upload returns 500 when ingestion fails', async () => {
    vi.mocked(unifiedFileIngestionService.ingest).mockResolvedValue({
      userFileId: 'uf-1',
      processingStatus: 'failed',
      error: 'parse error',
    } as any);
    const res = await request(app)
      .post('/api/documents/upload')
      .attach('file', Buffer.from('hello'), { filename: 'note.txt', contentType: 'text/plain' })
      .expect(500);
    expect(res.body.error).toBe('Failed to process document');
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockImplementation((_req, res) => {
      res.status(401).json({ error: 'Unauthorized' });
    });
    await request(app).get('/api/documents/language-style').expect(401);
  });
});
