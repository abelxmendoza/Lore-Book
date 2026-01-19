import OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';

import type { PhotoMetadata } from './photoService';
import { supabaseAdmin } from './supabaseClient';

const openai = new OpenAI({ apiKey: config.openAiKey });

export type PhotoAnalysisResult = {
  photoType: 'memory' | 'document' | 'junk';
  confidence: number;
  extractedText?: string;
  suggestedLocation?: {
    type: 'timeline' | 'character' | 'location' | 'memoir' | 'entry';
    id?: string;
    name: string;
    reason: string;
  };
  detectedEntities?: {
    characters?: string[];
    locations?: string[];
    dates?: string[];
  };
  detectedSkills?: Array<{
    skill_name: string;
    confidence: number;
    reason: string;
  }>;
  detectedGroups?: Array<{
    group_name: string;
    confidence: number;
    reason: string;
  }>;
  summary?: string;
  metadata?: {
    date?: string;
    location?: string;
    people?: string[];
  };
};

class PhotoAnalysisService {
  /**
   * Analyze photo to determine type and suggest placement
   */
  async analyzePhoto(
    userId: string,
    photoBuffer: Buffer,
    filename: string,
    metadata: PhotoMetadata
  ): Promise<PhotoAnalysisResult> {
    try {
      // For large images, we might need to resize or limit size
      // OpenAI Vision API has size limits
      const mimeType = this.getMimeType(filename);
      
      // Limit image size to avoid API limits (max ~20MB for base64)
      const imageBuffer = photoBuffer;
      if (imageBuffer.length > 15 * 1024 * 1024) {
        // If too large, we'll need to resize (for now, just use as-is and let API handle it)
        logger.warn({ size: imageBuffer.length, filename }, 'Large image, may exceed API limits');
      }
      
      const base64Image = imageBuffer.toString('base64');

      // Get user's existing skills for context
      const { skillService } = await import('./skills/skillService');
      const userSkills = await skillService.getSkills(userId, { active_only: true }).catch(() => []);
      const skillNames = userSkills.map(s => s.skill_name).join(', ');
      const skillsContext = skillNames ? `\n\nUser's confirmed skills: ${skillNames}\nOnly match detected skills to these confirmed skills.` : '';

      // Use OpenAI Vision API to analyze the photo
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o', // Use vision-capable model
        messages: [
          {
            role: 'system',
            content: `You are analyzing a photo to determine:
1. Photo type: 'memory' (personal photo worth keeping), 'document' (photo of text/documents - extract text only), or 'junk' (screenshot, low quality, irrelevant)
2. If it's a document, extract all text using OCR
3. Suggest where it should go in the user's lore book (timeline, character, location, memoir section, or specific entry)
4. Detect entities: people, locations, dates mentioned
5. Detect skills being practiced (e.g., martial arts, cooking, photography, sports, music, etc.) - only if clearly visible/obvious
6. Detect groups/organizations (e.g., gym, club, team, organization) - only if clearly visible/obvious
7. Generate a brief summary

IMPORTANT: 
- For skills: Only include skills that match the user's CONFIRMED skills list (provided below). If a skill is detected in the photo but NOT in the user's confirmed skills, do NOT include it.
- For groups: Only include groups if clearly visible (e.g., gym logo, club name, organization sign, etc.)
- For locations: Include if location is visible or can be inferred from context${skillsContext}

Return JSON:
{
  "photoType": "memory" | "document" | "junk",
  "confidence": 0.0-1.0,
  "extractedText": "text from document if document type",
  "suggestedLocation": {
    "type": "timeline" | "character" | "location" | "memoir" | "entry",
    "name": "suggested location name",
    "reason": "why this location"
  },
  "detectedEntities": {
    "characters": ["name1", "name2"],
    "locations": ["location1"],
    "dates": ["date1"]
  },
  "detectedSkills": [
    {
      "skill_name": "skill name (e.g., 'Martial Arts', 'Cooking', 'Photography')",
      "confidence": 0.0-1.0,
      "reason": "why this skill is detected"
    }
  ],
  "detectedGroups": [
    {
      "group_name": "group name (e.g., 'Local Gym', 'Photography Club')",
      "confidence": 0.0-1.0,
      "reason": "why this group is detected"
    }
  ],
  "summary": "brief description of photo"
}`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this photo. Filename: ${filename}. Metadata: ${JSON.stringify(metadata)}${skillsContext ? `\n\nUser's confirmed skills: ${skillNames}` : ''}`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 1000
      });

      const response = completion.choices[0]?.message?.content || '{}';
      
      // Parse JSON response
      let analysis: PhotoAnalysisResult;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : response;
        analysis = JSON.parse(jsonStr);
      } catch (error) {
        logger.warn({ error, response }, 'Failed to parse photo analysis');
        // Fallback analysis
        analysis = {
          photoType: 'memory',
          confidence: 0.5,
          summary: 'Photo analysis unavailable'
        };
      }

      // Enhance with metadata
      if (metadata.dateTime || metadata.dateTimeOriginal) {
        analysis.metadata = {
          ...analysis.metadata,
          date: metadata.dateTimeOriginal || metadata.dateTime
        };
      }

      if (metadata.locationName) {
        analysis.metadata = {
          ...analysis.metadata,
          location: metadata.locationName
        };
      }

      if (metadata.people && metadata.people.length > 0) {
        analysis.metadata = {
          ...analysis.metadata,
          people: metadata.people
        };
        if (!analysis.detectedEntities) {
          analysis.detectedEntities = {};
        }
        analysis.detectedEntities.characters = [
          ...(analysis.detectedEntities.characters || []),
          ...metadata.people
        ];
      }

      // Find suggested location in user's existing data
      if (analysis.suggestedLocation) {
        const location = await this.findSuggestedLocation(
          userId,
          analysis.suggestedLocation.type,
          analysis.suggestedLocation.name
        );
        if (location) {
          analysis.suggestedLocation.id = location.id;
          analysis.suggestedLocation.name = location.name;
        }
      }

      return analysis;
    } catch (error) {
      logger.error({ error, filename }, 'Failed to analyze photo');
      // Fallback: treat as memory photo
      return {
        photoType: 'memory',
        confidence: 0.3,
        summary: 'Photo analysis failed - defaulting to memory type'
      };
    }
  }

  /**
   * Find suggested location in user's data
   */
  private async findSuggestedLocation(
    userId: string,
    type: string,
    name: string
  ): Promise<{ id: string; name: string } | null> {
    try {
      if (type === 'timeline') {
        const { data } = await supabaseAdmin
          .from('timelines')
          .select('id, title')
          .eq('user_id', userId)
          .ilike('title', `%${name}%`)
          .limit(1)
          .single();
        
        if (data) {
          return { id: data.id, name: data.title };
        }
      } else if (type === 'character') {
        const { data } = await supabaseAdmin
          .from('characters')
          .select('id, name')
          .eq('user_id', userId)
          .ilike('name', `%${name}%`)
          .limit(1)
          .single();
        
        if (data) {
          return { id: data.id, name: data.name };
        }
      } else if (type === 'location') {
        const { data } = await supabaseAdmin
          .from('locations')
          .select('id, name')
          .eq('user_id', userId)
          .ilike('name', `%${name}%`)
          .limit(1)
          .single();
        
        if (data) {
          return { id: data.id, name: data.name };
        }
      }
    } catch (error) {
      logger.debug({ error, type, name }, 'Failed to find suggested location');
    }
    
    return null;
  }

  /**
   * Automatically link photo to skills, locations, and groups based on analysis
   */
  private async autoLinkPhotoToEntities(
    userId: string,
    entryId: string,
    metadata: PhotoMetadata
  ): Promise<void> {
    try {
      // Analyze photo to detect skills, locations, and groups
      // Note: This requires the photo buffer, which we may not have here
      // For now, we'll link based on metadata and location
      
      // Link to location if available
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
              confidence: 0.8,
              detection_reason: `Photo taken at ${metadata.locationName}`,
              auto_detected: true
            })
            .catch(err => logger.debug({ error: err }, 'Failed to auto-link photo to location'));
        }
      }

      // Note: Skill and group detection requires full photo analysis
      // This will be handled in the photo upload route after analysis
    } catch (error) {
      logger.debug({ error, entryId }, 'Failed to auto-link photo to entities');
    }
  }

  /**
   * Link photo to detected skills after analysis
   */
  async linkPhotoToSkills(
    userId: string,
    entryId: string,
    detectedSkills: Array<{ skill_name: string; confidence: number; reason: string }>
  ): Promise<void> {
    try {
      const { skillService } = await import('./skills/skillService');
      const userSkills = await skillService.getSkills(userId, { active_only: true });

      for (const detected of detectedSkills) {
        if (detected.confidence < 0.6) continue; // Only high-confidence matches

        // Find matching skill
        const matchingSkill = userSkills.find(s =>
          s.skill_name.toLowerCase().includes(detected.skill_name.toLowerCase()) ||
          detected.skill_name.toLowerCase().includes(s.skill_name.toLowerCase())
        );

        if (matchingSkill) {
          await supabaseAdmin
            .from('photo_skill_links')
            .upsert({
              user_id: userId,
              journal_entry_id: entryId,
              skill_id: matchingSkill.id,
              confidence: detected.confidence,
              detection_reason: detected.reason,
              auto_detected: true
            })
            .catch(err => logger.debug({ error: err, skillId: matchingSkill.id }, 'Failed to link photo to skill'));

          // Add XP to skill for photo practice
          await skillService.addXP(
            userId,
            matchingSkill.id,
            5, // Small XP for photo evidence
            'memory',
            entryId,
            `Photo evidence: ${detected.reason}`
          ).catch(err => logger.debug({ error: err }, 'Failed to add XP for photo'));
        }
      }
    } catch (error) {
      logger.error({ error, entryId }, 'Failed to link photo to skills');
    }
  }

  /**
   * Link photo to detected groups/organizations after analysis
   */
  async linkPhotoToGroups(
    userId: string,
    entryId: string,
    detectedGroups: Array<{ group_name: string; confidence: number; reason: string }>
  ): Promise<void> {
    try {
      for (const detected of detectedGroups) {
        if (detected.confidence < 0.6) continue; // Only high-confidence matches

        // Try to find matching organization
        const { data: org } = await supabaseAdmin
          .from('entity_resolution')
          .select('entity_id')
          .eq('user_id', userId)
          .eq('entity_type', 'ORG')
          .ilike('primary_name', `%${detected.group_name}%`)
          .limit(1)
          .single();

        await supabaseAdmin
          .from('photo_group_links')
          .upsert({
            user_id: userId,
            journal_entry_id: entryId,
            organization_id: org?.entity_id || null,
            organization_name: detected.group_name,
            confidence: detected.confidence,
            detection_reason: detected.reason,
            auto_detected: true
          })
          .catch(err => logger.debug({ error: err }, 'Failed to link photo to group'));
      }
    } catch (error) {
      logger.error({ error, entryId }, 'Failed to link photo to groups');
    }
  }

  /**
   * Get MIME type from filename
   */
  private getMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp'
    };
    return mimeTypes[ext || ''] || 'image/jpeg';
  }

  /**
   * Process photo based on user's decision
   */
  async processPhoto(
    userId: string,
    photoBuffer: Buffer,
    filename: string,
    metadata: PhotoMetadata,
    options: {
      addToLoreBook: boolean;
      extractTextOnly: boolean;
      suggestedLocation?: PhotoAnalysisResult['suggestedLocation'];
    }
  ): Promise<{
    entryId?: string;
    textExtracted?: string;
    photoStored?: boolean;
  }> {
    try {
      if (options.extractTextOnly) {
        // Extract text and create entry without storing photo
        const analysis = await this.analyzePhoto(userId, photoBuffer, filename, metadata);
        const extractedText = analysis.extractedText || '';

        if (extractedText) {
          // Create journal entry from extracted text
          const { memoryService } = await import('./memoryService');
          const entry = await memoryService.saveEntry({
            userId,
            content: `[Extracted from photo: ${filename}]\n\n${extractedText}`,
            date: metadata.dateTimeOriginal || metadata.dateTime || new Date().toISOString(),
            tags: ['photo', 'document', 'extracted'],
            source: 'photo_document',
            metadata: {
              photoFilename: filename,
              extractedFromPhoto: true,
              photoMetadata: metadata
            }
          });

          return {
            entryId: entry.id,
            textExtracted: extractedText,
            photoStored: false
          };
        }
      } else if (options.addToLoreBook) {
        // Store photo and create entry
        // Upload photo to storage
        const { photoService } = await import('./photoService');
        const uploadResult = await photoService.uploadPhoto(
          userId,
          photoBuffer,
          filename
        );

        // Create entry with photo reference
        const { memoryService } = await import('./memoryService');
        const entryContent = metadata.locationName
          ? `Photo taken at ${metadata.locationName}`
          : 'Photo added to lore book';

        const entry = await memoryService.saveEntry({
          userId,
          content: entryContent,
          date: metadata.dateTimeOriginal || metadata.dateTime || new Date().toISOString(),
          tags: ['photo', 'memory'],
          source: 'photo_upload',
          metadata: {
            photoUrl: uploadResult.url,
            photoId: uploadResult.photoId,
            photoMetadata: metadata,
            suggestedLocation: options.suggestedLocation
          }
        });

        // Link to suggested location if provided
        if (options.suggestedLocation?.id) {
          if (options.suggestedLocation.type === 'timeline') {
            // Add to timeline membership
            await supabaseAdmin
              .from('timeline_memberships')
              .upsert({
                user_id: userId,
                journal_entry_id: entry.id,
                timeline_id: options.suggestedLocation.id,
                importance_score: 0.7,
                metadata: { from_photo: true }
              })
              .catch(err => logger.debug({ error: err }, 'Failed to add timeline membership'));
          }
        }

        return {
          entryId: entry.id,
          photoStored: true
        };
      }

      return {};
    } catch (error) {
      logger.error({ error, filename }, 'Failed to process photo');
      throw error;
    }
  }
}

export const photoAnalysisService = new PhotoAnalysisService();
