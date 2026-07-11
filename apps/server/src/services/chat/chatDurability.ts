/**
 * Chat durability boundary — independent outcomes for:
 *   1. user message persistence
 *   2. assistant response generation
 *   3. autobiographical ingestion
 *
 * A failed assistant reply must never imply memory loss.
 */

import {
  classifyIngestionError,
  normalizeJobStatus,
  type FailureCategory,
  type IngestionJobStatus,
  type IngestionStage,
} from '../ingestion/ingestionJobStates';

export type AssistantResponseStatus = 'completed' | 'failed' | 'pending';

export type ChatDurabilityPayload = {
  userMessage: {
    id?: string;
    persisted: boolean;
    sessionId?: string;
    idempotencyKey?: string;
    reused?: boolean;
  };
  assistantResponse: {
    status: AssistantResponseStatus;
    messageId?: string;
    errorCategory?: FailureCategory;
  };
  ingestion: {
    jobId?: string;
    status: IngestionJobStatus | 'UNKNOWN' | 'NOT_SCHEDULED';
    currentStage?: IngestionStage | string;
    retryable?: boolean;
    nextRetryAt?: string;
    attemptCount?: number;
  };
};

/** Error thrown after the user message (and ideally the job) is durable. */
export class ChatDurabilityError extends Error {
  readonly code: string;
  readonly category: FailureCategory;
  readonly retryable: boolean;
  readonly stage: 'response_generation' | 'message_persistence' | 'ingestion_dispatch';
  readonly durability: ChatDurabilityPayload;
  readonly httpStatus: number;

  constructor(opts: {
    message: string;
    category?: FailureCategory;
    code?: string;
    stage?: ChatDurabilityError['stage'];
    durability: ChatDurabilityPayload;
    cause?: unknown;
    httpStatus?: number;
  }) {
    super(opts.message);
    this.name = 'ChatDurabilityError';
    const classified = classifyIngestionError(opts.cause ?? opts.message);
    this.category = opts.category ?? classified.category;
    this.code = opts.code ?? classified.code;
    this.retryable = classified.retryable;
    this.stage = opts.stage ?? 'response_generation';
    this.durability = opts.durability;
    this.httpStatus =
      opts.httpStatus ??
      (this.category === 'quota_exhausted' || this.category === 'rate_limit' ? 429 : 502);
    if (opts.cause instanceof Error && opts.cause.stack) {
      this.stack = opts.cause.stack;
    }
  }
}

export function isChatDurabilityError(err: unknown): err is ChatDurabilityError {
  return err instanceof ChatDurabilityError || (err as { name?: string })?.name === 'ChatDurabilityError';
}

export function buildDurabilityPayload(input: {
  userMessageId?: string | null;
  sessionId?: string | null;
  idempotencyKey?: string | null;
  reused?: boolean;
  assistantStatus: AssistantResponseStatus;
  assistantMessageId?: string | null;
  assistantErrorCategory?: FailureCategory;
  ingestionJobId?: string | null;
  ingestionStatus?: string | null;
  currentStage?: string | null;
  retryable?: boolean;
  nextRetryAt?: string | null;
  attemptCount?: number;
}): ChatDurabilityPayload {
  const persisted = Boolean(input.userMessageId);
  let ingestionStatus: ChatDurabilityPayload['ingestion']['status'] = 'UNKNOWN';
  if (!persisted) {
    ingestionStatus = 'NOT_SCHEDULED';
  } else if (input.ingestionStatus) {
    ingestionStatus = normalizeJobStatus(input.ingestionStatus);
  } else if (input.ingestionJobId) {
    ingestionStatus = 'QUEUED';
  } else {
    ingestionStatus = 'NOT_SCHEDULED';
  }

  return {
    userMessage: {
      id: input.userMessageId ?? undefined,
      persisted,
      sessionId: input.sessionId ?? undefined,
      idempotencyKey: input.idempotencyKey ?? undefined,
      reused: input.reused,
    },
    assistantResponse: {
      status: input.assistantStatus,
      messageId: input.assistantMessageId ?? undefined,
      errorCategory: input.assistantErrorCategory,
    },
    ingestion: {
      jobId: input.ingestionJobId ?? undefined,
      status: ingestionStatus,
      currentStage: input.currentStage ?? undefined,
      retryable: input.retryable,
      nextRetryAt: input.nextRetryAt ?? undefined,
      attemptCount: input.attemptCount,
    },
  };
}

