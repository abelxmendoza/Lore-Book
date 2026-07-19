/**
 * Persist character message screenshots + archive row in text_message_uploads.
 */
import { randomUUID } from 'crypto';

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { characterMessageAnalysisService } from './characterMessageAnalysisService';
import type { MessageScreenshotAnalysis } from './characterMessageAnalysisService';
import {
  persistPipelineSummary,
  runMessageScreenshotPipeline,
} from './messageScreenshotPipelineService';

type SaveMessageMediaInput = {
  userId: string;
  characterId: string;
  characterName?: string;
  dataUrl?: string;
  text?: string;
  caption?: string;
  source?: string;
  analyzeImage?: boolean;
};

export type SavedCharacterMessageMedia = {
  id: string;
  character_id: string;
  kind: 'message';
  url: string | null;
  text: string | null;
  caption: string | null;
  source: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  uploadArchiveId?: string;
};

async function uploadImageDataUrl(
  userId: string,
  characterId: string,
  dataUrl: string,
): Promise<{ url: string; storage_path: string } | null> {
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const contentType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const storage_path = `${userId}/characters/${characterId}/messages/${randomUUID()}.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from('photos')
    .upload(storage_path, buffer, { contentType, upsert: false });
  if (error) {
    logger.error({ error, characterId }, 'message screenshot storage upload failed');
    return null;
  }
  const url = supabaseAdmin.storage.from('photos').getPublicUrl(storage_path).data.publicUrl;
  return { url, storage_path };
}

export const characterMessageMediaService = {
  async saveMessageMedia(input: SaveMessageMediaInput): Promise<SavedCharacterMessageMedia | null> {
    const { userId, characterId, characterName, caption, source } = input;
    let text = input.text?.trim() ?? null;
    let url: string | null = null;
    let storage_path: string | null = null;
    let analysisMeta: Record<string, unknown> = {};
    let analysisResult: MessageScreenshotAnalysis | undefined;
    let platform: string | null = null;
    let counterpartName: string | null = characterName ?? null;

    if (input.dataUrl) {
      const uploaded = await uploadImageDataUrl(userId, characterId, input.dataUrl);
      if (!uploaded) return null;
      url = uploaded.url;
      storage_path = uploaded.storage_path;

      // Message screenshots are durable photos — include them in the Photo Album.
      try {
        const { photoService } = await import('../photoService');
        const photoId =
          storage_path.split('/').pop()?.replace(/\.[^.]+$/, '') || randomUUID();
        await photoService.ensurePhotoAlbumEntry({
          userId,
          photoUrl: url,
          photoId,
          filename: storage_path.split('/').pop(),
          source: 'message_screenshot',
          content: caption?.trim() || `Message screenshot${characterName ? ` with ${characterName}` : ''}`,
          tags: ['photo', 'message', 'screenshot'],
          metadata: {
            characterId,
            characterName,
            storagePath: storage_path,
          },
        });
      } catch (albumErr) {
        logger.warn({ albumErr, characterId }, 'message screenshot album entry failed — media still saved');
      }

      if (input.analyzeImage !== false) {
        const b64Match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(input.dataUrl);
        if (b64Match) {
          const buffer = Buffer.from(b64Match[2], 'base64');
          const analysis = await characterMessageAnalysisService.analyzeScreenshot(
            buffer,
            'screenshot.jpg',
            { userId, characterId, characterName, caption },
          );
          analysisResult = analysis;
          analysisMeta = { analysis };
          platform = analysis.platform ?? null;
          counterpartName = analysis.counterpartName ?? counterpartName;
          if (!text && analysis.extractedText) text = analysis.extractedText;
        }
      }
    }

    if (!url && !text) return null;

    const resolvedSource = source ?? (url ? 'screenshot' : 'manual');

    const { data: mediaRow, error } = await supabaseAdmin
      .from('character_media')
      .insert({
        user_id: userId,
        character_id: characterId,
        kind: 'message',
        url,
        storage_path,
        text,
        caption: caption ?? null,
        source: resolvedSource,
        metadata: {
          ...analysisMeta,
          platform,
          counterpartName,
        },
      })
      .select('id, character_id, kind, url, text, caption, source, metadata, created_at')
      .single();

    if (error || !mediaRow) {
      logger.error({ error, characterId }, 'insert character message media failed');
      return null;
    }

    const { data: archive, error: archiveErr } = await supabaseAdmin
      .from('text_message_uploads')
      .insert({
        user_id: userId,
        character_id: characterId,
        character_media_id: mediaRow.id,
        storage_path,
        public_url: url,
        extracted_text: text,
        platform,
        counterpart_name: counterpartName,
        analysis: analysisMeta,
        source: resolvedSource,
      })
      .select('id')
      .single();

    if (archiveErr) {
      logger.warn({ archiveErr, characterId }, 'text_message_uploads archive insert failed');
    }

    if (text && text.trim().length >= 12) {
      try {
        const pipeline = await runMessageScreenshotPipeline({
          userId,
          characterId,
          characterName,
          mediaId: mediaRow.id as string,
          extractedText: text,
          analysis: analysisResult,
          caption,
        });
        if (pipeline) {
          const baseMetadata = {
            ...analysisMeta,
            platform,
            counterpartName,
          };
          await persistPipelineSummary(
            userId,
            mediaRow.id as string,
            archive?.id as string | undefined,
            pipeline,
            baseMetadata,
          );
          analysisMeta = { ...baseMetadata, pipeline };
        }
      } catch (pipeErr) {
        logger.warn({ pipeErr, characterId, mediaId: mediaRow.id }, 'message screenshot pipeline failed');
      }
    }

    return {
      ...(mediaRow as SavedCharacterMessageMedia),
      metadata: analysisMeta,
      uploadArchiveId: archive?.id as string | undefined,
    };
  },

  async resolveCharacterForUpload(
    userId: string,
    hintCharacterId?: string,
    hintName?: string,
  ): Promise<{ id: string; name: string } | null> {
    if (hintCharacterId) {
      const { data } = await supabaseAdmin
        .from('characters')
        .select('id, name')
        .eq('user_id', userId)
        .eq('id', hintCharacterId)
        .maybeSingle();
      if (data) return { id: data.id as string, name: data.name as string };
    }
    if (hintName?.trim()) {
      const { data } = await supabaseAdmin
        .from('characters')
        .select('id, name')
        .eq('user_id', userId)
        .ilike('name', hintName.trim())
        .limit(1)
        .maybeSingle();
      if (data) return { id: data.id as string, name: data.name as string };
    }
    return null;
  },
};
