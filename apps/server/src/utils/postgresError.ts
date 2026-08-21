/**
 * Classify Postgres / PostgREST / Supabase errors for cost-aware handling.
 *
 * Spend Cap (Pro) and disk/database quotas put the project in read-only or
 * paused mode. Callers should surface notices instead of generic 500s.
 * Compute size and preview branches are billed outside Spend Cap.
 */

import { AppError } from '../middleware/appError';
import { noteDatabaseWriteBlocked } from '../services/databaseStorageProbe';

export type PostgresErrorKind =
  | 'read_only'
  | 'disk_full'
  | 'transient'
  | 'schema'
  | 'unknown';

export type ClassifiedPostgresError = {
  kind: PostgresErrorKind;
  code?: string;
  message: string;
  userMessage: string;
  httpStatus: number;
  retryable: boolean;
};

const READ_ONLY_SQLSTATE = new Set(['25006', '42501']);
const DISK_FULL_SQLSTATE = new Set(['53100', '53200', '53400']);
const TRANSIENT_SQLSTATE = new Set([
  '08000',
  '08003',
  '08006',
  '08001',
  '57P01',
  '57P03',
  '40001',
  '40P01',
  '55P03',
]);
const SCHEMA_SQLSTATE = new Set(['42P01', '42703', 'PGRST205']);

const READ_ONLY_PATTERNS: readonly RegExp[] = [
  /read[- ]only transaction/i,
  /cannot execute .+ in a read-only transaction/i,
  /default_transaction_read_only/i,
  /database is in read-only mode/i,
  /spend cap/i,
  /project (?:is )?paused/i,
  /over the allocated disk size/i,
];

const DISK_FULL_PATTERNS: readonly RegExp[] = [
  /could not extend file/i,
  /no space left on device/i,
  /disk full/i,
  /storage quota/i,
  /exceeded.*(disk|storage|database).*?(limit|quota|size)/i,
];

export const READ_ONLY_USER_MESSAGE =
  'LoreBook cannot save right now because the database is in read-only mode. This usually means a Supabase spend cap or usage quota was reached. You can still read existing memories. New chats, journal entries, and uploads will fail until the next billing cycle or the cap is raised in Supabase.';

export const DISK_FULL_USER_MESSAGE =
  'LoreBook cannot save because database disk is full. If Spend Cap is on, writes stay blocked until the next billing cycle. Otherwise free space or expand disk in Supabase.';

export type StorageBlockedNotice = {
  code: string;
  message: string;
  writesAvailable: false;
};

export function storageBlockedNotice(classified: ClassifiedPostgresError): StorageBlockedNotice {
  return {
    code: postgresErrorCode(classified.kind),
    message: classified.userMessage,
    writesAvailable: false,
  };
}

const TRANSIENT_PATTERNS: readonly RegExp[] = [
  /connection (?:terminated|reset|refused|timeout)/i,
  /timeout/i,
  /too many connections/i,
  /deadlock detected/i,
  /could not serialize access/i,
];

const SCHEMA_PATTERNS: readonly RegExp[] = [
  /relation .+ does not exist/i,
  /column .+ does not exist/i,
  /PGRST205/i,
  /schema cache/i,
];

