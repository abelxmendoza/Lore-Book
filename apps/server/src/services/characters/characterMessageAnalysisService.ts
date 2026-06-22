/**
 * Vision analysis for DM / text-message screenshots.
 * Uses Responses API with structured outputs, prompt caching, and token counting.
 */
import { z } from 'zod';

import { config } from '../../config';
import { logger } from '../../logger';
import {
  buildPromptCacheParams,
  countResponsesInputTokens,
  logPromptCacheUsage,
  MESSAGE_SCREENSHOT_STATIC_INSTRUCTIONS,
} from '../../lib/openaiPlatformOptimizations';
import { extractResponseText } from '../../lib/openaiResponsesBridge';
import { openai } from '../openaiClient';
import { supabaseAdmin } from '../supabaseClient';

export const MESSAGE_SCREENSHOT_JSON_SCHEMA = {
  name: 'message_screenshot_analysis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['platform', 'counterpartName', 'confidence', 'summary', 'extractedText', 'messages'],
    properties: {
      platform: {
        type: 'string',
        enum: ['imessage', 'instagram', 'whatsapp', 'sms', 'other'],
      },
      counterpartName: { type: 'string' },
      confidence: { type: 'number' },
      summary: { type: 'string' },
      extractedText: { type: 'string' },
      messages: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['from', 'speakerLabel', 'text', 'timestamp'],
          properties: {
            from: { type: 'string', enum: ['user', 'counterpart', 'unknown'] },
            speakerLabel: { type: 'string' },
            text: { type: 'string' },
            timestamp: { type: 'string' },
          },
        },
      },
    },
  },
} as const;

const MessageLineSchema = z.object({
  from: z.enum(['user', 'counterpart', 'unknown']),
  speakerLabel: z.string().optional(),
  text: z.string(),
  timestamp: z.string().optional(),
});

const MessageScreenshotSchema = z.object({
  platform: z.enum(['imessage', 'instagram', 'whatsapp', 'sms', 'other']).optional(),
  counterpartName: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  summary: z.string().optional(),
  extractedText: z.string().optional(),
  messages: z.array(MessageLineSchema).optional(),
});

export type ParsedMessageLine = {
  from: 'user' | 'counterpart' | 'unknown';
  speakerLabel?: string;
  text: string;
  timestamp?: string;
};

export type MessageScreenshotAnalysis = {
  platform?: string;
  counterpartName?: string;
  counterpartCharacterId?: string;
  extractedText: string;
  messages: ParsedMessageLine[];
  confidence: number;
  summary?: string;
  inputTokens?: number;
};

type AnalyzeOptions = {
  userId: string;
  characterId?: string;
  characterName?: string;
  caption?: string;
};

async function loadCharacterNames(userId: string): Promise<Array<{ id: string; name: string }>> {
  const { data } = await supabaseAdmin
    .from('characters')
    .select('id, name')
    .eq('user_id', userId)
    .neq('lifecycle_status', 'pending_deletion')
    .limit(200);
  return (data ?? []).map((r) => ({ id: r.id as string, name: r.name as string }));
}

function resolveCounterpartCharacterId(
  name: string | undefined,
  characters: Array<{ id: string; name: string }>,
  hintId?: string,
): string | undefined {
  if (hintId) return hintId;
  if (!name?.trim()) return undefined;
  const norm = (s: string) => s.trim().toLowerCase();
  const target = norm(name);
  const exact = characters.find((c) => norm(c.name) === target);
  if (exact) return exact.id;
  const partial = characters.find(
    (c) => norm(c.name).includes(target) || target.includes(norm(c.name)),
  );
  return partial?.id;
}

function buildDynamicContext(
  options: AnalyzeOptions,
  characterList: string,
): string {
  const lines: string[] = [];
  if (options.characterName) {
    lines.push(`The user says this conversation is with "${options.characterName}".`);
  } else {
    lines.push(
      "Infer the other person in the conversation from the screenshot and the user's known characters.",
    );
  }
  if (options.caption?.trim()) {
    lines.push(`User note: ${options.caption.trim()}`);
  }
  lines.push(`Known characters in the user's lore book: ${characterList || '(none yet)'}`);
  return lines.join('\n');
}

