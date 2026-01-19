import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { v4 as uuid } from 'uuid';

import { config } from '../config';
import { logger } from '../logger';

import { memoryService } from './memoryService';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false }
});

export type PhotoMetadata = {
  latitude?: number;
  longitude?: number;
  altitude?: number;
  dateTime?: string;
  dateTimeOriginal?: string;
  cameraMake?: string;
  cameraModel?: string;
  width?: number;
  height?: number;
  orientation?: number;
  people?: string[]; // Detected faces/people
  locationName?: string; // Reverse geocoded location
  // Apple ML labels and metadata
  assetSubtype?: string; // iOS asset subtype (screenshot, panorama, etc.)
  mediaType?: string; // photo, video, etc.
  isFavorite?: boolean;
  isHidden?: boolean;
  isScreenshot?: boolean;
  isLivePhoto?: boolean;
  isPanorama?: boolean;
  isHDR?: boolean;
  // Quality indicators
  fileSize?: number;
  duration?: number; // For videos
};

export type PhotoUploadResult = {
  photoId: string;
  url: string;
  metadata: PhotoMetadata;
  autoEntry?: {
    id: string;
    content: string;
    tags: string[];
  };
};

class PhotoService {
  /**
   * Check if photo is relevant for journaling
   * Filters out screenshots, duplicates, low-quality, and irrelevant photos
   */
  isPhotoRelevant(metadata: PhotoMetadata): { relevant: boolean; reason?: string } {
    // Filter out screenshots (Apple labels these)
    if (metadata.isScreenshot || metadata.assetSubtype === 'screenshot') {
      return { relevant: false, reason: 'Screenshot detected' };
    }

    // Filter out hidden photos (user marked as hidden)
    if (metadata.isHidden) {
      return { relevant: false, reason: 'Hidden photo' };
    }

    // Filter out very small photos (likely thumbnails, accidental captures, or low quality)
    if (metadata.width && metadata.height) {
      const megapixels = (metadata.width * metadata.height) / 1000000;
      if (megapixels < 0.5) {
        return { relevant: false, reason: 'Photo too small (likely thumbnail or accidental)' };
      }
      
      // Filter out extremely wide or tall photos (likely accidental or corrupted)
      const aspectRatio = metadata.width / metadata.height;
      if (aspectRatio > 10 || aspectRatio < 0.1) {
        return { relevant: false, reason: 'Unusual aspect ratio (likely accidental capture)' };
      }
    }

    // Filter out very small file sizes (likely low quality, corrupted, or accidental)
    if (metadata.fileSize && metadata.fileSize < 50000) { // Less than 50KB
      return { relevant: false, reason: 'File too small (likely low quality or accidental)' };
    }

    // Filter out videos (for now - could add video support later)
    if (metadata.mediaType === 'video' || metadata.duration) {
      return { relevant: false, reason: 'Video file (not supported yet)' };
    }

    // Filter out photos without any meaningful metadata
    // Need at least date/time OR location to be relevant
    if (!metadata.dateTime && !metadata.dateTimeOriginal && !metadata.latitude && !metadata.longitude) {
      return { relevant: false, reason: 'No meaningful metadata (date/location)' };
    }

    // Prefer photos with location data (more likely to be meaningful experiences)
    // But still accept photos with just date/time if they're recent
    const hasLocation = metadata.latitude && metadata.longitude;
    const hasDate = metadata.dateTime || metadata.dateTimeOriginal;
    
    if (!hasLocation && hasDate) {
      // Check if photo is recent (within last 30 days) - more likely to be relevant
      const photoDate = metadata.dateTimeOriginal || metadata.dateTime;
      if (photoDate) {
        const daysAgo = (Date.now() - new Date(photoDate).getTime()) / (1000 * 60 * 60 * 24);
        if (daysAgo > 30) {
          return { relevant: false, reason: 'Old photo without location data' };
        }
      }
    }

    return { relevant: true };
  }

  /**
   * Extract EXIF metadata from photo buffer
   */
  async extractMetadata(photoBuffer: Buffer, filename: string): Promise<PhotoMetadata> {
    const metadata: PhotoMetadata = {};

    try {
      // Use exif-reader or similar library to parse EXIF data
      // For now, we'll create a structure that can be enhanced with actual EXIF parsing
      // In production, you'd use: import EXIF from 'exif-js' or 'piexifjs'
      
      // Placeholder - actual implementation would parse EXIF from buffer
      logger.info({ filename }, 'Extracting photo metadata');
      
      // This would be replaced with actual EXIF parsing:
      // const exifData = EXIF.readFromBinaryFile(photoBuffer);
      // metadata.latitude = exifData.GPSLatitude;
      // metadata.longitude = exifData.GPSLongitude;
      // metadata.dateTimeOriginal = exifData.DateTimeOriginal;
      // etc.

      return metadata;
    } catch (error) {
      logger.error({ error, filename }, 'Failed to extract photo metadata');
      return metadata;
    }
  }

