/**
 * Durable storage for chat vision attachments in the Supabase `photos` bucket.
 * Every successful upload also creates a Photo Album journal entry.
 */
import { randomUUID } from 'crypto';

import { logger } from '../../logger';
import { photoService } from '../photoService';
import { supabaseAdmin } from '../supabaseClient';
import {
  inferMimeFromDataUrl,
  type ChatImageAttachment,
  type ChatImageDetail,
} from './chatImageInput';

export type StoredChatAttachment = {
  kind: 'image';
  mimeType?: string;
  detail?: ChatImageDetail;
  /** Public URL for rehydration / display. */
  url: string;
  storagePath: string;
  photoId: string;
  journalEntryId?: string;
  /** Original data URL kept only for same-request model vision (not persisted). */
  dataUrl?: string;
};

function parseDataUrl(dataUrl: string): { contentType: string; buffer: Buffer } | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  try {
    return {
      contentType: match[1].toLowerCase().replace('image/jpg', 'image/jpeg'),
      buffer: Buffer.from(match[2].replace(/\s+/g, ''), 'base64'),
    };
  } catch {
    return null;
  }
}

function extFromMime(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
}

/**
 * Upload one chat image data URL to `photos` under
 * `{userId}/chat/{sessionId}/{uuid}.{ext}` and add it to the Photo Album.
 */
export async function storeChatImageAttachment(
  userId: string,
  sessionId: string,
  image: ChatImageAttachment,
): Promise<StoredChatAttachment | null> {
  const parsed = parseDataUrl(image.dataUrl);
  if (!parsed) {
    logger.warn({ userId, sessionId }, 'chat attachment: invalid data URL');
    return null;
  }

  const mimeType = image.mimeType ?? parsed.contentType ?? inferMimeFromDataUrl(image.dataUrl);
  const ext = extFromMime(mimeType ?? 'image/jpeg');
  const photoId = randomUUID();
  const storagePath = `${userId}/chat/${sessionId}/${photoId}.${ext}`;

  const { error } = await supabaseAdmin.storage
    .from('photos')
    .upload(storagePath, parsed.buffer, {
      contentType: mimeType ?? 'image/jpeg',
      upsert: false,
    });

  if (error) {
    logger.error({ error, userId, sessionId, storagePath }, 'chat attachment storage upload failed');
    return null;
  }

  const url = supabaseAdmin.storage.from('photos').getPublicUrl(storagePath).data.publicUrl;

  let journalEntryId: string | undefined;
  try {
    const album = await photoService.ensurePhotoAlbumEntry({
      userId,
      photoUrl: url,
      photoId,
      filename: `chat-${photoId}.${ext}`,
      source: 'chat_attachment',
      content: 'Photo shared in chat',
      tags: ['photo', 'chat'],
      metadata: {
        sessionId,
        storagePath,
        mimeType: mimeType ?? undefined,
      },
    });
    journalEntryId = album?.id;
  } catch (err) {
    logger.warn({ err, userId, photoId }, 'chat attachment album entry failed — photo still stored');
  }

  return {
    kind: 'image',
    mimeType: mimeType ?? undefined,
    detail: image.detail ?? 'high',
    url,
    storagePath,
    photoId,
    journalEntryId,
    dataUrl: image.dataUrl,
  };
}

/**
 * Upload many attachments in parallel.
 * Returns an array aligned with input (null entries when an upload fails).
 */
export async function storeChatImageAttachments(
  userId: string,
  sessionId: string,
  images: ChatImageAttachment[],
): Promise<Array<StoredChatAttachment | null>> {
  if (!images.length) return [];
  return Promise.all(images.map((img) => storeChatImageAttachment(userId, sessionId, img)));
}
