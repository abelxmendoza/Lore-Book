import { z } from 'zod';

/** Subset of ingestion statuses the wire may emit (stringly for forward-compat). */
export const chatStreamIngestionStatusSchema = z.string();

export const chatStreamDurabilitySchema = z.object({
  userMessage: z
    .object({
      id: z.string().optional(),
      persisted: z.boolean().optional(),
      sessionId: z.string().optional(),
      idempotencyKey: z.string().optional(),
      reused: z.boolean().optional(),
    })
    .optional(),
  assistantResponse: z
    .object({
      status: z.string().optional(),
      messageId: z.string().optional(),
      errorCategory: z.string().optional(),
    })
    .optional(),
  ingestion: z
    .object({
      jobId: z.string().optional(),
      status: chatStreamIngestionStatusSchema.optional(),
      currentStage: z.string().optional(),
      retryable: z.boolean().optional(),
      nextRetryAt: z.string().optional(),
      attemptCount: z.number().optional(),
      recoveryRequired: z.boolean().optional(),
    })
    .optional(),
});

export type ChatStreamDurability = z.infer<typeof chatStreamDurabilitySchema>;

export const durabilityNoticeSchema = z.object({
  code: z.string(),
  message: z.string(),
});
