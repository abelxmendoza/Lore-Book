/**
 * Client-side mapping for Postgres storage / read-only errors from the API.
 */

export type ApiPostgresErrorCode =
  | 'DB_READ_ONLY'
  | 'DB_STORAGE_FULL'
  | 'DB_SCHEMA_INCOMPLETE'
  | 'DB_TRANSIENT'
  | 'DB_ERROR';

const STORAGE_CODES = new Set<ApiPostgresErrorCode>(['DB_READ_ONLY', 'DB_STORAGE_FULL']);

export function extractApiErrorCode(err: unknown): ApiPostgresErrorCode | undefined {
  if (typeof err === 'string') {
    return messageToCode(err);
  }
  if (err && typeof err === 'object') {
    const rec = err as Record<string, unknown>;
    if (typeof rec.code === 'string') {
      return rec.code as ApiPostgresErrorCode;
    }
    const message =
      (typeof rec.error === 'string' ? rec.error : undefined) ??
      (typeof rec.message === 'string' ? rec.message : undefined);
    if (message) return messageToCode(message);
  }
  return undefined;
}

function messageToCode(message: string): ApiPostgresErrorCode | undefined {
  const lower = message.toLowerCase();
  if (lower.includes('read-only') || lower.includes('read only')) return 'DB_READ_ONLY';
  if (lower.includes('storage is full') || lower.includes('disk') || lower.includes('quota')) {
    return 'DB_STORAGE_FULL';
  }
  if (lower.includes('schema is out of date') || lower.includes('schema incomplete')) {
    return 'DB_SCHEMA_INCOMPLETE';
  }
  if (lower.includes('temporarily unavailable')) return 'DB_TRANSIENT';
  return undefined;
}

export function friendlyPostgresErrorMessage(err: unknown): string | null {
  const code = extractApiErrorCode(err);
  if (code && STORAGE_CODES.has(code)) {
    if (code === 'DB_READ_ONLY') {
      return 'LoreBook storage is full and your database is in read-only mode. Delete old data or upgrade your Supabase plan, then try again.';
    }
    return 'LoreBook could not save because database storage is full. Free up space in Supabase, then try again.';
  }

  const message =
    typeof err === 'string'
      ? err
      : err && typeof err === 'object'
        ? ((err as Record<string, unknown>).userMessage as string | undefined) ??
          ((err as Record<string, unknown>).error as string | undefined) ??
          ((err as Record<string, unknown>).message as string | undefined)
        : undefined;

  if (!message) return null;
  const codeFromMessage = messageToCode(message);
  if (codeFromMessage && STORAGE_CODES.has(codeFromMessage)) {
    return friendlyPostgresErrorMessage({ code: codeFromMessage });
  }
  return null;
}

export function enrichFriendlyErrorMessage(errMsg: string): string {
  return friendlyPostgresErrorMessage(errMsg) ?? errMsg;
}
