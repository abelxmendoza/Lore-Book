import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { unifiedFileIngestionService } from '../services/ingestion/unifiedFileIngestionService';
import { resumeParsingService } from '../services/profileClaims/resumeParsingService';
import { buildResumeChatFeedback } from '../services/profileClaims/resumeFeedbackService';
import type { ParsedResume } from '../services/profileClaims/resumeStructuredTypes';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit for resumes
  },
  fileFilter: (_req, file, cb) => {
    // Accept resume file types
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, DOCX, or TXT files are allowed'));
    }
  }
});

/**
 * Upload and process resume
 */
router.post('/upload', requireAuth, upload.single('resume'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No resume file provided' });
    }

    const userId = req.user!.id;
    const file = req.file;

    const result = await unifiedFileIngestionService.ingest({
      userId,
      buffer: file.buffer,
      filename: file.originalname || `resume-${Date.now()}.pdf`,
      mimeType: file.mimetype,
      kind: 'resume',
    });

    if (result.processingStatus === 'failed') {
      return res.status(500).json({ error: result.error ?? 'Failed to process resume' });
    }

    const documents = await resumeParsingService.getResumeDocuments(userId);
    const document = documents.find(
      (d) => (d.parsed_data as { source_file_id?: string })?.source_file_id === result.userFileId
    ) ?? documents[0];

    logger.info({
      userId,
      userFileId: result.userFileId,
      claimsCreated: result.claimsCreated,
    }, 'Resume processed via unified ingestion');

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
      chatFeedback: feedback?.chatFeedback ?? null,
      careerTimeline: feedback?.careerTimeline ?? [],
      educationTimeline: feedback?.educationTimeline ?? [],
      savedToLibrary: true,
      fileName: file.originalname,
      message: feedback?.chatFeedback
        ? `Resume saved to your library and memory.`
        : `Resume processed. ${result.claimsCreated ?? 0} claims, ${result.momentsCreated ?? 0} timeline entries, ${result.skillsCreated ?? 0} skills added to your lore.`,
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to process resume');
    res.status(500).json({ 
      error: error.message || 'Failed to process resume' 
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
    const { documentId } = req.params;

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
