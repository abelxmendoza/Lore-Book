import type { Response } from 'express';

export type ApiSuccessEnvelope<T> = {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiErrorEnvelope = {
  success: false;
  error: string;
  code?: string;
  details?: unknown;
};

export function sendSuccess<T>(
  res: Response,
  data: T,
  opts?: { status?: number; meta?: Record<string, unknown> }
): void {
  const body: ApiSuccessEnvelope<T> = { success: true, data };
  if (opts?.meta) body.meta = opts.meta;
  res.status(opts?.status ?? 200).json(body);
}

export function sendError(
  res: Response,
  error: string,
  opts?: { status?: number; code?: string; details?: unknown }
): void {
  const body: ApiErrorEnvelope = { success: false, error };
  if (opts?.code) body.code = opts.code;
  if (opts?.details !== undefined) body.details = opts.details;
  res.status(opts?.status ?? 500).json(body);
}

/** Dual-write: canonical envelope + legacy top-level keys for gradual migration. */
export function sendSuccessDual<T extends Record<string, unknown>>(
  res: Response,
  data: T,
  opts?: { status?: number; meta?: Record<string, unknown> }
): void {
  res.status(opts?.status ?? 200).json({
    success: true,
    data,
    ...data,
    ...(opts?.meta ? { meta: opts.meta } : {}),
  });
}
