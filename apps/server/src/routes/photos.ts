import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import type { PhotoAnalysisResult } from '../services/photoAnalysisService';
import { photoService, type PhotoMetadata } from '../services/photoService';
import { supabaseAdmin } from '../services/supabaseClient';
import { createMemoryUpload } from '../middleware/multerConfig';

const router = Router();

const upload = createMemoryUpload({
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
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

async function linkPhotoAnalysisEntities(
  userId: string,
  entryId: string,
  analysis: PhotoAnalysisResult,
  metadata: PhotoMetadata,
): Promise<void> {
  const { photoAnalysisService } = await import('../services/photoAnalysisService');

  if (analysis.detectedSkills && analysis.detectedSkills.length > 0) {
    await photoAnalysisService.linkPhotoToSkills(userId, entryId, analysis.detectedSkills);
  }

  if (analysis.detectedGroups && analysis.detectedGroups.length > 0) {
    await photoAnalysisService.linkPhotoToGroups(userId, entryId, analysis.detectedGroups);
  }

  if (analysis.suggestedLocation?.type === 'location' && analysis.suggestedLocation.id) {
    await supabaseAdmin
      .from('photo_location_links')
      .upsert({
        user_id: userId,
        journal_entry_id: entryId,
        location_id: analysis.suggestedLocation.id,
        confidence: 0.8,
        detection_reason: analysis.suggestedLocation.reason,
        auto_detected: true
      })
      .catch(err => logger.debug({ error: err }, 'Failed to link photo to location'));
  }

  if (metadata.locationName) {
    const { data: location } = await supabaseAdmin
      .from('locations')
      .select('id')
      .eq('user_id', userId)
      .ilike('name', `%${metadata.locationName}%`)
      .limit(1)
      .single();

    if (location) {
      await supabaseAdmin
        .from('photo_location_links')
        .upsert({
          user_id: userId,
          journal_entry_id: entryId,
          location_id: location.id,
          confidence: 0.9,
          detection_reason: `Photo taken at ${metadata.locationName}`,
          auto_detected: true
        })
        .catch(err => logger.debug({ error: err }, 'Failed to link photo to location from metadata'));
    }
  }
}

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

    const { photoAnalysisService } = await import('../services/photoAnalysisService');
    const analysis = await photoAnalysisService.analyzePhoto(
      req.user!.id,
      req.file.buffer,
      filename,
      metadata
    );

    const uploadResult = await photoService.uploadPhoto(
      req.user!.id,
      req.file.buffer,
      filename,
      req.file.mimetype,
      { generateAutoEntry: false }
    );

    const autoEntry = await photoService.generateEntryFromPhotoAnalysis(
      req.user!.id,
      {
        photoUrl: uploadResult.url,
        photoId: uploadResult.photoId,
        filename,
        metadata,
        analysis,
      }
    );

    if (autoEntry?.id) {
      await linkPhotoAnalysisEntities(req.user!.id, autoEntry.id, analysis, metadata);
    }

    logger.info({ entryId: autoEntry?.id, userId: req.user!.id }, 'Photo processed and entry created');

    res.status(201).json({ 
      success: true,
      entry: autoEntry,
      photoId: uploadResult.photoId,
      photoUrl: uploadResult.url,
      metadata,
      analysis: {
        photoType: analysis.photoType,
        confidence: analysis.confidence,
        summary: analysis.summary,
        detectedSkills: analysis.detectedSkills,
        detectedGroups: analysis.detectedGroups,
        detectedEntities: analysis.detectedEntities,
        suggestedLocation: analysis.suggestedLocation
      }
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
        const filename = file.originalname || `photo-${Date.now()}.jpg`;
        const metadata = await photoService.extractMetadata(
          file.buffer,
          filename
        );
        
        if (metadata.latitude && metadata.longitude) {
          metadata.locationName = await photoService.reverseGeocode(metadata.latitude, metadata.longitude);
        }

        const { photoAnalysisService } = await import('../services/photoAnalysisService');
        const analysis = await photoAnalysisService.analyzePhoto(
          req.user!.id,
          file.buffer,
          filename,
          metadata
        );

        const uploadResult = await photoService.uploadPhoto(
          req.user!.id,
          file.buffer,
          filename,
          file.mimetype,
          { generateAutoEntry: false }
        );

        const autoEntry = await photoService.generateEntryFromPhotoAnalysis(
          req.user!.id,
          {
            photoUrl: uploadResult.url,
            photoId: uploadResult.photoId,
            filename,
            metadata,
            analysis,
          }
        );

        if (autoEntry?.id) {
          await linkPhotoAnalysisEntities(req.user!.id, autoEntry.id, analysis, metadata);
        }

        return {
          filename,
          entry: autoEntry,
          metadata,
          photoId: uploadResult.photoId,
          photoUrl: uploadResult.url,
          analysis
        };
      })
    );

    const entriesCreated = results.filter(r => r.entry).length;
    logger.info({ count: entriesCreated, total: results.length, userId: req.user!.id }, 'Batch photos processed');

    res.status(201).json({ 
      success: true,
      entriesCreated,
      totalProcessed: results.length,
      entries: results.map(r => r.entry).filter(Boolean),
      results: results.map((result) => ({
        filename: result.filename,
        photoId: result.photoId,
        photoUrl: result.photoUrl,
        entryId: result.entry?.id,
        photoType: result.analysis.photoType,
        confidence: result.analysis.confidence,
        summary: result.analysis.summary,
        skipped: !result.entry,
      }))
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

    const { options, analysis: analysisRaw } = req.body;
    const parsedOptions = typeof options === 'string' ? JSON.parse(options) : options ?? {};
    const clientAnalysis =
      typeof analysisRaw === 'string'
        ? (() => {
            try {
              return JSON.parse(analysisRaw);
            } catch {
              return undefined;
            }
          })()
        : analysisRaw;

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
      {
        addToLoreBook: Boolean(parsedOptions.addToLoreBook),
        extractTextOnly: Boolean(parsedOptions.extractTextOnly),
        addToSelfPhotos: parsedOptions.addToSelfPhotos !== false,
        suggestedLocation: parsedOptions.suggestedLocation,
        analysis: clientAnalysis,
      }
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