  /**
   * Reverse geocode coordinates to get location name
   */
  async reverseGeocode(lat: number, lon: number): Promise<string | undefined> {
    try {
      // Using a free reverse geocoding service (Nominatim)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`
      );
      const data = await response.json();
      
      if (data.address) {
        const parts = [];
        if (data.address.road) parts.push(data.address.road);
        if (data.address.city || data.address.town || data.address.village) {
          parts.push(data.address.city || data.address.town || data.address.village);
        }
        if (data.address.country) parts.push(data.address.country);
        return parts.join(', ');
      }
      return undefined;
    } catch (error) {
      logger.error({ error, lat, lon }, 'Failed to reverse geocode');
      return undefined;
    }
  }

  /**
   * Upload photo to Supabase Storage and extract metadata
   */
  async uploadPhoto(
    userId: string,
    photoBuffer: Buffer,
    filename: string,
    contentType: string = 'image/jpeg'
  ): Promise<PhotoUploadResult> {
    const photoId = uuid();
    const filePath = `${userId}/${photoId}-${filename}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('photos')
      .upload(filePath, photoBuffer, {
        contentType,
        upsert: false
      });

    if (uploadError) {
      logger.error({ error: uploadError }, 'Failed to upload photo');
      throw uploadError;
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from('photos').getPublicUrl(filePath);
    const url = urlData.publicUrl;

    // Extract metadata
    const metadata = await this.extractMetadata(photoBuffer, filename);

    // Reverse geocode if coordinates available
    if (metadata.latitude && metadata.longitude) {
      metadata.locationName = await this.reverseGeocode(metadata.latitude, metadata.longitude);
    }

    // Generate auto journal entry from photo metadata
    const autoEntry = await this.generateEntryFromPhoto(userId, url, metadata);

    return {
      photoId,
      url,
      metadata,
      autoEntry
    };
  }

  /**
   * Generate automatic journal entry from photo metadata using AI
   * No photo storage needed - just uses metadata to create entries
   * Only processes relevant photos (filters out screenshots, low-quality, etc.)
   */
  async generateEntryFromPhoto(
    userId: string,
    photoUrl: string, // Optional - not used if empty
    metadata: PhotoMetadata
  ): Promise<PhotoUploadResult['autoEntry']> {
    // Check if photo is relevant before processing
    const relevanceCheck = this.isPhotoRelevant(metadata);
    if (!relevanceCheck.relevant) {
      logger.info({ reason: relevanceCheck.reason }, 'Skipping irrelevant photo');
      return undefined;
    }

    try {
      // Build context from metadata
      const contextParts: string[] = [];
      
      if (metadata.locationName) {
        contextParts.push(`Location: ${metadata.locationName}`);
      }
      if (metadata.dateTimeOriginal || metadata.dateTime) {
        const date = metadata.dateTimeOriginal || metadata.dateTime;
        contextParts.push(`Date: ${date}`);
      }
      if (metadata.people && metadata.people.length > 0) {
        contextParts.push(`People: ${metadata.people.join(', ')}`);
      }
      if (metadata.cameraMake || metadata.cameraModel) {
        contextParts.push(`Camera: ${metadata.cameraMake || ''} ${metadata.cameraModel || ''}`.trim());
      }

      const context = contextParts.join('\n');

      // Use GPT to generate a journal entry description
      const prompt = `Based on this photo metadata, create a brief journal entry describing what happened, where it was, and who was there. Be natural and concise. Focus on the experience and context.

${context}

Generate a journal entry:`;

      // Use OpenAI to generate entry from photo metadata
      const openaiClient = new OpenAI({ apiKey: config.openAiKey });
      
      const completion = await openaiClient.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: 'You are a journaling assistant. Create brief, natural journal entries from photo metadata. Include location, date, and people if available.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const summary = completion.choices[0]?.message?.content || 'Photo captured';

      // Extract tags from location and context
      const tags: string[] = [];
      if (metadata.locationName) {
        tags.push('photo', 'location');
        // Extract city/place name as tag
        const placeParts = metadata.locationName.split(',');
        if (placeParts.length > 0) {
          tags.push(placeParts[0].toLowerCase().replace(/\s+/g, '-'));
        }
      }
      if (metadata.people && metadata.people.length > 0) {
        tags.push('people', 'with-others');
      }

      // Save auto-generated entry (no photo URL stored)
      const entry = await memoryService.saveEntry({
        userId,
        content: summary,
        date: metadata.dateTimeOriginal || metadata.dateTime || new Date().toISOString(),
        tags,
        source: 'photo',
        metadata: {
          photoMetadata: metadata,
          autoGenerated: true,
          fromPhoto: true
        }
      });

      return {
        id: entry.id,
        content: summary,
        tags
      };
    } catch (error) {
      logger.error({ error }, 'Failed to generate entry from photo');
      return undefined;
    }
  }

  /**
   * Get all photos for a user
   */
  async getUserPhotos(userId: string): Promise<PhotoUploadResult[]> {
    try {
      const { data: files, error } = await supabase.storage
        .from('photos')
        .list(userId, {
          limit: 100,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (error) {
        logger.error({ error }, 'Failed to list photos');
        throw error;
      }

      // Get entries that reference photos
      const entries = await memoryService.searchEntries(userId, {
        search: 'photo',
        limit: 100
      });

      const photos: PhotoUploadResult[] = files.map((file) => {
        const entry = entries.find(e => 
          e.metadata && typeof e.metadata === 'object' && 
          'photoUrl' in e.metadata
        );

        const { data: urlData } = supabase.storage
          .from('photos')
          .getPublicUrl(`${userId}/${file.name}`);

        return {
          photoId: file.id || file.name,
          url: urlData.publicUrl,
          metadata: entry?.metadata as PhotoMetadata || {},
          autoEntry: entry ? {
            id: entry.id,
            content: entry.content,
            tags: entry.tags
          } : undefined
        };
      });

      return photos;
    } catch (error) {
      logger.error({ error }, 'Failed to get user photos');
      throw error;
    }
  }
}

export const photoService = new PhotoService();

