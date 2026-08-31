import { createHash } from 'crypto';

import { Router, type NextFunction, type Request, type Response } from 'express';
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
import {
  categoryForMetadata,
  DOCUMENT_CATEGORIES,
  type DocumentCategory,
} from '../services/documents/documentCategories';
import {
  classifyDocument,
  hasManualDocumentCategory,
} from '../services/documents/documentClassification';
import { subtypeForMetadata } from '../services/documents/documentSubtypes';
import { documentService } from '../services/documentService';
import { resolveFileProvenance } from '../services/ingestion/fileProvenanceService';
import { unifiedFileIngestionService } from '../services/ingestion/unifiedFileIngestionService';
import { userFileRegistry } from '../services/ingestion/userFileRegistry';
import { buildResumeChatFeedback } from '../services/profileClaims/resumeFeedbackService';
import { resumeParsingService } from '../services/profileClaims/resumeParsingService';
import type { ParsedResume } from '../services/profileClaims/resumeStructuredTypes';
import { documentFactQueryService } from '../services/query/documentFactQueryService';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

const IMAGE_EXTENSION_RE = /\.(jpe?g|png|webp|gif|heic|heif)$/i;

function isImageUpload(file: Pick<Express.Multer.File, 'mimetype' | 'originalname'>): boolean {
  return file.mimetype.startsWith('image/') || IMAGE_EXTENSION_RE.test(file.originalname);
}

function imageMimeType(file: Pick<Express.Multer.File, 'mimetype' | 'originalname'>): string {
  if (file.mimetype.startsWith('image/')) return file.mimetype;
  const extension = file.originalname.split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'heic') return 'image/heic';
  if (extension === 'heif') return 'image/heif';
  return 'image/jpeg';
}

const upload = createMemoryUpload({
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    // Accept text documents plus safe raster image formats. Images uploaded
    // here are stored as private library files; they are not auto-analyzed as
    // Photos-book memories.
    const allowedTypes = [
      'text/plain',
      'text/markdown',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/heic',
      'image/heif',
    ];
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(txt|md|pdf|docx|jpe?g|png|webp|gif|heic|heif)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Choose a PDF, DOCX, text file, or photo.'));
    }
  }
});

const uploadDocument = (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (error: unknown) => {
    if (error) {
      return res.status(400).json({
        error: 'Unsupported document upload',
        message: error instanceof Error ? error.message : 'Choose a PDF, DOCX, text file, or photo.',
      });
    }
    next();
  });
};

