import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { unifiedFileIngestionService } from '../services/ingestion/unifiedFileIngestionService';
import { userFileRegistry } from '../services/ingestion/userFileRegistry';
import { resumeParsingService } from '../services/profileClaims/resumeParsingService';
import { documentService } from '../services/documentService';
import { resolveFileProvenance } from '../services/ingestion/fileProvenanceService';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    // Accept text files, markdown, and common document formats
    const allowedTypes = [
      'text/plain',
      'text/markdown',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(txt|md|pdf|doc|docx)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only .txt, .md, .pdf, .doc, .docx files are allowed.'));
    }
  }
});

router.post('/upload', requireAuth, upload.single('file'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.user!.id;
    const result = await unifiedFileIngestionService.ingest({
      userId,
      buffer: req.file.buffer,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      kind: 'document',
    });

    if (result.processingStatus === 'failed') {
      return res.status(500).json({
        error: 'Failed to process document',
        message: result.error ?? 'Unknown error',
        userFileId: result.userFileId,
      });
    }

    res.json({
      success: true,
      userFileId: result.userFileId,
      message: `Document processed successfully. Created ${result.momentsCreated ?? 0} entries, ${result.charactersCreated ?? 0} characters, and ${result.sectionsCreated ?? 0} memoir sections.`,
      entriesCreated: result.momentsCreated ?? 0,
      charactersCreated: result.charactersCreated ?? 0,
      sectionsCreated: result.sectionsCreated ?? 0,
      derivedCounts: result.derivedCounts,
      entryIds: result.entryIds,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to upload document');
    res.status(500).json({
      error: 'Failed to process document',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.get('/language-style', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const style = await documentService.getLanguageStyle(req.user!.id);
    res.json({ languageStyle: style });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get language style');
    // Return null instead of error - this is optional data
    res.json({ languageStyle: null });
  }
});

/** GET /api/documents/files — user's uploaded document library */
router.get(
  '/files',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const [files, resumes] = await Promise.all([
      userFileRegistry.listForUser(userId),
      resumeParsingService.getResumeDocuments(userId),
    ]);

    const resumeBySource = new Map<string, (typeof resumes)[0]>();
    for (const r of resumes) {
      const sid = (r.parsed_data as { source_file_id?: string })?.source_file_id;
      if (sid) resumeBySource.set(sid, r);
    }

    const library = await Promise.all(
      files.map(async (f) => {
        const resume = resumeBySource.get(f.id);
        return {
          id: f.id,
          filename: f.filename,
          mimeType: f.mime_type,
          kind: f.ingest_kind,
          uploadedAt: f.uploaded_at,
          processingStatus: f.processing_status,
          storageUrl: await userFileRegistry.createSignedDownloadUrl(f),
          derivedCounts: f.derived_counts,
          errorMessage: f.error_message,
          resumeDocumentId: resume?.id ?? null,
          claimsGenerated: resume?.claims_generated ?? null,
          parsedSummary: resume?.parsed_data
            ? {
                jobs: (resume.parsed_data as { structured?: { employment?: unknown[] } }).structured?.employment?.length ?? 0,
                skills: (resume.parsed_data as { structured?: { skills?: unknown[] } }).structured?.skills?.length ?? 0,
                schools: (resume.parsed_data as { structured?: { education?: unknown[] } }).structured?.education?.length ?? 0,
              }
            : null,
        };
      })
    );

    res.json({ success: true, files: library });
  })
);

/** GET /api/documents/files/:fileId/provenance */
router.get(
  '/files/:fileId/provenance',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const provenance = await resolveFileProvenance(req.user!.id, req.params.fileId);
    res.json({ success: true, ...provenance });
  })
);

/** GET /api/documents/files/:fileId — single file + resume parse detail */
router.get(
  '/files/:fileId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const file = await userFileRegistry.getForUser(userId, req.params.fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const resumes = await resumeParsingService.getResumeDocuments(userId);
    const resume = resumes.find(
      (r) => (r.parsed_data as { source_file_id?: string })?.source_file_id === file.id
    );
    const signedDownloadUrl = await userFileRegistry.createSignedDownloadUrl(file);

    res.json({
      success: true,
      file: {
        ...file,
        storage_url: signedDownloadUrl,
      },
      resume: resume
        ? {
            id: resume.id,
            fileName: resume.file_name,
            processingStatus: resume.processing_status,
            claimsGenerated: resume.claims_generated,
            fileUrl: signedDownloadUrl,
            parsedData: resume.parsed_data,
            rawTextPreview: resume.raw_text?.slice(0, 2000) ?? null,
            uploadedAt: resume.uploaded_at,
            processedAt: resume.processed_at,
          }
        : null,
    });
  })
);

// ChatGPT conversation import
router.post('/import-chatgpt', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { conversation } = req.body;
    
    if (!conversation || typeof conversation !== 'string') {
      return res.status(400).json({ error: 'Conversation text is required' });
    }

    const { chatGPTImportService } = await import('../services/chatGPTImportService');
    const result = await chatGPTImportService.processConversation(req.user!.id, conversation);

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Failed to import ChatGPT conversation');
    res.status(500).json({
      error: 'Failed to process conversation',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Import selected facts
router.post('/import-facts', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { facts } = req.body;
    
    if (!facts || !Array.isArray(facts)) {
      return res.status(400).json({ error: 'Facts array is required' });
    }

    const { chatGPTImportService } = await import('../services/chatGPTImportService');
    const result = await chatGPTImportService.importFacts(req.user!.id, facts);

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Failed to import facts');
    res.status(500).json({
      error: 'Failed to import facts',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export const documentsRouter = router;

