/**
 * Ingestion job state machine + failure classification.
 *
 * Explicit transitions for autobiographical durability. Jobs are effectively-once
 * via idempotency keys and upserts; this module never claims exactly-once execution.
 */

export const INGESTION_STATUSES = [
  'RECEIVED',
  'PERSISTED',
  /** Message saved but durable job write failed — must not claim QUEUED. */
  'PERSISTED_UNQUEUED',
  /** Explicitly discoverable by recovery scanner (alias of recovery-needed states). */
  'RECOVERY_REQUIRED',
  'QUEUED',
  'PROCESSING',
  'PARTIAL',
  'COMPLETED',
  'RETRYABLE_FAILED',
  'PERMANENT_FAILED',
  'CANCELLED',
] as const;

export type IngestionJobStatus = (typeof INGESTION_STATUSES)[number];

/** Wire statuses used in DB today (lowercase) map into the explicit machine. */
export type LegacyJobStatus = 'pending' | 'processing' | 'dead' | 'completed';

export const INGESTION_STAGES = [
  'RAW_MESSAGE_PERSISTED',
  'MENTIONS_EXTRACTED',
  'ENTITIES_RESOLVED',
  'EPISODE_CREATED',
  'EVENTS_CREATED',
  'CLAIMS_CREATED',
  'RELATIONSHIPS_CREATED',
  'EMBEDDINGS_UPDATED',
  'DERIVED_ENGINES_RUN',
  'CACHES_INVALIDATED',
  'COMPLETED',
] as const;

export type IngestionStage = (typeof INGESTION_STAGES)[number];

export type FailureCategory =
  | 'rate_limit'
  | 'quota_exhausted'
  | 'timeout'
  | 'provider_5xx'
  | 'database_transient'
  | 'database_constraint'
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'ontology_conflict'
  | 'permanent_input_error'
  | 'unknown';

const VALID_TRANSITIONS: Record<IngestionJobStatus, readonly IngestionJobStatus[]> = {
  RECEIVED: ['PERSISTED', 'PERSISTED_UNQUEUED', 'RECOVERY_REQUIRED', 'QUEUED', 'PERMANENT_FAILED', 'CANCELLED'],
  PERSISTED: ['QUEUED', 'PERSISTED_UNQUEUED', 'RECOVERY_REQUIRED', 'PERMANENT_FAILED', 'CANCELLED'],
  PERSISTED_UNQUEUED: ['RECOVERY_REQUIRED', 'QUEUED', 'PERMANENT_FAILED', 'CANCELLED'],
  RECOVERY_REQUIRED: ['QUEUED', 'PERMANENT_FAILED', 'CANCELLED'],
  QUEUED: ['PROCESSING', 'CANCELLED', 'RETRYABLE_FAILED'],
  PROCESSING: ['PARTIAL', 'COMPLETED', 'RETRYABLE_FAILED', 'PERMANENT_FAILED'],
  PARTIAL: ['QUEUED', 'PROCESSING', 'RETRYABLE_FAILED', 'PERMANENT_FAILED', 'COMPLETED'],
  COMPLETED: [], // terminal
  RETRYABLE_FAILED: ['QUEUED', 'PROCESSING', 'PERMANENT_FAILED', 'CANCELLED', 'RECOVERY_REQUIRED'],
  PERMANENT_FAILED: ['QUEUED'], // manual retry only
  CANCELLED: [], // terminal
};

