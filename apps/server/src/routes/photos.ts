import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { createMemoryUpload } from '../middleware/multerConfig';
import { DOCUMENT_CATEGORIES } from '../services/documents/documentCategories';
import { DOCUMENT_SUBTYPES } from '../services/documents/documentSubtypes';
import type { PhotoAnalysisResult } from '../services/photoAnalysisService';
import { photoService, type PhotoMetadata } from '../services/photoService';
import { supabaseAdmin } from '../services/supabaseClient';

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

    const { options, analysis: analysisRaw, caption } = req.body;
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
        caption: typeof caption === 'string' ? caption.trim() || undefined : undefined,
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

const PRESET_PHOTO_CATEGORIES = ['selfie', 'group_photo', 'message_screenshot', 'event_flyer', 'meme', 'other'];

const categoryUpdateSchema = z.object({
  category: z.string().trim().min(1).max(64),
  customLabel: z.string().trim().max(120).optional(),
});

/**
 * Set/override a photo's Photo Album category — user correction of the AI
 * classification, or a brand-new user-defined category.
 */
router.patch('/:entryId/category', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = categoryUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    const { memoryService } = await import('../services/memoryService');
    const entry = await memoryService.getEntry(req.user!.id, req.params.entryId as string);
    if (!entry) {
      return res.status(404).json({ error: 'Photo entry not found' });
    }

    const existingMetadata = (entry.metadata as Record<string, unknown>) ?? {};
    const priorCategory = typeof existingMetadata.category === 'string' ? existingMetadata.category : undefined;
    const nextCategory = parsed.data.category.toLowerCase().replace(/\s+/g, '_');
    const existingTags = Array.isArray(entry.tags) ? (entry.tags as string[]) : [];
    const nextTags = Array.from(
      new Set([...existingTags.filter((t) => t !== priorCategory), nextCategory]),
    );

    const updated = await memoryService.updateEntry(req.user!.id, req.params.entryId as string, {
      tags: nextTags,
      metadata: {
        ...existingMetadata,
        category: nextCategory,
        customCategoryLabel: PRESET_PHOTO_CATEGORIES.includes(nextCategory)
          ? undefined
          : (parsed.data.customLabel?.trim() || parsed.data.category.trim()),
        categorySetBy: 'user',
      },
    });

    res.json({ success: true, entry: updated });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update photo category');
    res.status(500).json({
      error: 'Failed to update photo category',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

const sendToDocumentsSchema = z.object({
  category: z.enum(DOCUMENT_CATEGORIES).default('photos_images'),
  documentSubtype: z.enum(DOCUMENT_SUBTYPES).optional(),
}).superRefine((value, context) => {
  if (value.category === 'personal_identity' && !value.documentSubtype) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['documentSubtype'],
      message: 'Choose the kind of personal or identity document.',
    });
  }
});

const photoQuerySchema = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(100).optional(),
});

/**
 * Search photo descriptions and extracted metadata without sending the image
 * back through an AI model. The focused-chat action remains available for
 * deeper, grounded questions about a selected photo.
 */
router.post('/query', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = photoQuerySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    const { memoryService } = await import('../services/memoryService');
    const entries = await memoryService.searchEntries(req.user!.id, {
      search: '',
      limit: 1000,
    });
    const query = parsed.data.query.toLowerCase();
    const tokens = query.split(/\s+/).filter(Boolean);
    const matches = entries
      .filter((entry) => {
        const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
        return Boolean(metadata.photoUrl || metadata.photoId) && !metadata.movedToDocuments;
      })
      .map((entry) => {
        const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
        const searchable = [
          entry.content,
          entry.summary,
          ...(entry.tags ?? []),
          typeof metadata.locationName === 'string' ? metadata.locationName : '',
          ...(Array.isArray(metadata.people) ? metadata.people : []),
        ]
          .join(' ')
          .toLowerCase();
        const exactBoost = searchable.includes(query) ? 2 : 0;
        const tokenMatches = tokens.filter((token) => searchable.includes(token)).length;
        return {
          entry,
          score: exactBoost + tokenMatches / Math.max(tokens.length, 1),
        };
      })
      .filter((match) => match.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return new Date(right.entry.date ?? 0).getTime() - new Date(left.entry.date ?? 0).getTime();
      })
      .slice(0, parsed.data.limit ?? 20)
      .map(({ entry }) => entry);

    res.json({
      success: true,
      result: {
        query: parsed.data.query,
        photos: matches,
        total: matches.length,
        warnings: [],
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to query photos');
    res.status(500).json({ error: 'Failed to query photos' });
  }
});

/**
 * Move a Photo Album entry to a user-selected Documents folder. The original
 * journal row is retained for provenance but excluded from the Photos book.
 */
router.post('/:entryId/send-to-documents', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = sendToDocumentsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    const result = await photoService.sendToDocuments(
      req.user!.id,
      req.params.entryId as string,
      {
        category: parsed.data.category,
        documentSubtype: parsed.data.documentSubtype,
      },
    );

    res.json({ success: true, ...result });
  } catch (error) {
    logger.error({ err: error }, 'Failed to send photo to Documents');
    const message = error instanceof Error ? error.message : 'Failed to send photo to Documents';
    const status = message.includes('not found') ? 404 : message.includes('already been sent') ? 409 : 500;
    res.status(status).json({ error: message });
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

    // Filter entries that have photoUrl or photoId in metadata, excluding
    // any that have been moved to the Documents library.
    const photoEntries = entries.filter(entry => {
      const metadata = entry.metadata || {};
      return (metadata.photoUrl || metadata.photoId) && !metadata.movedToDocuments;
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
