/**
 * Chat image attachments for vision (Responses input_image / Chat Completions image_url).
 * Supports multi-image turns; client compresses before send; server stores in photos bucket.
 */
import type OpenAI from 'openai';

export type ChatImageDetail = 'low' | 'high' | 'original' | 'auto';

export type ChatImageAttachment = {
  /** data:image/...;base64,... (request body) or omit when only durable url is known */
  dataUrl?: string;
  /** Durable public URL after photos-bucket upload */
  url?: string;
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | string;
  detail?: ChatImageDetail;
};

/** Stored on chat_messages.metadata — durable refs, no raw base64. */
export type ChatAttachmentMeta = {
  kind: 'image';
  mimeType?: string;
  detail?: ChatImageDetail;
  url?: string;
  storagePath?: string;
};

export const IMAGE_ATTACHED_PLACEHOLDER = '[Image attached]';

/** ~4.5MB base64 payload cap for a single data URL in the JSON body. */
export const MAX_CHAT_IMAGE_DATA_URL_CHARS = 6_000_000;
/** Max images per chat turn (product + token budget). */
export const MAX_CHAT_IMAGES_PER_TURN = 4;

const DATA_URL_RE = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,[A-Za-z0-9+/=\s]+$/i;

export function isValidChatImageDataUrl(dataUrl: string): boolean {
  if (!dataUrl || dataUrl.length > MAX_CHAT_IMAGE_DATA_URL_CHARS) return false;
  return DATA_URL_RE.test(dataUrl.trim());
}

export function inferMimeFromDataUrl(dataUrl: string): string | undefined {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(dataUrl);
  return m?.[1]?.toLowerCase().replace('image/jpg', 'image/jpeg');
}

/** Caption for persist/ingest; placeholder when the user only attached images. */
export function resolveUserMessageText(message: string, images?: ChatImageAttachment[]): string {
  const trimmed = (message ?? '').trim();
  if (trimmed) return trimmed;
  if (images && images.length > 0) {
    return images.length === 1 ? IMAGE_ATTACHED_PLACEHOLDER : `[${images.length} images attached]`;
  }
  return '';
}

export function attachmentMetaFromImages(
  images?: Array<
    ChatImageAttachment & { storagePath?: string; url?: string }
  >,
): ChatAttachmentMeta[] | undefined {
  if (!images?.length) return undefined;
  return images.map((img) => ({
    kind: 'image' as const,
    mimeType: img.mimeType ?? (img.dataUrl ? inferMimeFromDataUrl(img.dataUrl) : undefined),
    detail: img.detail ?? 'high',
    ...(img.url ? { url: img.url } : {}),
    ...(img.storagePath ? { storagePath: img.storagePath } : {}),
  }));
}

function resolveImageUrlForModel(img: ChatImageAttachment): string | null {
  if (img.dataUrl?.startsWith('data:')) return img.dataUrl;
  if (img.url) return img.url;
  return null;
}

/**
 * Build Chat Completions multimodal content for the user turn.
 * History stays string-only; only the current turn includes image parts.
 */
export function buildUserChatContent(
  text: string,
  images?: ChatImageAttachment[],
): string | OpenAI.Chat.ChatCompletionContentPart[] {
  if (!images?.length) return text;

  const parts: OpenAI.Chat.ChatCompletionContentPart[] = [
    { type: 'text', text: text || IMAGE_ATTACHED_PLACEHOLDER },
  ];

  for (const img of images) {
    const url = resolveImageUrlForModel(img);
    if (!url) continue;
    const detail =
      img.detail === 'original'
        ? 'high' // Chat Completions only supports low|high|auto
        : img.detail === 'low' || img.detail === 'high' || img.detail === 'auto'
          ? img.detail
          : 'high';
    parts.push({
      type: 'image_url',
      image_url: {
        url,
        detail,
      },
    });
  }

  // If every image failed to resolve, fall back to text-only.
  if (parts.length === 1) return text || IMAGE_ATTACHED_PLACEHOLDER;
  return parts;
}

/** Map Chat Completions content → Responses input content (preserves input_image). */
export function chatContentToResponsesContent(
  content: OpenAI.Chat.ChatCompletionMessageParam['content'],
  options?: { preferOriginalDetail?: boolean },
): string | Array<
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail?: ChatImageDetail }
> {
  if (typeof content === 'string') return content;
  if (content == null) return '';
  if (!Array.isArray(content)) return JSON.stringify(content);

  const parts: Array<
    | { type: 'input_text'; text: string }
    | { type: 'input_image'; image_url: string; detail?: ChatImageDetail }
  > = [];

  for (const part of content) {
    if (!part || typeof part !== 'object') continue;
    if ('type' in part && part.type === 'text' && 'text' in part && typeof part.text === 'string') {
      parts.push({ type: 'input_text', text: part.text });
      continue;
    }
    if ('type' in part && part.type === 'image_url' && 'image_url' in part) {
      const imageUrl = part.image_url;
      const url =
        typeof imageUrl === 'string'
          ? imageUrl
          : imageUrl && typeof imageUrl === 'object' && 'url' in imageUrl
            ? String((imageUrl as { url: string }).url)
            : '';
      if (!url) continue;
      const rawDetail =
        typeof imageUrl === 'object' && imageUrl && 'detail' in imageUrl
          ? (imageUrl as { detail?: string }).detail
          : undefined;
      let detail: ChatImageDetail = 'high';
      if (rawDetail === 'low' || rawDetail === 'high' || rawDetail === 'auto') {
        detail = rawDetail;
      } else if (options?.preferOriginalDetail) {
        detail = 'original';
      }
      parts.push({ type: 'input_image', image_url: url, detail });
    }
  }

  if (parts.length === 0) return '';
  if (parts.length === 1 && parts[0].type === 'input_text') return parts[0].text;
  return parts;
}
