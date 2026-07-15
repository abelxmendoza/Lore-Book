import { z } from 'zod';

/** Canonical success envelope for REST JSON responses. */
export const apiSuccessEnvelopeSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    success: z.literal(true),
    data,
    meta: z.record(z.string(), z.unknown()).optional(),
  });

/** Canonical error envelope for REST + pre-stream chat failures. */
export const apiErrorEnvelopeSchema = z.object({
  success: z.literal(false).optional(),
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
  requestId: z.string().optional(),
  retryAfter: z.number().optional(),
  message: z.string().optional(),
  notice: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});

export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>;

/** Dual success still used by books BFF during migration. */
export const apiSuccessDualShape = z
  .object({
    success: z.literal(true),
    data: z.unknown().optional(),
  })
  .passthrough();

/**
 * Unwrap `{ success, data }` or dual `{ success, data, ...legacy }` or bare data.
 * Prefer shared package so every client uses one implementation.
 */
export function unwrapApiData<T>(res: unknown): T {
  if (res && typeof res === 'object') {
    const r = res as Record<string, unknown>;
    if ('data' in r && r.data !== undefined) return r.data as T;
  }
  return res as T;
}
