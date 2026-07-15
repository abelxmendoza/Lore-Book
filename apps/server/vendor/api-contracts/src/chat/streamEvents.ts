import { z } from 'zod';
import { chatStreamDurabilitySchema, durabilityNoticeSchema } from './durability';

/**
 * Chat SSE frames: `data: ${JSON.stringify(event)}\n\n`
 * Discriminated by `type`. Unknown types are rejected by safeParse so clients
 * can ignore bad frames without crashing.
 */

export const chatStreamMetadataEventSchema = z.object({
  type: z.literal('metadata'),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const chatStreamChunkEventSchema = z.object({
  type: z.literal('chunk'),
  content: z.string(),
});

export const chatStreamDoneEventSchema = z.object({
  type: z.literal('done'),
  usage: z.unknown().optional(),
  cost: z.unknown().optional(),
  responseCompiler: z
    .object({
      actionCandidates: z
        .array(
          z.object({
            type: z.string(),
            label: z.string(),
            confidence: z.number().optional(),
            requiresConfirmation: z.boolean().optional(),
            payload: z.record(z.string(), z.unknown()).optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  continuityCallback: z
    .object({
      entity: z.string(),
      quote: z.string(),
      priorMessageIndex: z.number(),
      calloutText: z.string(),
    })
    .optional(),
});

export const chatStreamErrorEventSchema = z.object({
  type: z.literal('error'),
  error: z.string(),
  notice: durabilityNoticeSchema.optional(),
  durability: chatStreamDurabilitySchema.optional(),
  // Structured durability fields may also appear flat on error frames
  userMessage: z.unknown().optional(),
  assistantResponse: z.unknown().optional(),
  ingestion: z.unknown().optional(),
  code: z.string().optional(),
  stage: z.string().optional(),
});

export const chatStreamEventSchema = z.discriminatedUnion('type', [
  chatStreamMetadataEventSchema,
  chatStreamChunkEventSchema,
  chatStreamDoneEventSchema,
  chatStreamErrorEventSchema,
]);

export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;
export type ChatStreamMetadataEvent = z.infer<typeof chatStreamMetadataEventSchema>;
export type ChatStreamChunkEvent = z.infer<typeof chatStreamChunkEventSchema>;
export type ChatStreamDoneEvent = z.infer<typeof chatStreamDoneEventSchema>;
export type ChatStreamErrorEvent = z.infer<typeof chatStreamErrorEventSchema>;

/** Format a validated (or intentionally constructed) event as an SSE data line. */
export function formatSseDataLine(event: ChatStreamEvent | Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Parse one SSE payload body (contents after `data: `).
 * Returns null for non-JSON or unknown event shapes (client should skip).
 */
export function parseChatStreamEvent(raw: string): ChatStreamEvent | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '[DONE]') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const result = chatStreamEventSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