function parseAnalysisPayload(raw: string): z.infer<typeof MessageScreenshotSchema> | null {
  try {
    return MessageScreenshotSchema.parse(JSON.parse(raw));
  } catch (parseErr) {
    logger.warn({ parseErr, raw: raw.slice(0, 200) }, 'message screenshot schema validation failed');
    return null;
  }
}

function toAnalysisResult(
  parsed: z.infer<typeof MessageScreenshotSchema>,
  options: AnalyzeOptions,
  characters: Array<{ id: string; name: string }>,
  inputTokens?: number,
): MessageScreenshotAnalysis {
  const messages: ParsedMessageLine[] = (parsed.messages ?? [])
    .map((m) => ({
      from: m.from,
      speakerLabel: m.speakerLabel?.trim() || undefined,
      text: m.text.trim(),
      timestamp: m.timestamp?.trim() || undefined,
    }))
    .filter((m) => m.text.length > 0);

  const extractedText =
    parsed.extractedText?.trim() ||
    messages.map((m) => `${m.speakerLabel ?? m.from}: ${m.text}`).join('\n');

  const counterpartCharacterId = resolveCounterpartCharacterId(
    parsed.counterpartName ?? options.characterName,
    characters,
    options.characterId,
  );

  return {
    platform: parsed.platform,
    counterpartName: parsed.counterpartName?.trim() || options.characterName,
    counterpartCharacterId,
    extractedText,
    messages,
    confidence: parsed.confidence ?? 0.7,
    summary: parsed.summary?.trim() || undefined,
    inputTokens,
  };
}

function emptyAnalysis(options: AnalyzeOptions, summary?: string): MessageScreenshotAnalysis {
  return {
    extractedText: '',
    messages: [],
    confidence: 0,
    counterpartCharacterId: options.characterId,
    counterpartName: options.characterName,
    summary,
  };
}

export const characterMessageAnalysisService = {
  async analyzeScreenshot(
    imageBuffer: Buffer,
    filename: string,
    options: AnalyzeOptions,
  ): Promise<MessageScreenshotAnalysis> {
    const mimeType = filename.toLowerCase().endsWith('.png')
      ? 'image/png'
      : filename.toLowerCase().endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';

    const characters = await loadCharacterNames(options.userId);
    const characterList = characters.map((c) => c.name).join(', ');
    const dynamicContext = buildDynamicContext(options, characterList);
    const model = config.extractionModel ?? 'gpt-4o-mini';
    const imageDataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

    const responsesParams = {
      model,
      store: false,
      instructions: MESSAGE_SCREENSHOT_STATIC_INSTRUCTIONS,
      input: [
        {
          role: 'user' as const,
          content: [
            {
              type: 'input_text' as const,
              text: `${dynamicContext}\n\nExtract the conversation from this screenshot.`,
            },
            {
              type: 'input_image' as const,
              image_url: imageDataUrl,
              detail: 'high' as const,
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema' as const,
          name: MESSAGE_SCREENSHOT_JSON_SCHEMA.name,
          strict: MESSAGE_SCREENSHOT_JSON_SCHEMA.strict,
          schema: MESSAGE_SCREENSHOT_JSON_SCHEMA.schema,
        },
      },
      max_output_tokens: 4096,
      ...(options.userId ? { safety_identifier: options.userId } : {}),
      ...buildPromptCacheParams('message-screenshot-analysis-v1'),
    };

    try {
      const inputTokens = await countResponsesInputTokens(responsesParams);
      if (inputTokens != null) {
        logger.debug({ inputTokens, model, filename }, 'message screenshot token count');
      }

      const response = await openai.responses.create(responsesParams);
      logPromptCacheUsage(response.usage, { service: 'message_screenshot_analysis', model });

      const raw = extractResponseText(response);
      if (!raw) {
        return emptyAnalysis(options, 'Vision model returned empty response');
      }

      const parsed = parseAnalysisPayload(raw);
      if (!parsed) return emptyAnalysis(options);

      return toAnalysisResult(parsed, options, characters, inputTokens ?? response.usage?.input_tokens);
    } catch (err) {
      logger.warn({ err, filename }, 'message screenshot analysis failed');
      return emptyAnalysis(options);
    }
  },
};
