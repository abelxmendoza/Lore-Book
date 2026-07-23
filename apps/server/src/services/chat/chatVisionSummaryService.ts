/**
 * Generate a text vision summary of chat-attached images for memory ingestion.
 * Runs off the chat critical path so streaming replies are not blocked.
 *
 * Handles life photos plus screenshots of DMs, Instagram/Twitter stories & posts,
 * and other social/media captures that support lore.
 */
import { config } from '../../config';
import { openai } from '../../lib/openai';
import { extractResponseText } from '../../lib/openaiResponsesBridge';
import { logger } from '../../logger';
import type { ChatImageAttachment, ChatImageDetail } from './chatImageInput';

export type VisionMediaKind =
  | 'photo'
  | 'message_thread'
  | 'social_story'
  | 'social_post'
  | 'screenshot_other';

export type VisionSummaryResult = {
  summary: string;
  perImage: string[];
  people?: string[];
  places?: string[];
  objects?: string[];
  textInImage?: string[];
  mediaKinds?: VisionMediaKind[];
  platforms?: string[];
  /** Readable chat / caption / on-screen dialogue extracted from screenshots. */
  transcripts?: string[];
};

const SUMMARY_INSTRUCTIONS = `You analyze personal life media for an autobiographical memory system (LoreBook).
Images may be ordinary photos OR screenshots of DMs, group chats, Instagram/Twitter/X/TikTok/Snapchat stories or posts, Stories replies, notifications, or other social/UI captures.

Describe what is visible clearly and factually so later memory extraction can run on text alone.

Return JSON only:
{
  "summary": "2-5 sentence overall description of the media together — what happened / what was said / what was posted",
  "perImage": ["one short description per image, in order"],
  "mediaKinds": ["photo|message_thread|social_story|social_post|screenshot_other per image, same order"],
  "platforms": ["instagram|twitter|x|imessage|whatsapp|sms|tiktok|snapchat|facebook|other when identifiable"],
  "people": ["names or @handles if readable, else roles like 'friend' / 'coworker'"],
  "places": ["locations if visible or strongly implied"],
  "objects": ["notable objects/activities"],
  "textInImage": ["short UI labels, captions, stickers, hashtags worth remembering"],
  "transcripts": ["for message threads or story/post text: chronological readable dialogue or caption text; one entry per image that has readable conversation/caption content"]
}

Rules:
- Prefer extracting readable text accurately over inventing context.
- For DMs/chats: preserve speaker turns when sides are visible (Me vs other). Quote message lines in order.
- For Stories / posts: capture the caption, sticker text, poll/question text, and who posted when shown.
- When a known cast / conversation focus is provided, resolve people and places to those names when the image supports it (do not force a match).
- Relate the media to the ongoing conversation when the connection is clear (same people, place, or topic).
- Do not invent life events, names, or messages beyond what the image supports.
- Prefer concrete visual + textual details (who/what/where/said) over mood fluff.
- If multiple images clearly continue one thread or story, say so in summary and keep per-image order.
- If an image is unreadable, note that briefly instead of guessing.`;

export type VisionLoreContextHint = {
  cast?: Array<{ name: string; type: string }>;
  focus?: { name: string; type: string };
  recentTurns?: Array<{ role: string; content: string }>;
};

function formatLoreContextHint(hint?: VisionLoreContextHint): string {
  if (!hint) return '';
  const parts: string[] = [];
  if (hint.cast?.length) {
    parts.push(
      `Known cast in this conversation: ${hint.cast
        .slice(0, 12)
        .map((c) => `${c.name} (${c.type})`)
        .join(', ')}`,
    );
  }
  if (hint.focus?.name) {
    parts.push(`Conversation focus: ${hint.focus.name} (${hint.focus.type})`);
  }
  if (hint.recentTurns?.length) {
    parts.push(
      `Recent turns:\n${hint.recentTurns
        .slice(-4)
        .map((t) => `${t.role}: ${t.content.slice(0, 180)}`)
        .join('\n')}`,
    );
  }
  if (!parts.length) return '';
  return `\n\nLore context (use to place this media in the user's story when supported by the image):\n${parts.join('\n')}`;
}

function imageUrlForModel(img: ChatImageAttachment & { url?: string }): string {
  // Prefer data URL when present (same-request); fall back to durable public URL.
  if (img.dataUrl?.startsWith('data:')) return img.dataUrl;
  if (img.url) return img.url;
  return img.dataUrl ?? '';
}

