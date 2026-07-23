import { createHash } from 'crypto';

import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { createMemoryUpload } from '../middleware/multerConfig';
import { parseChatGPTExport } from '../services/chatgptImport/chatGPTExportParser';
import { chatGPTExportReminderService } from '../services/chatgptImport/chatGPTExportReminderService';
import {
  chatGPTLoreMigrationService,
  type ChatGPTLoreMigrationStats,
} from '../services/chatgptImport/chatGPTLoreMigrationService';
import { documentService } from '../services/documentService';
import { resolveFileProvenance } from '../services/ingestion/fileProvenanceService';
import { unifiedFileIngestionService } from '../services/ingestion/unifiedFileIngestionService';
import { userFileRegistry } from '../services/ingestion/userFileRegistry';
import { resumeParsingService } from '../services/profileClaims/resumeParsingService';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

const upload = createMemoryUpload({
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
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

const chatGPTExportUpload = createMemoryUpload({
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (
      ['application/json', 'application/zip', 'application/x-zip-compressed'].includes(file.mimetype) ||
      /\.(json|zip)$/i.test(file.originalname)
    ) {
      cb(null, true);
    } else {
      cb(new Error('Choose the ChatGPT export ZIP or a conversations JSON file.'));
    }
  },
});

const chatGPTProcessSchema = z.object({
  conversationIds: z.array(z.string().min(1)).max(20_000).optional(),
  dateFrom: z.string().datetime().or(z.string().date()).optional(),
  dateTo: z.string().datetime().or(z.string().date()).optional(),
  titleQuery: z.string().trim().max(120).optional(),
  includeSensitive: z.boolean().default(false),
  batchSize: z.number().int().min(1).max(25).default(10),
});

function importConfigHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

router.post(
  '/chatgpt-export/analyze',
  requireAuth,
  chatGPTExportUpload.single('file'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.file) return res.status(400).json({ error: 'No ChatGPT export selected.' });
    const userId = req.user!.id;
    const parsed = await parseChatGPTExport(req.file.buffer, req.file.originalname);
    if (parsed.inventory.conversationCount === 0) {
      return res.status(400).json({ error: 'No conversations were found in this export.' });
    }

    const source = await userFileRegistry.registerOrReuse(userId, req.file.buffer, {
      filename: req.file.originalname,
      mimeType: req.file.mimetype || 'application/octet-stream',
      ingestKind: 'chat_import',
      storeBinary: true,
    });
    await userFileRegistry.updateMetadata(source.id, {
      chatgpt_export: true,
      chatgpt_inventory: {
        conversationCount: parsed.inventory.conversationCount,
        messageCount: parsed.inventory.messageCount,
        userMessageCount: parsed.inventory.userMessageCount,
        assistantMessageCount: parsed.inventory.assistantMessageCount,
        earliestAt: parsed.inventory.earliestAt,
        latestAt: parsed.inventory.latestAt,
        sourceFiles: parsed.inventory.sourceFiles,
      },
      source_deleted: false,
      analyzed_at: new Date().toISOString(),
    });
    await userFileRegistry.setStatus(source.id, 'pending');
    chatGPTExportReminderService.markUploaded(userId, source.id).catch((error) => {
      logger.warn({ error, userId, sourceFileId: source.id }, 'Failed to retire ChatGPT export reminder after upload');
    });

    return res.json({
      success: true,
      sourceFileId: source.id,
      reused: source.sha256 === createHash('sha256').update(req.file.buffer).digest('hex') &&
        Boolean((source.metadata as Record<string, unknown> | undefined)?.chatgpt_export),
      inventory: parsed.inventory,
    });
  }),
);