type ErrorFields = {
  code?: string;
  message: string;
  httpStatus?: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

/** O(1) field extraction — no string scans until classification. */
export function extractPostgresErrorFields(err: unknown): ErrorFields {
  if (err instanceof Error) {
    const rec = asRecord(err);
    const code =
      (typeof rec?.code === 'string' ? rec.code : undefined) ??
      (typeof rec?.statusCode === 'string' ? rec.statusCode : undefined);
    const httpStatus =
      typeof rec?.status === 'number'
        ? rec.status
        : typeof rec?.statusCode === 'number'
          ? rec.statusCode
          : undefined;
    return { code, message: err.message || String(err), ...(httpStatus != null ? { httpStatus } : {}) };
  }

  const rec = asRecord(err);
  if (!rec) return { message: String(err ?? 'Unknown database error') };

  const code =
    (typeof rec.code === 'string' ? rec.code : undefined) ??
    (typeof rec.error_code === 'string' ? rec.error_code : undefined);

  const httpStatus =
    typeof rec.status === 'number'
      ? rec.status
      : typeof rec.statusCode === 'number'
        ? rec.statusCode
        : undefined;

  const message =
    (typeof rec.message === 'string' ? rec.message : undefined) ??
    (typeof rec.error === 'string' ? rec.error : undefined) ??
    (typeof rec.details === 'string' ? rec.details : undefined) ??
    String(err);

  return { code, message, ...(httpStatus != null ? { httpStatus } : {}) };
}

function matchesAny(message: string, patterns: readonly RegExp[]): boolean {
  for (let i = 0; i < patterns.length; i += 1) {
    if (patterns[i].test(message)) return true;
  }
  return false;
}

export function classifyPostgresError(err: unknown): ClassifiedPostgresError {
  const { code, message, httpStatus } = extractPostgresErrorFields(err);
  const normalizedCode = code?.toUpperCase();

  if (
    httpStatus === 507 ||
    (normalizedCode && READ_ONLY_SQLSTATE.has(normalizedCode)) ||
    matchesAny(message, READ_ONLY_PATTERNS)
  ) {
    return {
      kind: 'read_only',
      code: normalizedCode,
      message,
      userMessage: READ_ONLY_USER_MESSAGE,
      httpStatus: 507,
      retryable: false,
    };
  }

  if (
    (normalizedCode && DISK_FULL_SQLSTATE.has(normalizedCode)) ||
    matchesAny(message, DISK_FULL_PATTERNS)
  ) {
    return {
      kind: 'disk_full',
      code: normalizedCode,
      message,
      userMessage: DISK_FULL_USER_MESSAGE,
      httpStatus: 507,
      retryable: false,
    };
  }

  if (
    (normalizedCode && SCHEMA_SQLSTATE.has(normalizedCode)) ||
    matchesAny(message, SCHEMA_PATTERNS)
  ) {
    return {
      kind: 'schema',
      code: normalizedCode,
      message,
      userMessage: 'Database schema is out of date. Run migrations and try again.',
      httpStatus: 503,
      retryable: false,
    };
  }

  if (
    (normalizedCode && TRANSIENT_SQLSTATE.has(normalizedCode)) ||
    matchesAny(message, TRANSIENT_PATTERNS)
  ) {
    return {
      kind: 'transient',
      code: normalizedCode,
      message,
      userMessage: 'Database is temporarily unavailable. Please try again in a moment.',
      httpStatus: 503,
      retryable: true,
    };
  }

  return {
    kind: 'unknown',
    code: normalizedCode,
    message,
    userMessage: 'Something went wrong while saving. Please try again.',
    httpStatus: 500,
    retryable: false,
  };
}

export function isPostgresReadOnly(err: unknown): boolean {
  return classifyPostgresError(err).kind === 'read_only';
}

export function isPostgresDiskFull(err: unknown): boolean {
  const kind = classifyPostgresError(err).kind;
  return kind === 'disk_full' || kind === 'read_only';
}

export function isTransientPostgresError(err: unknown): boolean {
  return classifyPostgresError(err).kind === 'transient';
}

/** Map a classified error to an API envelope code for the web client. */
export function postgresErrorCode(kind: PostgresErrorKind): string {
  switch (kind) {
    case 'read_only':
      return 'DB_READ_ONLY';
    case 'disk_full':
      return 'DB_STORAGE_FULL';
    case 'schema':
      return 'DB_SCHEMA_INCOMPLETE';
    case 'transient':
      return 'DB_TRANSIENT';
    default:
      return 'DB_ERROR';
  }
}

export class StorageBlockedError extends AppError {
  readonly postgresKind: PostgresErrorKind;
  readonly apiCode: string;
  readonly notice: StorageBlockedNotice;

  constructor(classified: ClassifiedPostgresError) {
    super(classified.httpStatus, classified.userMessage);
    this.postgresKind = classified.kind;
    this.apiCode = postgresErrorCode(classified.kind);
    this.notice = storageBlockedNotice(classified);
    if (classified.kind === 'read_only' || classified.kind === 'disk_full') {
      noteDatabaseWriteBlocked(classified.kind);
    }
  }
}

export function isStorageBlockedKind(kind: PostgresErrorKind): boolean {
  return kind === 'read_only' || kind === 'disk_full';
}

/** Throw StorageBlockedError for quota/read-only failures; return classification otherwise. */
export function throwIfStorageBlocked(err: unknown): ClassifiedPostgresError {
  const classified = classifyPostgresError(err);
  if (classified.kind === 'read_only' || classified.kind === 'disk_full') {
    throw new StorageBlockedError(classified);
  }
  return classified;
}