const MEDIA_KINDS = new Set<VisionMediaKind>([
  'photo',
  'message_thread',
  'social_story',
  'social_post',
  'screenshot_other',
]);

/**
 * Produce a structured vision summary for one or more chat attachments.
 */
export async function summarizeChatImages(
  images: Array<ChatImageAttachment & { url?: string }>,
  options?: { userId?: string; caption?: string; loreContext?: VisionLoreContextHint },
): Promise<VisionSummaryResult | null> {
  if (!images.length) return null;

  const caption = options?.caption?.trim();
  const loreHint = formatLoreContextHint(options?.loreContext);
  const contentParts: Array<
    | { type: 'input_text'; text: string }
    | { type: 'input_image'; image_url: string; detail: ChatImageDetail }
  > = [
    {
      type: 'input_text',
      text: `${
        caption
          ? `User caption/message: ${caption}\n\nDescribe the attached media for memory extraction. Extract any readable DM/story/post text.`
          : 'Describe the attached media for memory extraction. Extract any readable DM/story/post text.'
      } Place people/places in the conversation's cast and story when the image supports it.${loreHint}`,
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
  // More headroom when several screenshots include dense chat text.
  const maxOutputTokens = Math.min(2400, 700 + images.length * 220);

  try {
    const response = await openai.responses.create({
      model,
      store: false,
      instructions: SUMMARY_INSTRUCTIONS,
      input: [{ role: 'user', content: contentParts }],
      text: { format: { type: 'json_object' } },
      max_output_tokens: maxOutputTokens,
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
      return { summary: raw.trim().slice(0, 4000), perImage: [] };
    }

    const summary =
      typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim()
        : raw.trim().slice(0, 4000);

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
      mediaKinds: asMediaKinds(parsed.mediaKinds),
      platforms: asStringArray(parsed.platforms),
      transcripts: asStringArray(parsed.transcripts),
    };
  } catch (err) {
    logger.warn({ err, userId: options?.userId }, 'chat vision summary failed');
    return null;
  }
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .map((s) => s.trim());
  return out.length ? out : undefined;
}

function asMediaKinds(value: unknown): VisionMediaKind[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is VisionMediaKind => MEDIA_KINDS.has(s as VisionMediaKind));
  return out.length ? out : undefined;
}

/** Merge user caption + vision summary into ingestible plain text. */
export function buildIngestTextFromVision(
  caption: string,
  vision: VisionSummaryResult | null | undefined,
  loreContextBlock?: string | null,
): string {
  const cap = (caption ?? '').trim();
  if (!vision?.summary && !loreContextBlock?.trim()) return cap;

  const parts: string[] = [];
  if (cap && cap !== '[Image attached]' && !/^\[\d+ images attached\]$/.test(cap)) {
    parts.push(cap);
  }
  if (loreContextBlock?.trim()) {
    parts.push(loreContextBlock.trim());
  }
  if (vision?.summary) {
    parts.push(`[Photo description]: ${vision.summary}`);
  }
  if (!vision) {
    return parts.join('\n\n');
  }

  if ((vision.perImage?.length ?? 0) > 1) {
    parts.push(
      vision.perImage.map((d, i) => `[Photo ${i + 1}]: ${d}`).join('\n'),
    );
  }

  if (vision.transcripts?.length) {
    parts.push(
      vision.transcripts.length === 1
        ? `[Extracted text / conversation]:\n${vision.transcripts[0]}`
        : vision.transcripts
            .map((t, i) => `[Extracted text / conversation ${i + 1}]:\n${t}`)
            .join('\n\n'),
    );
  }

  const entities: string[] = [];
  if (vision.mediaKinds?.length) {
    entities.push(`Media kinds: ${vision.mediaKinds.join(', ')}`);
  }
  if (vision.platforms?.length) {
    entities.push(`Platforms: ${vision.platforms.join(', ')}`);
  }
  if (vision.people?.length) entities.push(`People: ${vision.people.join(', ')}`);
  if (vision.places?.length) entities.push(`Places: ${vision.places.join(', ')}`);
  if (vision.objects?.length) entities.push(`Objects: ${vision.objects.join(', ')}`);
  if (vision.textInImage?.length) entities.push(`Text in image: ${vision.textInImage.join('; ')}`);
  if (entities.length) parts.push(entities.join('\n'));

  return parts.join('\n\n');
}
