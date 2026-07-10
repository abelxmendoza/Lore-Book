/** Client-side image attachment for a chat turn (vision). */
export type ChatImageAttachment = {
  dataUrl: string;
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  detail?: 'low' | 'high' | 'original' | 'auto';
  /** Optional local id for composer preview list. */
  id?: string;
  fileName?: string;
  /** Durable public URL after server stores to photos bucket (hydrated messages). */
  url?: string;
};

export const IMAGE_ATTACHED_PLACEHOLDER = '[Image attached]';
/** Product limit — keep in sync with server MAX_CHAT_IMAGES_PER_TURN. */
export const MAX_CHAT_IMAGES_PER_TURN = 4;

const MAX_DIM = 1400;
const JPEG_QUALITY = 0.82;
const MAX_FILE_BYTES = 12 * 1024 * 1024;

export async function compressChatImage(file: File): Promise<ChatImageAttachment> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files are supported');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Image is too large (max 12 MB before compression)');
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    if (dataUrl.length > 6_000_000) {
      throw new Error('Image is still too large after compression — try a smaller photo');
    }
    return {
      id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      dataUrl,
      mimeType: 'image/jpeg',
      detail: 'high',
      fileName: file.name,
    };
  } finally {
    bitmap.close();
  }
}

export async function compressChatImages(
  files: FileList | File[],
  existingCount = 0,
): Promise<{ images: ChatImageAttachment[]; error?: string }> {
  const list = Array.from(files);
  const room = Math.max(0, MAX_CHAT_IMAGES_PER_TURN - existingCount);
  if (room === 0) {
    return { images: [], error: `You can attach up to ${MAX_CHAT_IMAGES_PER_TURN} images per message` };
  }
  const toProcess = list.slice(0, room);
  const images: ChatImageAttachment[] = [];
  let error: string | undefined;
  for (const file of toProcess) {
    try {
      images.push(await compressChatImage(file));
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not attach image';
    }
  }
  if (list.length > room) {
    error = `Only ${MAX_CHAT_IMAGES_PER_TURN} images allowed — added ${images.length}`;
  }
  return { images, error };
}