const chatGPTExportUpload = createMemoryUpload({
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (
      [
        'application/json',
        'application/zip',
        'application/x-zip-compressed',
        'text/plain',
        'text/markdown',
      ].includes(file.mimetype) ||
      /\.(json|zip|txt|md)$/i.test(file.originalname)
    ) {
      cb(null, true);
    } else {
      cb(new Error('Choose a ChatGPT export ZIP, conversations JSON, or LoreBook memory handoff.'));
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

const documentLibraryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  kind: z.enum(['document', 'resume', 'photo', 'voice', 'chat_import']).optional(),
  category: z.enum(DOCUMENT_CATEGORIES).optional(),
});

const documentCategorySchema = z.object({
  category: z.enum(DOCUMENT_CATEGORIES),
});

const documentUploadCategorySchema = z.union([z.literal('auto'), z.enum(DOCUMENT_CATEGORIES)]);

const documentFactQuerySchema = z.object({
  query: z.string().trim().min(1).max(500),
  documentId: z.string().uuid().optional(),
  includePending: z.boolean().optional().default(false),
  includeEvidence: z.boolean().optional().default(true),
  limit: z.number().int().min(1).max(100).optional().default(50),
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
        candidateClaimCount: parsed.inventory.candidateClaimCount,
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

router.post('/upload', requireAuth, uploadDocument, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.user!.id;
    const caption = typeof req.body?.caption === 'string' ? req.body.caption.trim() : '';
    const isImage = isImageUpload(req.file);
    const parsedCategory = documentUploadCategorySchema.safeParse(req.body?.category ?? 'auto');
    if (!parsedCategory.success) {
      return res.status(400).json({
        error: 'Invalid document category',
        details: parsedCategory.error.flatten(),
      });
    }

    const selectedCategory: DocumentCategory | null =
      parsedCategory.data === 'auto' ? null : parsedCategory.data;
    const automatic = selectedCategory === null;

    if (isImage) {
      let classification = classifyDocument({
        filename: req.file.originalname,
        mimeType: imageMimeType(req.file),
        ingestKind: 'photo',
      });
      let documentSubtype: string | undefined;
      if (automatic) {
        try {
          const { photoAnalysisService } = await import('../services/photoAnalysisService');
          const analysis = await photoAnalysisService.analyzePhoto(
            userId,
            req.file.buffer,
            req.file.originalname,
            {},
          );
          documentSubtype = analysis.documentSubtype;
          classification = classifyDocument({
            filename: req.file.originalname,
            mimeType: imageMimeType(req.file),
            ingestKind: 'photo',
            extractedText: analysis.extractedText,
            metadata: documentSubtype ? { document_subtype: documentSubtype } : undefined,
          });
        } catch (error) {
          logger.warn({ error, userId }, 'Image document auto-classification fell back to filename');
        }
      }
      const category = automatic ? classification.category : selectedCategory;
      const source = await userFileRegistry.registerOrReuse(userId, req.file.buffer, {
        filename: req.file.originalname,
        mimeType: imageMimeType(req.file),
        ingestKind: 'photo',
        storeBinary: true,
        documentCategory: category,
      });
      if (!source.storage_url) {
        await userFileRegistry.setStatus(
          source.id,
          'failed',
          'The private photo file could not be stored.',
        );
        return res.status(503).json({
          error: 'Photo storage unavailable',
          message: 'The photo was not saved. Please try again.',
          userFileId: source.id,
        });
      }
      await userFileRegistry.updateMetadata(source.id, {
        document_library_upload: true,
        media_kind: 'image',
        ...(documentSubtype ? { document_subtype: documentSubtype } : {}),
      });
      if (automatic) {
        await userFileRegistry.setAutoDocumentCategoryForUser(userId, source.id, category, classification);
      } else {
        await userFileRegistry.setDocumentCategoryForUser(userId, source.id, category);
      }
      await userFileRegistry.setStatus(source.id, 'completed');

      return res.json({
        success: true,
        userFileId: source.id,
        kind: 'photo',
        message: `Photo saved to ${category === 'photos_images' ? 'Photos & images' : 'the selected folder'}.`,
        derivedCounts: source.derived_counts,
      });
    }

    const result = await unifiedFileIngestionService.ingest({
      userId,
      buffer: req.file.buffer,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      kind: 'document',
      caption: caption || undefined,
      documentCategory: automatic
        ? classifyDocument({
            filename: req.file.originalname,
            mimeType: req.file.mimetype,
            ingestKind: 'document',
          }).category
        : selectedCategory,
    });

    if (result.processingStatus === 'failed') {
      return res.status(500).json({
        error: 'Failed to process document',
        message: result.error ?? 'Unknown error',
        userFileId: result.userFileId,
      });
    }

    // `result.structured` is only present when unifiedFileIngestionService
    // auto-detected resume-shaped content and routed through the resume
    // pipeline, regardless of the filename or that this hit the generic
    // Documents upload endpoint. Surface the same career timeline data the
    // dedicated /api/resume/upload endpoint returns, so the UI doesn't need
    // to know or care which upload surface the user picked.
    const structured = result.structured as ParsedResume | undefined;
    if (automatic) {
      const classification = classifyDocument({
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        ingestKind: structured ? 'resume' : 'document',
        linkedResume: Boolean(structured),
      });
      await userFileRegistry.setAutoDocumentCategoryForUser(
        userId,
        result.userFileId,
        classification.category,
        classification,
      );
    } else {
      await userFileRegistry.setDocumentCategoryForUser(userId, result.userFileId, selectedCategory);
    }
    const feedback = structured
      ? buildResumeChatFeedback({
          parsed: structured,
          fileName: req.file.originalname || 'document',
          userFileId: result.userFileId,
          counts: {
            claims: result.claimsCreated ?? 0,
            journalEntries: result.momentsCreated ?? 0,
            timelineEvents: result.eventsCreated ?? 0,
            skills: result.skillsCreated ?? 0,
            organizations: result.organizationsCreated ?? 0,
            characterAttributes: result.derivedCounts?.characterAttributes ?? 0,
          },
        })
      : null;

    res.json({
      success: true,
      userFileId: result.userFileId,
      detectedAsResume: Boolean(structured),
      message: [
        feedback?.chatFeedback
          ? `Recognized as a resume — saved to your library and career timeline.`
          : `Document processed successfully. Created ${result.momentsCreated ?? 0} entries, ${result.charactersCreated ?? 0} characters, and ${result.sectionsCreated ?? 0} memoir sections.`,
        (result.itemsReconciled ?? 0) > 0
          ? `${result.itemsReconciled} job/education entr${result.itemsReconciled === 1 ? 'y' : 'ies'} already in your timeline from another resume — reinforced, not duplicated.`
          : null,
      ]
        .filter(Boolean)
        .join(' '),
      entriesCreated: result.momentsCreated ?? 0,
      charactersCreated: result.charactersCreated ?? 0,
      sectionsCreated: result.sectionsCreated ?? 0,
      derivedCounts: result.derivedCounts,
      entryIds: result.entryIds,
      claimsCreated: result.claimsCreated ?? 0,
      skillsCreated: result.skillsCreated ?? 0,
      organizationsCreated: result.organizationsCreated ?? 0,
      eventsCreated: result.eventsCreated ?? 0,
      itemsReconciled: result.itemsReconciled ?? 0,
      roleConflicts: result.roleConflicts ?? [],
      chatFeedback: feedback?.chatFeedback ?? null,
      careerTimeline: feedback?.careerTimeline ?? [],
      educationTimeline: feedback?.educationTimeline ?? [],
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
    const parsedQuery = documentLibraryQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({
        error: 'Invalid document library query',
        details: parsedQuery.error.flatten(),
      });
    }
    const userId = req.user!.id;
    const filePage = await userFileRegistry.listPageForUser(userId, parsedQuery.data);
    const files = filePage.files;
    const resumes = await resumeParsingService.getResumeDocumentsForSourceFiles(
      userId,
      files.map((file) => file.id),
    );

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
          category: categoryForMetadata(f.metadata),
          documentSubtype: subtypeForMetadata(f.metadata),
          uploadedAt: f.uploaded_at,
          processingStatus: f.processing_status,
          // Signed URLs are minted only for the detail view. A library list
          // should remain cheap and should not expose expiring URLs for every
          // row on every refresh.
          storageUrl: null,
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

    res.json({
      success: true,
      files: library,
      pagination: {
        page: filePage.page,
        pageSize: filePage.pageSize,
        total: filePage.total,
        hasMore: filePage.hasMore,
      },
    });
  })
);

/** POST /api/documents/files/auto-sort — classify unfiled legacy uploads without overriding user choices */
router.post(
  '/files/auto-sort',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const files = await userFileRegistry.listAllForUser(userId);
    const resumes = await resumeParsingService.getResumeDocumentsForSourceFiles(
      userId,
      files.map((file) => file.id),
    );
    const resumeFileIds = new Set(
      resumes
        .map((resume) => (resume.parsed_data as { source_file_id?: string })?.source_file_id)
        .filter((id): id is string => Boolean(id)),
    );

    let moved = 0;
    for (const file of files) {
      if (hasManualDocumentCategory(file.metadata)) continue;
      const currentCategory = categoryForMetadata(file.metadata);
      const linkedResume = resumeFileIds.has(file.id) || file.ingest_kind === 'resume';
      // Preserve established folders from before source tracking was added.
      // Resume linkage is authoritative and repairs the legacy issue reported
      // by users whose parsed resumes only appeared under All Documents.
      if (currentCategory !== 'unfiled' && !linkedResume) continue;
      const classification = classifyDocument({
        filename: file.filename,
        mimeType: file.mime_type,
        ingestKind: file.ingest_kind,
        metadata: file.metadata,
        linkedResume,
      });
      if (classification.confidence <= 0 || classification.category === currentCategory) continue;
      await userFileRegistry.setAutoDocumentCategoryForUser(
        userId,
        file.id,
        classification.category,
        classification,
      );
      moved += 1;
    }

    res.json({ success: true, scanned: files.length, moved });
  }),
);

