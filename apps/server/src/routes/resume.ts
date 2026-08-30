import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { createMemoryUpload } from '../middleware/multerConfig';
import { DOCUMENT_CATEGORIES } from '../services/documents/documentCategories';
import { classifyDocument } from '../services/documents/documentClassification';
import { unifiedFileIngestionService } from '../services/ingestion/unifiedFileIngestionService';
import { userFileRegistry } from '../services/ingestion/userFileRegistry';
import { buildResumeChatFeedback } from '../services/profileClaims/resumeFeedbackService';
import { resumeParsingService } from '../services/profileClaims/resumeParsingService';
import type { ParsedResume } from '../services/profileClaims/resumeStructuredTypes';

const router = Router();

const upload = createMemoryUpload({
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for resumes
  },
  fileFilter: (_req, file, cb) => {
    // Accept resume file types
    const allowedMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ];

    if (allowedMimes.includes(file.mimetype) || /\.(pdf|docx|txt)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOCX, or TXT files are allowed'));
    }
  },
});

const uploadResume = (req: Request, res: Response, next: NextFunction) => {
  upload.single('resume')(req, res, (error: unknown) => {
    if (error) {
      return res.status(400).json({
        error: 'Unsupported resume upload',
        message: error instanceof Error ? error.message : 'Only PDF, DOCX, or TXT files are allowed.',
      });
    }
    next();
  });
};

/**
 * Upload and process resume
 */
router.post('/upload', requireAuth, uploadResume, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No resume file provided' });
    }

    const userId = req.user!.id;
    const file = req.file;
    const caption = typeof req.body?.caption === 'string' ? req.body.caption.trim() : '';
    const parsedCategory = z.union([z.literal('auto'), z.enum(DOCUMENT_CATEGORIES)])
      .safeParse(req.body?.category ?? 'auto');
    if (!parsedCategory.success) {
      return res.status(400).json({ error: 'Invalid document category' });
    }

    const result = await unifiedFileIngestionService.ingest({
      userId,
      buffer: file.buffer,
      filename: file.originalname || `resume-${Date.now()}.pdf`,
      mimeType: file.mimetype,
      kind: 'resume',
      caption: caption || undefined,
      documentCategory: parsedCategory.data === 'auto' ? 'resumes' : parsedCategory.data,
    });

    if (result.processingStatus === 'processing') {
      res.setHeader('Retry-After', '30');
      return res.status(202).json({
        success: true,
        processing: true,
        userFileId: result.userFileId,
        message:
          'This resume is already being processed. It is safe to check again with the same file; LoreBook will not create a second import.',
      });
    }

    if (result.processingStatus === 'failed') {
      return res.status(500).json({ error: result.error ?? 'Failed to process resume' });
    }

    if (parsedCategory.data === 'auto') {
      const classification = classifyDocument({
        filename: file.originalname,
        mimeType: file.mimetype,
        ingestKind: 'resume',
        linkedResume: true,
      });
      await userFileRegistry.setAutoDocumentCategoryForUser(
        userId,
        result.userFileId,
        classification.category,
        classification,
      );
    } else {
      await userFileRegistry.setDocumentCategoryForUser(
        userId,
        result.userFileId,
        parsedCategory.data,
      );
    }

    const documents = await resumeParsingService.getResumeDocuments(userId);
    const document =
      documents.find((d) => (d.parsed_data as { source_file_id?: string })?.source_file_id === result.userFileId) ??
      documents[0];

    logger.info(
      {
        userId,
        userFileId: result.userFileId,
        claimsCreated: result.claimsCreated,
      },
      'Resume processed via unified ingestion'
    );

    const structured = result.structured as ParsedResume | undefined;
    const feedback = structured
      ? buildResumeChatFeedback({
          parsed: structured,
          fileName: file.originalname || 'resume.pdf',
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

    res.status(201).json({
      success: true,
      userFileId: result.userFileId,
      document: document
        ? {
            id: document.id,
            file_name: document.file_name,
            processing_status: document.processing_status,
            claims_generated: document.claims_generated,
            parsed_data: document.parsed_data,
            file_url: document.file_url,
          }
        : null,
      claimsCreated: result.claimsCreated ?? 0,
      derivedCounts: result.derivedCounts,
      skillsCreated: result.skillsCreated ?? 0,
      organizationsCreated: result.organizationsCreated ?? 0,
      eventsCreated: result.eventsCreated ?? 0,
      momentsCreated: result.momentsCreated ?? 0,
      projectsSuggested: result.projectsSuggested ?? 0,
      itemsReconciled: result.itemsReconciled ?? 0,
      roleConflicts: result.roleConflicts ?? [],
      chatFeedback: feedback?.chatFeedback ?? null,
      careerTimeline: feedback?.careerTimeline ?? [],
      educationTimeline: feedback?.educationTimeline ?? [],
      projectTimeline: feedback?.projectTimeline ?? [],
      certificationTimeline: feedback?.certificationTimeline ?? [],
      savedToLibrary: true,
      alreadyImported: result.alreadyImported ?? false,
      duplicateOfUserFileId: result.duplicateOfUserFileId,
      duplicateSimilarity: result.duplicateSimilarity,
      fileName: file.originalname,
      message: [
        result.alreadyImported
          ? `This resume was already in your library. LoreBook reused the existing memory and timeline data without creating duplicates.`
          : feedback?.chatFeedback
            ? `Resume saved to your library and memory.`
            : `Resume processed. ${result.claimsCreated ?? 0} claims, ${result.momentsCreated ?? 0} timeline entries, ${result.skillsCreated ?? 0} skills added to your lore.`,
        (result.itemsReconciled ?? 0) > 0
          ? `${result.itemsReconciled} job/education entr${result.itemsReconciled === 1 ? 'y' : 'ies'} already in your timeline from another resume — reinforced, not duplicated.`
          : null,
        (result.roleConflicts?.length ?? 0) > 0
          ? `${result.roleConflicts!.length} current-role conflict(s) need review — your existing current role was kept.`
          : null,
      ]
        .filter(Boolean)
        .join(' '),
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to process resume');
    res.status(500).json({
      error: error.message || 'Failed to process resume',
    });
  }
});

/**
 * Get all resume documents for user
 */
router.get('/documents', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const documents = await resumeParsingService.getResumeDocuments(userId);

    res.json({ documents });
  } catch (error) {
    logger.error({ error }, 'Failed to get resume documents');
    res.status(500).json({ error: 'Failed to get resume documents' });
  }
});

/**
 * Get a single resume document
 */
router.get('/documents/:documentId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const documentId = Array.isArray(req.params.documentId)
      ? req.params.documentId[0]
      : req.params.documentId;

    const document = await resumeParsingService.getResumeDocument(userId, documentId);
    if (!document) {
      return res.status(404).json({ error: 'Resume document not found' });
    }

    res.json({ document });
  } catch (error) {
    logger.error({ error }, 'Failed to get resume document');
    res.status(500).json({ error: 'Failed to get resume document' });
  }
});

export default router;
