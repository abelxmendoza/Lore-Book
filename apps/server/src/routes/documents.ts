import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { documentService } from '../services/documentService';
import { logger } from '../logger';

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
    const fileContent = req.file.buffer.toString('utf-8');
    const fileName = req.file.originalname;
    const fileType = req.file.mimetype;

    const result = await documentService.processDocument(userId, fileContent, fileName, fileType);

    res.json({
      success: true,
      message: `Document processed successfully. Created ${result.entriesCreated} entries, ${result.charactersCreated} characters, and ${result.sectionsCreated} memoir sections.`,
      ...result
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