/** GET /api/documents/files/categories — folder counts for the authenticated library */
router.get(
  '/files/categories',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const files = await userFileRegistry.listAllForUser(req.user!.id);
    const counts = Object.fromEntries(DOCUMENT_CATEGORIES.map((category) => [category, 0]));
    for (const file of files) {
      const category = categoryForMetadata(file.metadata);
      counts[category] += 1;
    }
    res.json({ success: true, total: files.length, counts });
  }),
);

/** PATCH /api/documents/files/:fileId/category — move a file between library folders */
router.patch(
  '/files/:fileId/category',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = documentCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid document category',
        details: parsed.error.flatten(),
      });
    }
    const file = await userFileRegistry.setDocumentCategoryForUser(
      req.user!.id,
      String(req.params.fileId),
      parsed.data.category,
    );
    if (!file) return res.status(404).json({ error: 'File not found' });
    res.json({
      success: true,
      file: {
        id: file.id,
        category: categoryForMetadata(file.metadata),
      },
    });
  }),
);

/** POST /api/documents/query — deterministic, user-scoped document facts */
router.post(
  '/query',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = documentFactQuerySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid document fact query',
        details: parsed.error.flatten(),
      });
    }
    const result = await documentFactQueryService.query(req.user!.id, parsed.data);
    res.json({ success: true, result });
  }),
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
        mimeType: file.mime_type,
        kind: file.ingest_kind,
        category: categoryForMetadata(file.metadata),
        documentSubtype: subtypeForMetadata(file.metadata),
        processingStatus: file.processing_status,
        storageUrl: signedDownloadUrl,
        uploadedAt: file.uploaded_at,
        derivedCounts: file.derived_counts,
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
