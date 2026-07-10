/**
 * Generate a text vision summary of chat-attached images for memory ingestion.
 * Runs off the chat critical path so streaming replies are not blocked.
 */
import { config } from '../../config';
import { openai } from '../../lib/openai';
import { extractResponseText } from '../../lib/openaiResponsesBridge';
import { logger } from '../../logger';
import type { ChatImageAttachment, ChatImageDetail } from './chatImageInput';

export type VisionSummaryResult = {
  summary: string;
  perImage: string[];
  people?: string[];
  places?: string[];
  objects?: string[];
  textInImage?: string[];
};

const SUMMARY_INSTRUCTIONS = `You analyze personal life photos for an autobiographical memory system (LoreBook).
Describe what is visible clearly and factually so later memory extraction can run on text alone.

Return JSON only:
{
  "summary": "2-4 sentence overall description of the photo(s) together",
  "perImage": ["one short description per image, in order"],
  "people": ["names or roles if recognizable, else omit or use generic labels"],
  "places": ["locations if visible or strongly implied"],
  "objects": ["notable objects/activities"],
  "textInImage": ["any readable text / signs / captions"]
}

Rules:
- Do not invent life events beyond what the image supports.
- Prefer concrete visual details (who/what/where/setting) over mood fluff.
- If multiple images, relate them when they clearly form one scene.`;

function imageUrlForModel(img: ChatImageAttachment & { url?: string }): string {
  // Prefer data URL when present (same-request); fall back to durable public URL.
  if (img.dataUrl?.startsWith('data:')) return img.dataUrl;
  if (img.url) return img.url;
  return img.dataUrl;
}

/**
 * Produce a structured vision summary for one or more chat attachments.
 */
export async function summarizeChatImages(
  images: Array<ChatImageAttachment & { url?: string }>,
  options?: { userId?: string; caption?: string },
): Promise<VisionSummaryResult | null> {
  if (!images.length) return null;

  const caption = options?.caption?.trim();
  const contentParts: Array<
    | { type: 'input_text'; text: string }
    | { type: 'input_image'; image_url: string; detail: ChatImageDetail }
  > = [
    {
      type: 'input_text',
      text: caption
        ? `User caption/message: ${caption}\n\nDescribe the attached photo(s) for memory extraction.`
        : 'Describe the attached photo(s) for memory extraction.',
    },
  ];

  for (const img of images) {
    const url = imageUrlForModel(img);
    if (!url) continue;
    contentParts.push({
      type: 'input_image',
      image_url: url,
      detail: (img.detail === 'low' ? 'low' : 'high') as ChatImageDetail,
    });
  }

  if (contentParts.length < 2) return null;

  const model = config.extractionModel ?? config.chatModel ?? 'gpt-4o-mini';

  try {
    const response = await openai.responses.create({
      model,
      store: false,
      instructions: SUMMARY_INSTRUCTIONS,
      input: [{ role: 'user', content: contentParts }],
      text: { format: { type: 'json_object' } },
      max_output_tokens: 800,
      ...(options?.userId ? { safety_identifier: options.userId } : {}),
    });

    const raw = extractResponseText(response);

    if (!raw?.trim()) {
      logger.warn({ userId: options?.userId }, 'chat vision summary empty');
      return null;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // Model sometimes wraps JSON in prose — treat whole raw as summary.
      return { summary: raw.trim().slice(0, 2000), perImage: [] };
    }

    const summary =
      typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim()
        : raw.trim().slice(0, 2000);

    const perImage = Array.isArray(parsed.perImage)
      ? parsed.perImage.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      : [];

    return {
      summary,
      perImage,
      people: asStringArray(parsed.people),
      places: asStringArray(parsed.places),
      objects: asStringArray(parsed.objects),
      textInImage: asStringArray(parsed.textInImage),
    };
  } catch (err) {
    logger.warn({ err, userId: options?.userId }, 'chat vision summary failed');
    return null;
  }
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim());
  return out.length ? out : undefined;
}

/** Merge user caption + vision summary into ingestible plain text. */
export function buildIngestTextFromVision(
  caption: string,
  vision: VisionSummaryResult | null | undefined,
): string {
  const cap = (caption ?? '').trim();
  if (!vision?.summary) return cap;

  const parts: string[] = [];
  if (cap && cap !== '[Image attached]') {
    parts.push(cap);
  }
  parts.push(`[Photo description]: ${vision.summary}`);

  if (vision.perImage.length > 1) {
    parts.push(
      vision.perImage.map((d, i) => `[Photo ${i + 1}]: ${d}`).join('\n'),
    );
  }

  const entities: string[] = [];
  if (vision.people?.length) entities.push(`People: ${vision.people.join(', ')}`);
  if (vision.places?.length) entities.push(`Places: ${vision.places.join(', ')}`);
  if (vision.objects?.length) entities.push(`Objects: ${vision.objects.join(', ')}`);
  if (vision.textInImage?.length) entities.push(`Text in image: ${vision.textInImage.join('; ')}`);
  if (entities.length) parts.push(entities.join('\n'));

  return parts.join('\n\n');
}