router.post(
  '/chatgpt-export/:fileId/process',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = chatGPTProcessSchema.parse(req.body ?? {});
    const userId = req.user!.id;
    const source = await userFileRegistry.getForUser(userId, String(req.params.fileId));
    if (!source || source.ingest_kind !== 'chat_import') {
      return res.status(404).json({ error: 'ChatGPT import source not found.' });
    }

    const parsed = await parseChatGPTExport(
      await userFileRegistry.downloadBuffer(source),
      source.filename,
    );
    const selectedIds = input.conversationIds?.length ? new Set(input.conversationIds) : null;
    const from = input.dateFrom ? new Date(input.dateFrom).getTime() : null;
    const to = input.dateTo ? new Date(input.dateTo).getTime() : null;
    const titleQuery = input.titleQuery?.toLowerCase();
    const selected = parsed.conversations.filter((conversation) => {
      if (selectedIds && !selectedIds.has(conversation.id)) return false;
      const timestamp = new Date(conversation.createdAt ?? conversation.updatedAt ?? 0).getTime();
      if (from != null && timestamp < from) return false;
      if (to != null && timestamp > to + 86_400_000 - 1) return false;
      if (titleQuery && !conversation.title.toLowerCase().includes(titleQuery)) return false;
      return true;
    });

    const config = {
      conversationIds: input.conversationIds?.slice().sort() ?? null,
      dateFrom: input.dateFrom ?? null,
      dateTo: input.dateTo ?? null,
      titleQuery: input.titleQuery ?? null,
      includeSensitive: input.includeSensitive,
    };
    const configHash = importConfigHash(config);
    const metadata = (source.metadata ?? {}) as Record<string, unknown>;
    const priorJob = (metadata.chatgpt_import_job ?? {}) as Record<string, unknown>;
    const sameJob = priorJob.config_hash === configHash;
    const cursor = sameJob ? Math.max(0, Number(priorJob.cursor ?? 0)) : 0;
    const priorStats = sameJob
      ? (priorJob.stats as ChatGPTLoreMigrationStats | undefined)
      : undefined;
    const batch = selected.slice(cursor, cursor + input.batchSize);

    await userFileRegistry.setStatus(source.id, 'processing');
    const batchStats = await chatGPTLoreMigrationService.processConversations({
      userId,
      sourceFileId: source.id,
      conversations: batch,
      includeSensitive: input.includeSensitive,
    });
    const stats = chatGPTLoreMigrationService.mergeStats(priorStats, batchStats);
    const nextCursor = Math.min(selected.length, cursor + batch.length);
    const completed = nextCursor >= selected.length;
    const progress = selected.length === 0 ? 100 : Math.round((nextCursor / selected.length) * 100);

    await userFileRegistry.updateMetadata(source.id, {
      chatgpt_import_job: {
        config_hash: configHash,
        config,
        cursor: nextCursor,
        total: selected.length,
        progress,
        completed,
        stats,
        updated_at: new Date().toISOString(),
      },
    });
    await userFileRegistry.updateDerivedCounts(source.id, {
      facts: stats.proposalsCreated + stats.proposalsDeduplicated,
    });
    await userFileRegistry.setStatus(source.id, completed ? 'completed' : 'processing');
    if (completed) {
      chatGPTExportReminderService.markImported(userId, source.id).catch((error) => {
        logger.warn({ error, userId, sourceFileId: source.id }, 'Failed to mark ChatGPT lore import complete');
      });
    }

    return res.json({
      success: true,
      sourceFileId: source.id,
      completed,
      cursor: nextCursor,
      total: selected.length,
      progress,
      stats,
      profilePreview: {
        categoryCounts: stats.categoryCounts,
        examples: stats.examples,
      },
    });
  }),
);

router.get(
  '/chatgpt-export/:fileId/summary',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const source = await userFileRegistry.getForUser(req.user!.id, String(req.params.fileId));
    if (!source || source.ingest_kind !== 'chat_import') {
      return res.status(404).json({ error: 'ChatGPT import source not found.' });
    }
    return res.json({
      success: true,
      sourceFileId: source.id,
      filename: source.filename,
      processingStatus: source.processing_status,
      sourceDeleted: Boolean(source.metadata?.source_deleted),
      inventory: source.metadata?.chatgpt_inventory ?? null,
      job: source.metadata?.chatgpt_import_job ?? null,
    });
  }),
);

router.delete(
  '/chatgpt-export/:fileId/source',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const source = await userFileRegistry.getForUser(req.user!.id, String(req.params.fileId));
    if (!source || source.ingest_kind !== 'chat_import') {
      return res.status(404).json({ error: 'ChatGPT import source not found.' });
    }
    await userFileRegistry.deleteStoredBinary(source);
    return res.json({
      success: true,
      sourceFileId: source.id,
      sourceDeleted: true,
      message: 'The private ChatGPT source archive was deleted. Review proposals keep only their evidence excerpts and provenance IDs.',
    });
  }),
);

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
    const provenance = await resolveFileProvenance(req.user!.id, String(req.params.fileId));
    res.json({ success: true, ...provenance });
  })
);

/** GET /api/documents/files/:fileId — single file + resume parse detail */
router.get(
  '/files/:fileId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const file = await userFileRegistry.getForUser(userId, String(req.params.fileId));
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

// Legacy paste importer retired: it treated assistant prose as evidence and
// bypassed the canonical review-first export workflow.
router.post(['/import-chatgpt', '/import-facts'], requireAuth, (_req, res) => {
  res.status(410).json({
    error: 'Legacy ChatGPT import retired',
    message: 'Use Account → Data & Export → Import My ChatGPT Lore.',
    replacement: '/api/documents/chatgpt-export/analyze',
  });
});

export const documentsRouter = router;
