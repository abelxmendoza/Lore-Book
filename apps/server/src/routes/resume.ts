import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../logger';
import { resumeParsingService } from '../services/profileClaims/resumeParsingService';
import { profileClaimsService } from '../services/profileClaims/profileClaimsService';

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

    // Determine file type from mimetype
    let fileType: 'pdf' | 'doc' | 'docx' | 'txt' = 'txt';
    if (file.mimetype === 'application/pdf') {
      fileType = 'pdf';
    } else if (file.mimetype === 'application/msword') {
      fileType = 'doc';
    } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      fileType = 'docx';
    } else if (file.mimetype === 'text/plain') {
      fileType = 'txt';
    }

    // Process resume
    const { document, claims } = await resumeParsingService.processResume(
      userId,
      file.buffer,
      {
        fileName: file.originalname || `resume-${Date.now()}.${fileType}`,
        fileType,
        fileSize: file.size
      }
    );

    // Create claims in database
    const createdClaims = await profileClaimsService.batchCreateClaims(userId, claims);

    logger.info({ 
      userId, 
      documentId: document.id, 
      claimsCreated: createdClaims.length 
    }, 'Resume processed and claims created');

    res.status(201).json({
      success: true,
      document: {
        id: document.id,
        file_name: document.file_name,
        processing_status: document.processing_status,
        claims_generated: document.claims_generated
      },
      claims: createdClaims.map(c => ({
        id: c.id,
        claim_type: c.claim_type,
        claim_text: c.claim_text,
        confidence: c.confidence
      })),
      message: `Resume processed. ${createdClaims.length} claims extracted.`
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