export function canTransition(from: IngestionJobStatus, to: IngestionJobStatus): boolean {
  if (from === to) return true;
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: IngestionJobStatus, to: IngestionJobStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid ingestion job transition: ${from} → ${to}`);
  }
}

/** Map DB/legacy status strings to the explicit state machine. */
export function normalizeJobStatus(raw: string | null | undefined): IngestionJobStatus {
  if (!raw) return 'QUEUED';
  const upper = raw.toUpperCase();
  if ((INGESTION_STATUSES as readonly string[]).includes(upper)) {
    return upper as IngestionJobStatus;
  }
  switch (raw.toLowerCase()) {
    case 'pending':
      return 'QUEUED';
    case 'processing':
      return 'PROCESSING';
    case 'dead':
      return 'PERMANENT_FAILED';
    case 'completed':
    case 'success':
      return 'COMPLETED';
    case 'partial':
      return 'PARTIAL';
    case 'recovery_required':
    case 'persisted_unqueued':
      return 'RECOVERY_REQUIRED';
    default:
      return 'QUEUED';
  }
}

/** Persistable wire value (keeps compatibility with existing pending/processing/dead). */
export function toWireStatus(status: IngestionJobStatus): string {
  switch (status) {
    case 'RECEIVED':
    case 'PERSISTED':
    case 'QUEUED':
    case 'RETRYABLE_FAILED':
    case 'PERSISTED_UNQUEUED':
    case 'RECOVERY_REQUIRED':
      return 'pending';
    case 'PROCESSING':
    case 'PARTIAL':
      return 'processing';
    case 'COMPLETED':
      return 'completed';
    case 'PERMANENT_FAILED':
    case 'CANCELLED':
      return 'dead';
    default:
      return 'pending';
  }
}

/** Statuses that must never be reported as successfully queued. */
export function isUnqueuedRecoveryStatus(status: IngestionJobStatus | string): boolean {
  const s = normalizeJobStatus(status);
  return s === 'PERSISTED_UNQUEUED' || s === 'RECOVERY_REQUIRED' || s === 'PERSISTED';
}

export function isActiveStatus(status: IngestionJobStatus): boolean {
  return (
    status === 'QUEUED' ||
    status === 'PROCESSING' ||
    status === 'PARTIAL' ||
    status === 'RETRYABLE_FAILED' ||
    status === 'RECEIVED' ||
    status === 'PERSISTED' ||
    status === 'PERSISTED_UNQUEUED' ||
    status === 'RECOVERY_REQUIRED'
  );
}

export function classifyIngestionError(err: unknown): {
  category: FailureCategory;
  retryable: boolean;
  code: string;
  message: string;
} {
  const anyErr = err as { code?: string; status?: number; statusCode?: number; message?: string } | null;
  const message = anyErr?.message ?? (err instanceof Error ? err.message : String(err));
  const code = anyErr?.code ?? 'unknown';
  const status = anyErr?.status ?? anyErr?.statusCode;
  const lower = message.toLowerCase();

  if (
    code === 'openai_budget_exceeded' ||
    /insufficient_quota|quota exceeded|monthly openai budget/i.test(message)
  ) {
    return { category: 'quota_exhausted', retryable: true, code: 'quota_exhausted', message: message.slice(0, 500) };
  }
  if (
    code === 'openai_circuit_open' ||
    status === 429 ||
    /rate.?limit|too many requests|429/.test(lower)
  ) {
    return { category: 'rate_limit', retryable: true, code: 'rate_limit', message: message.slice(0, 500) };
  }
  if (status === 408 || /timeout|etimedout|econnreset|socket hang up/.test(lower)) {
    return { category: 'timeout', retryable: true, code: 'timeout', message: message.slice(0, 500) };
  }
  if ((typeof status === 'number' && status >= 500) || /5\d\d|internal server error|bad gateway/.test(lower)) {
    return { category: 'provider_5xx', retryable: true, code: 'provider_5xx', message: message.slice(0, 500) };
  }
  if (/connection (refused|terminated)|too many connections|deadlock|serialization failure|could not serialize/.test(lower)) {
    return { category: 'database_transient', retryable: true, code: 'database_transient', message: message.slice(0, 500) };
  }
  if (/unique constraint|duplicate key|violates foreign key|check constraint/.test(lower)) {
    // Constraints often mean already-applied idempotent work — treat as non-retryable permanent for the job,
    // but callers may continue stages.
    return { category: 'database_constraint', retryable: false, code: 'database_constraint', message: message.slice(0, 500) };
  }
  if (/unauthorized|jwt|invalid token|not authenticated/.test(lower)) {
    return { category: 'authentication', retryable: false, code: 'authentication', message: message.slice(0, 500) };
  }
  if (/forbidden|not allowed|rls|row.level security/.test(lower)) {
    return { category: 'authorization', retryable: false, code: 'authorization', message: message.slice(0, 500) };
  }
  if (/ontology|schema validation|invalid entity type|unknown type/.test(lower)) {
    return { category: 'ontology_conflict', retryable: false, code: 'ontology_conflict', message: message.slice(0, 500) };
  }
  if (/validation|invalid input|empty message|zod/.test(lower)) {
    return { category: 'validation', retryable: false, code: 'validation', message: message.slice(0, 500) };
  }
  if (/permanent|unrecoverable|malformed/.test(lower)) {
    return { category: 'permanent_input_error', retryable: false, code: 'permanent_input_error', message: message.slice(0, 500) };
  }

  return { category: 'unknown', retryable: true, code: String(code), message: message.slice(0, 500) };
}

/**
 * Exponential backoff with full jitter.
 * Quota exhaustion backs off more aggressively than ordinary rate limits.
 */
export function computeRetryDelayMs(
  attempt: number,
  category: FailureCategory,
  retryAfterMs?: number | null,
): number {
  if (retryAfterMs && retryAfterMs > 0) {
    // Honor provider hint with a small jitter cushion
    return retryAfterMs + Math.floor(Math.random() * 250);
  }
  const base =
    category === 'quota_exhausted' ? 30_000 :
    category === 'rate_limit' ? 5_000 :
    category === 'timeout' ? 2_000 :
    1_000;
  const exp = Math.min(attempt, 6);
  const ceiling = base * Math.pow(2, Math.max(0, exp - 1));
  // Full jitter: uniform in [0, ceiling]
  return Math.floor(Math.random() * ceiling);
}

export function isTerminalStatus(status: IngestionJobStatus): boolean {
  return status === 'COMPLETED' || status === 'PERMANENT_FAILED' || status === 'CANCELLED';
}
