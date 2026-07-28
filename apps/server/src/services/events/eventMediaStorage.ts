/**
 * Durable flyer/photo storage for user-posted Life Log events (photos bucket).
 */

import { randomUUID } from 'crypto';

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export type EventPhotoInput = {
  dataUrl: string;
  fileName?: string | null;
};

export type StoredEventPhoto = {
  url: string;
  storagePath: string;
  photoId: string;
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

export async function storeEventPhoto(
  userId: string,
  eventId: string,
  photo: EventPhotoInput,
): Promise<StoredEventPhoto | null> {
  const parsed = parseDataUrl(photo.dataUrl);
  if (!parsed) {
    logger.warn({ userId, eventId }, 'event media: invalid data URL');
    return null;
  }

  const mimeType = parsed.contentType;
  const ext = extFromMime(mimeType);
  const photoId = randomUUID();
  const storagePath = `${userId}/events/${eventId}/${photoId}.${ext}`;

  const { error } = await supabaseAdmin.storage.from('photos').upload(storagePath, parsed.buffer, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) {
    logger.error({ error, userId, eventId, storagePath }, 'event media upload failed');
    return null;
  }

  const url = supabaseAdmin.storage.from('photos').getPublicUrl(storagePath).data.publicUrl;
  return { url, storagePath, photoId };
}

export async function storeEventPhotos(
  userId: string,
  eventId: string,
  photos: EventPhotoInput[],
): Promise<StoredEventPhoto[]> {
  const stored: StoredEventPhoto[] = [];
  for (const photo of photos.slice(0, 8)) {
    const result = await storeEventPhoto(userId, eventId, photo);
    if (result) stored.push(result);
  }
  return stored;
}
