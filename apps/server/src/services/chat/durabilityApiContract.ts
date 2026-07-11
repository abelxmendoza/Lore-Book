/**
 * Canonical durability API contract — no overloaded field names.
 *
 * userMessage  = structured save state (object only)
 * notice       = display copy for the client
 */

import type { ChatDurabilityPayload } from './chatDurability';
import { durabilityUserMessage } from './chatDurability';
import type { FailureCategory } from '../ingestion/ingestionJobStates';
import { isUnqueuedRecoveryStatus } from '../ingestion/ingestionJobStates';

export type DurabilityNoticeCode =
  | 'message_saved_ingestion_queued'
  | 'message_saved_ingestion_recovery_required'
  | 'message_saved_assistant_failed'
  | 'message_saved_ingestion_retrying'
  | 'message_saved_ingestion_failed'
  | 'message_not_saved'
  | 'assistant_completed'
  | 'unknown';

export type DurabilityApiResponse = {
  userMessage: ChatDurabilityPayload['userMessage'];
  assistantResponse: ChatDurabilityPayload['assistantResponse'];
  ingestion: ChatDurabilityPayload['ingestion'];
  notice: {
    code: DurabilityNoticeCode;
    message: string;
  };
  /** Nested full payload for clients that already parse durability.* */
  durability: ChatDurabilityPayload;
  error?: string;
  code?: string;
  stage?: string;
  errorCategory?: FailureCategory | string;
  /** Back-compat memory flags (truthful). */
  memory?: {
    user_message_saved: boolean;
    ingestion_started: boolean;
    entity_creation_started: boolean;
    assistant_message_saved: boolean;
  };
};

export function noticeCodeFor(payload: ChatDurabilityPayload, assistantFailed: boolean): DurabilityNoticeCode {
  if (!payload.userMessage.persisted) return 'message_not_saved';
  const ing = payload.ingestion.status;
  if (isUnqueuedRecoveryStatus(ing) || ing === 'NOT_SCHEDULED' || ing === 'UNKNOWN') {
    if (ing === 'UNKNOWN') return 'message_saved_assistant_failed';
    if (ing === 'NOT_SCHEDULED' && assistantFailed) return 'message_saved_assistant_failed';
    return 'message_saved_ingestion_recovery_required';
  }
  if (ing === 'RETRYABLE_FAILED') return 'message_saved_ingestion_retrying';
  if (ing === 'PERMANENT_FAILED') return 'message_saved_ingestion_failed';
  if (assistantFailed) return 'message_saved_assistant_failed';
  if (ing === 'QUEUED' || ing === 'PROCESSING' || ing === 'PARTIAL') {
    return 'message_saved_ingestion_queued';
  }
  if (ing === 'COMPLETED' && !assistantFailed) return 'assistant_completed';
  return 'message_saved_ingestion_queued';
}

export function buildDurabilityApiResponse(
  payload: ChatDurabilityPayload,
  opts?: {
    assistantFailed?: boolean;
    error?: string;
    code?: string;
    stage?: string;
    errorCategory?: FailureCategory | string;
  },
): DurabilityApiResponse {
  const assistantFailed = opts?.assistantFailed ?? payload.assistantResponse.status === 'failed';
  // Enrich recovery messaging for unqueued states
  let message = durabilityUserMessage(payload, assistantFailed);
  if (
    payload.userMessage.persisted &&
    (isUnqueuedRecoveryStatus(payload.ingestion.status) ||
      payload.ingestion.status === 'RECOVERY_REQUIRED' ||
      payload.ingestion.status === 'PERSISTED_UNQUEUED')
  ) {
    message =
      'Your message is saved, but Lorekeeper could not queue autobiographical processing yet. It is marked for recovery and can be processed without resending.';
  }

  const ingestionStarted =
    payload.ingestion.status !== 'NOT_SCHEDULED' &&
    payload.ingestion.status !== 'UNKNOWN' &&
    payload.ingestion.status !== 'RECOVERY_REQUIRED' &&
    payload.ingestion.status !== 'PERSISTED_UNQUEUED' &&
    payload.ingestion.status !== 'PERSISTED';

  return {
    userMessage: payload.userMessage,
    assistantResponse: payload.assistantResponse,
    ingestion: payload.ingestion,
    notice: {
      code: noticeCodeFor(payload, assistantFailed),
      message,
    },
    durability: payload,
    error: opts?.error,
    code: opts?.code,
    stage: opts?.stage,
    errorCategory: opts?.errorCategory,
    memory: {
      user_message_saved: payload.userMessage.persisted,
      ingestion_started: ingestionStarted,
      entity_creation_started: false,
      assistant_message_saved: payload.assistantResponse.status === 'completed',
    },
  };
}

/** Runtime validation — rejects overloaded userMessage string collisions. */
export function assertValidDurabilityResponse(body: unknown): body is DurabilityApiResponse {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  if (typeof b.userMessage === 'string') return false; // forbidden overloaded shape
  if (!b.userMessage || typeof b.userMessage !== 'object') return false;
  if (!b.assistantResponse || typeof b.assistantResponse !== 'object') return false;
  if (!b.ingestion || typeof b.ingestion !== 'object') return false;
  if (!b.notice || typeof b.notice !== 'object') return false;
  const notice = b.notice as Record<string, unknown>;
  if (typeof notice.message !== 'string' || typeof notice.code !== 'string') return false;
  return true;
}
