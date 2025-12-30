import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../logger';
import { photoService } from '../services/photoService';

const router = Router();

// Configure multer for memory storage (we'll upload directly to Supabase)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    // Accept image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

/**
 * Upload photo - processes metadata and creates journal entry
 * Silently processes photo and creates journal entry - no photo storage needed
 */
router.post('/upload', requireAuth, upload.single('photo'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No photo file provided' });
    }

    const filename = req.file.originalname || `photo-${Date.now()}.jpg`;
    
    // Extract metadata and generate entry without storing photo
    const metadata = await photoService.extractMetadata(req.file.buffer, filename);
    
    // Reverse geocode if coordinates available
    if (metadata.latitude && metadata.longitude) {
      metadata.locationName = await photoService.reverseGeocode(metadata.latitude, metadata.longitude);
    }

    // Generate journal entry from metadata (no photo URL needed)
    const autoEntry = await photoService.generateEntryFromPhoto(
      req.user!.id,
      '', // No photo URL - we're not storing photos
      metadata
    );

    logger.info({ entryId: autoEntry?.id, userId: req.user!.id }, 'Photo processed and entry created');

    res.status(201).json({ 
      success: true,
      entry: autoEntry,
      metadata 
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to process photo');
    res.status(500).json({ error: error.message || 'Failed to process photo' });
  }
});

/**
 * Upload multiple photos at once - processes metadata and creates entries
 */
router.post('/upload/batch', requireAuth, upload.array('photos', 50), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({ error: 'No photo files provided' });
    }

    const results = await Promise.all(
      req.files.map(async (file) => {
        const metadata = await photoService.extractMetadata(
          file.buffer,
          file.originalname || `photo-${Date.now()}.jpg`
        );
        
        if (metadata.latitude && metadata.longitude) {
          metadata.locationName = await photoService.reverseGeocode(metadata.latitude, metadata.longitude);
        }

        const autoEntry = await photoService.generateEntryFromPhoto(
          req.user!.id,
          '',
          metadata
        );

        return {
          filename: file.originalname,
          entry: autoEntry,
          metadata
        };
      })
    );

    const entriesCreated = results.filter(r => r.entry).length;
    logger.info({ count: entriesCreated, total: results.length, userId: req.user!.id }, 'Batch photos processed');

    res.status(201).json({ 
      success: true,
      entriesCreated,
      totalProcessed: results.length,
      entries: results.map(r => r.entry).filter(Boolean)
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to process batch photos');
    res.status(500).json({ error: error.message || 'Failed to process photos' });
  }
});

/**
 * Sync photos from device (for mobile apps)
 * Accepts photo metadata without actual upload (for existing photos)
 * Creates journal entries automatically in the background
 */
router.post('/sync', requireAuth, async (req: AuthenticatedRequest, res) => {
  const syncSchema = z.object({
    photos: z.array(z.object({
      url: z.string().optional(), // Optional - we don't store photos
      metadata: z.object({
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        dateTime: z.string().optional(),
        dateTimeOriginal: z.string().optional(),
        cameraMake: z.string().optional(),
        cameraModel: z.string().optional(),
        people: z.array(z.string()).optional(),
        locationName: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        fileSize: z.number().optional(),
        isScreenshot: z.boolean().optional(),
        isHidden: z.boolean().optional(),
        isFavorite: z.boolean().optional(),
        assetSubtype: z.string().optional()
      })
    }))
  });

  try {
    const parsed = syncSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    const results = await Promise.all(
      parsed.data.photos.map(async (photo) => {
        // Generate entry from metadata without uploading (photo already exists on device)
        // PhotoService will filter out irrelevant photos automatically
        const autoEntry = await photoService.generateEntryFromPhoto(
          req.user!.id,
          photo.url || '',
          photo.metadata
        );

        return {
          metadata: photo.metadata,
          entry: autoEntry,
          skipped: !autoEntry
        };
      })
    );

    const entriesCreated = results.filter(r => r.entry).length;
    const skipped = results.filter(r => r.skipped).length;
    logger.info({ 
      entriesCreated, 
      skipped,
      total: results.length, 
      userId: req.user!.id 
    }, 'Photos synced and entries created');

    res.status(201).json({ 
      success: true,
      entriesCreated,
      skipped,
      totalProcessed: results.length,
      entries: results.map(r => r.entry).filter(Boolean)
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to sync photos');
    res.status(500).json({ error: error.message || 'Failed to sync photos' });
  }
});

/**
 * Analyze photo to determine type and suggest placement
 */
router.post('/analyze', requireAuth, upload.single('photo'), async (req: AuthenticatedRequest, res) => {
  try {
    // Support both file upload and base64
    let photoBuffer: Buffer;
    let filename: string;
    
    if (req.file) {
      // File upload
      photoBuffer = req.file.buffer;
      filename = req.file.originalname || `photo-${Date.now()}.jpg`;
    } else {
      // Base64 from body
      const { photo, filename: bodyFilename } = req.body;
      if (!photo) {
        return res.status(400).json({ error: 'Photo data is required' });
      }
      photoBuffer = Buffer.from(photo, 'base64');
      filename = bodyFilename || `photo-${Date.now()}.jpg`;
    }

    const { photoAnalysisService } = await import('../services/photoAnalysisService');
    
    // Extract basic metadata
    const metadata = await photoService.extractMetadata(photoBuffer, filename);
    
    // Reverse geocode if coordinates available
    if (metadata.latitude && metadata.longitude) {
      metadata.locationName = await photoService.reverseGeocode(metadata.latitude, metadata.longitude);
    }
    
    // Analyze photo
    const analysis = await photoAnalysisService.analyzePhoto(
      req.user!.id,
      photoBuffer,
      filename,
      metadata
    );

    res.json(analysis);
  } catch (error) {
    logger.error({ err: error }, 'Failed to analyze photo');
    res.status(500).json({
      error: 'Failed to analyze photo',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Process photo based on user's decision
 */
router.post('/process', requireAuth, upload.single('photo'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No photo file provided' });
    }

    const { options } = req.body;
    const parsedOptions = typeof options === 'string' ? JSON.parse(options) : options;

    const filename = req.file.originalname || `photo-${Date.now()}.jpg`;
    const metadata = await photoService.extractMetadata(req.file.buffer, filename);
    
    if (metadata.latitude && metadata.longitude) {
      metadata.locationName = await photoService.reverseGeocode(metadata.latitude, metadata.longitude);
    }

    const { photoAnalysisService } = await import('../services/photoAnalysisService');
    const result = await photoAnalysisService.processPhoto(
      req.user!.id,
      req.file.buffer,
      filename,
      metadata,
      parsedOptions
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to process photo');
    res.status(500).json({
      error: 'Failed to process photo',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get all photos for the authenticated user
 * Returns entries that have photoUrl in metadata
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { memoryService } = await import('../services/memoryService');
    
    // Get entries with photo metadata
    const entries = await memoryService.searchEntries(req.user!.id, {
      search: '',
      limit: 1000
    });

    // Filter entries that have photoUrl or photoId in metadata
    const photoEntries = entries.filter(entry => {
      const metadata = entry.metadata || {};
      return metadata.photoUrl || metadata.photoId;
    });

    res.json({ 
      entries: photoEntries,
      count: photoEntries.length
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get photos');
    res.status(500).json({
      error: 'Failed to get photos',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export const photosRouter = router;