/** Truthful user-facing copy — never claims unknown memory status when we know. */
export function durabilityUserMessage(payload: ChatDurabilityPayload, assistantFailed: boolean): string {
  const saved = payload.userMessage.persisted;
  const ing = payload.ingestion.status;

  if (!saved) {
    return 'I could not save your message. Please try sending it again.';
  }

  if (assistantFailed) {
    if (ing === 'QUEUED' || ing === 'RECEIVED' || ing === 'PERSISTED' || ing === 'PROCESSING' || ing === 'PARTIAL') {
      return 'I saved your message. I couldn’t generate a reply right now, but Lorekeeper has queued it for autobiographical processing.';
    }
    if (ing === 'RETRYABLE_FAILED') {
      return 'Your message is saved. Some memory processing is retrying after a temporary service issue.';
    }
    if (ing === 'COMPLETED') {
      return 'I saved your message and finished organizing it, but I couldn’t generate a reply right now.';
    }
    if (ing === 'PERMANENT_FAILED') {
      return 'Your original message is saved, but Lorekeeper could not finish organizing it. You can retry the processing without resending the message.';
    }
    return 'I saved your message. I couldn’t generate a reply right now; autobiographical processing was scheduled independently.';
  }

  // Assistant ok / pending with visible ingestion status (restrained — callers only show when needed)
  if (ing === 'PROCESSING' || ing === 'QUEUED' || ing === 'PARTIAL') {
    return 'Your message is saved. Lorekeeper is still organizing the people, events, and details from it.';
  }
  if (ing === 'RETRYABLE_FAILED') {
    return 'Your message is saved. Some memory processing is retrying after a temporary service issue.';
  }
  if (ing === 'PERMANENT_FAILED') {
    return 'Your original message is saved, but Lorekeeper could not finish organizing it. You can retry the processing without resending the message.';
  }
  return 'Your message is saved.';
}

// ─── Lightweight process metrics (exported for diagnostics) ──────────────────

export type ChatDurabilityMetrics = {
  messages_received: number;
  messages_persisted: number;
  assistant_generation_success: number;
  assistant_generation_failure: number;
  ingestion_jobs_queued: number;
  ingestion_jobs_completed: number;
  ingestion_jobs_retrying: number;
  ingestion_jobs_permanent_failure: number;
  ingestion_stage_failure: number;
  stale_jobs_reclaimed: number;
  duplicate_sends_prevented: number;
  duplicate_ingestion_artifacts_prevented: number;
};

const metrics: ChatDurabilityMetrics = {
  messages_received: 0,
  messages_persisted: 0,
  assistant_generation_success: 0,
  assistant_generation_failure: 0,
  ingestion_jobs_queued: 0,
  ingestion_jobs_completed: 0,
  ingestion_jobs_retrying: 0,
  ingestion_jobs_permanent_failure: 0,
  ingestion_stage_failure: 0,
  stale_jobs_reclaimed: 0,
  duplicate_sends_prevented: 0,
  duplicate_ingestion_artifacts_prevented: 0,
};

export function incMetric(key: keyof ChatDurabilityMetrics, by = 1): void {
  metrics[key] += by;
}

export function getChatDurabilityMetrics(): ChatDurabilityMetrics {
  return { ...metrics };
}

export function resetChatDurabilityMetricsForTests(): void {
  for (const k of Object.keys(metrics) as (keyof ChatDurabilityMetrics)[]) {
    metrics[k] = 0;
  }
}
