import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { documentsRouter } from '../../src/routes/documents';
import { requireAuth } from '../../src/middleware/auth';
import { documentService } from '../../src/services/documentService';
import { unifiedFileIngestionService } from '../../src/services/ingestion/unifiedFileIngestionService';
import { documentFactQueryService } from '../../src/services/query/documentFactQueryService';
import { userFileRegistry } from '../../src/services/ingestion/userFileRegistry';
import { resumeParsingService } from '../../src/services/profileClaims/resumeParsingService';

vi.mock('../../src/middleware/auth');
vi.mock('../../src/services/documentService');
vi.mock('../../src/services/ingestion/unifiedFileIngestionService');
vi.mock('../../src/services/query/documentFactQueryService', () => ({
  documentFactQueryService: { query: vi.fn() },
}));
vi.mock('../../src/services/ingestion/userFileRegistry', () => ({
  userFileRegistry: {
    registerOrReuse: vi.fn(),
    updateMetadata: vi.fn(),
    setStatus: vi.fn(),
    listPageForUser: vi.fn(),
    listAllForUser: vi.fn(),
    getForUser: vi.fn(),
    createSignedDownloadUrl: vi.fn(),
    setDocumentCategoryForUser: vi.fn(),
    setAutoDocumentCategoryForUser: vi.fn(),
  },
}));
vi.mock('../../src/services/photoAnalysisService', () => ({
  photoAnalysisService: {
    analyzePhoto: vi.fn().mockResolvedValue({
      photoType: 'document',
      confidence: 0.9,
      extractedText: '',
    }),
  },
}));
vi.mock('../../src/services/profileClaims/resumeParsingService', () => ({
  resumeParsingService: {
    getResumeDocumentsForSourceFiles: vi.fn(),
  },
}));

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
    vi.mocked(userFileRegistry.listPageForUser).mockResolvedValue({
      files: [],
      page: 1,
      pageSize: 25,
      total: 0,
      hasMore: false,
    });
    vi.mocked(resumeParsingService.getResumeDocumentsForSourceFiles).mockResolvedValue([]);
    vi.mocked(userFileRegistry.listAllForUser).mockResolvedValue([]);
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
      .field('category', 'journals')
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
        documentCategory: 'journals',
      })
    );
    const call = vi.mocked(unifiedFileIngestionService.ingest).mock.calls[0][0];
    expect(call.buffer.equals(pdfBytes)).toBe(true);
  });

  it('POST /upload returns 400 when no file uploaded', async () => {
    await request(app).post('/api/documents/upload').expect(400);
  });

  it('POST /upload stores a photo privately in the selected Documents folder without text ingestion', async () => {
    const photoBytes = Buffer.from('synthetic-jpeg-bytes');
    vi.mocked(userFileRegistry.registerOrReuse).mockResolvedValue({
      id: 'photo-file-1',
      user_id: 'u1',
      filename: 'Vanguard-Robotics-archive.jpg',
      mime_type: 'image/jpeg',
      sha256: 'hash',
      storage_url: 'u1/photo-file-1-Vanguard-Robotics-archive.jpg',
      uploaded_at: '2026-08-29T00:00:00.000Z',
      processing_status: 'pending',
      ingest_kind: 'photo',
      derived_counts: { moments: 0, facts: 0, entities: 0, relationships: 0, events: 0 },
      metadata: { document_category: 'family_history' },
      error_message: null,
    });

    const res = await request(app)
      .post('/api/documents/upload')
      .field('category', 'family_history')
      .attach('file', photoBytes, {
        filename: 'Vanguard-Robotics-archive.jpg',
        contentType: 'image/jpeg',
      })
      .expect(200);

    expect(res.body).toMatchObject({
      success: true,
      userFileId: 'photo-file-1',
      kind: 'photo',
    });
    expect(userFileRegistry.registerOrReuse).toHaveBeenCalledWith(
      'u1',
      expect.any(Buffer),
      {
        filename: 'Vanguard-Robotics-archive.jpg',
        mimeType: 'image/jpeg',
        ingestKind: 'photo',
        storeBinary: true,
        documentCategory: 'family_history',
      },
    );
    const storedPhotoBuffer = vi.mocked(userFileRegistry.registerOrReuse).mock.calls[0][1];
    expect(storedPhotoBuffer.equals(photoBytes)).toBe(true);
    expect(userFileRegistry.updateMetadata).toHaveBeenCalledWith('photo-file-1', {
      document_library_upload: true,
      media_kind: 'image',
    });
    expect(userFileRegistry.setStatus).toHaveBeenCalledWith('photo-file-1', 'completed');
    expect(unifiedFileIngestionService.ingest).not.toHaveBeenCalled();
  });

  it('POST /upload does not claim a photo was saved when private storage failed', async () => {
    vi.mocked(userFileRegistry.registerOrReuse).mockResolvedValue({
      id: 'photo-file-failed',
      user_id: 'u1',
      filename: 'Jamie-archive.png',
      mime_type: 'image/png',
      sha256: 'hash',
      storage_url: null,
      uploaded_at: '2026-08-29T00:00:00.000Z',
      processing_status: 'pending',
      ingest_kind: 'photo',
      derived_counts: { moments: 0, facts: 0, entities: 0, relationships: 0, events: 0 },
      metadata: { document_category: 'photos_images' },
      error_message: null,
    });

    const res = await request(app)
      .post('/api/documents/upload')
      .attach('file', Buffer.from('synthetic-png-bytes'), {
        filename: 'Jamie-archive.png',
        contentType: 'image/png',
      })
      .expect(503);

    expect(res.body.message).toBe('The photo was not saved. Please try again.');
    expect(userFileRegistry.setStatus).toHaveBeenCalledWith(
      'photo-file-failed',
      'failed',
      'The private photo file could not be stored.',
    );
    expect(userFileRegistry.updateMetadata).not.toHaveBeenCalled();
  });

  it('POST /upload rejects legacy DOC files with an actionable error', async () => {
    const res = await request(app)
      .post('/api/documents/upload')
      .attach('file', Buffer.from('legacy'), { filename: 'old.doc', contentType: 'application/msword' })
      .expect(400);
    expect(res.body.message).toContain('Choose a PDF, DOCX, text file, or photo');
  });

  it('POST /query returns deterministic document facts for the authenticated user', async () => {
    vi.mocked(documentFactQueryService.query).mockResolvedValue({
      query: 'what jobs have I had?',
      intent: 'employment',
      facts: [],
      total: 0,
      warnings: [],
      diagnostics: { resumeDocumentsScanned: 1, genericDocumentsScanned: 0, claimsScanned: 0, elapsedMs: 2 },
    });
    const res = await request(app)
      .post('/api/documents/query')
      .send({ query: 'what jobs have I had?' })
      .expect(200);
    expect(res.body.result.intent).toBe('employment');
    expect(documentFactQueryService.query).toHaveBeenCalledWith('u1', expect.objectContaining({ query: 'what jobs have I had?' }));
  });

  it('GET /files paginates and does not mint signed URLs for list rows', async () => {
    vi.mocked(userFileRegistry.listPageForUser).mockResolvedValue({
      files: [{
        id: 'file-1',
        filename: 'career-profile.pdf',
        mime_type: 'application/pdf',
        sha256: 'hash',
        storage_url: 'u1/file-1-career-profile.pdf',
        uploaded_at: '2026-08-20T00:00:00.000Z',
        processing_status: 'completed',
        ingest_kind: 'resume',
        derived_counts: { moments: 0, facts: 0, entities: 0, relationships: 0, events: 0 },
        metadata: { document_category: 'resumes' },
        error_message: null,
      }],
      page: 2,
      pageSize: 1,
      total: 2,
      hasMore: false,
    });

    const res = await request(app)
      .get('/api/documents/files?page=2&pageSize=1&status=completed')
      .expect(200);

    expect(res.body.pagination).toEqual({ page: 2, pageSize: 1, total: 2, hasMore: false });
    expect(res.body.files[0].storageUrl).toBeNull();
    expect(res.body.files[0].category).toBe('resumes');
    expect(userFileRegistry.listPageForUser).toHaveBeenCalledWith('u1', {
      page: 2,
      pageSize: 1,
      status: 'completed',
    });
    expect(userFileRegistry.createSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('GET /files filters a persisted document folder', async () => {
    await request(app)
      .get('/api/documents/files?category=biographies')
      .expect(200);

    expect(userFileRegistry.listPageForUser).toHaveBeenCalledWith('u1', {
      page: 1,
      pageSize: 25,
      category: 'biographies',
    });
  });

  it('POST /files/auto-sort repairs linked legacy resumes but preserves manual folders', async () => {
    vi.mocked(userFileRegistry.listAllForUser).mockResolvedValue([
      {
        id: 'resume-file',
        user_id: 'u1',
        filename: 'career-profile.pdf',
        mime_type: 'application/pdf',
        sha256: 'resume-hash',
        storage_url: 'u1/resume-file-career-profile.pdf',
        uploaded_at: '2026-08-20T00:00:00.000Z',
        processing_status: 'completed',
        ingest_kind: 'document',
        derived_counts: { moments: 0, facts: 0, entities: 0, relationships: 0, events: 0 },
        metadata: {},
        error_message: null,
      },
      {
        id: 'manual-file',
        user_id: 'u1',
        filename: 'resume-notes.pdf',
        mime_type: 'application/pdf',
        sha256: 'manual-hash',
        storage_url: 'u1/manual-file-resume-notes.pdf',
        uploaded_at: '2026-08-21T00:00:00.000Z',
        processing_status: 'completed',
        ingest_kind: 'document',
        derived_counts: { moments: 0, facts: 0, entities: 0, relationships: 0, events: 0 },
        metadata: { document_category: 'other', document_category_source: 'manual' },
        error_message: null,
      },
    ]);
    vi.mocked(resumeParsingService.getResumeDocumentsForSourceFiles).mockResolvedValue([
      { parsed_data: { source_file_id: 'resume-file' } } as any,
    ]);

    const res = await request(app).post('/api/documents/files/auto-sort').expect(200);

    expect(res.body).toMatchObject({ success: true, scanned: 2, moved: 1 });
    expect(userFileRegistry.setAutoDocumentCategoryForUser).toHaveBeenCalledWith(
      'u1',
      'resume-file',
      'resumes',
      expect.objectContaining({ reason: 'linked resume record' }),
    );
    expect(userFileRegistry.setAutoDocumentCategoryForUser).toHaveBeenCalledTimes(1);
  });

  it('GET /files/categories returns user-scoped folder counts', async () => {
    vi.mocked(userFileRegistry.listAllForUser).mockResolvedValue([
      {
        id: 'file-1',
        user_id: 'u1',
        filename: 'Marcus-biography.pdf',
        mime_type: 'application/pdf',
        sha256: 'hash',
        storage_url: null,
        uploaded_at: '2026-08-20T00:00:00.000Z',
        processing_status: 'completed',
        ingest_kind: 'document',
        derived_counts: { moments: 0, facts: 0, entities: 0, relationships: 0, events: 0 },
        metadata: { document_category: 'biographies' },
        error_message: null,
      },
    ]);

    const res = await request(app).get('/api/documents/files/categories').expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.counts.biographies).toBe(1);
    expect(res.body.counts.personal_identity).toBe(0);
  });

  it('PATCH /files/:fileId/category moves only the authenticated user file', async () => {
    vi.mocked(userFileRegistry.setDocumentCategoryForUser).mockResolvedValue({
      id: 'file-1',
      user_id: 'u1',
      filename: 'family-history.pdf',
      mime_type: 'application/pdf',
      sha256: 'hash',
      storage_url: null,
      uploaded_at: '2026-08-20T00:00:00.000Z',
      processing_status: 'completed',
      ingest_kind: 'document',
      derived_counts: { moments: 0, facts: 0, entities: 0, relationships: 0, events: 0 },
      metadata: { document_category: 'family_history' },
      error_message: null,
    });

    const res = await request(app)
      .patch('/api/documents/files/file-1/category')
      .send({ category: 'family_history' })
      .expect(200);

    expect(res.body.file.category).toBe('family_history');
    expect(userFileRegistry.setDocumentCategoryForUser).toHaveBeenCalledWith(
      'u1',
      'file-1',
      'family_history',
    );
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
