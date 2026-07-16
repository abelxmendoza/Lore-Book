/**
 * Explicit per-message delivery/processing lifecycle.
 * Separates device vault, cloud persist, and AI/ingestion processing
 * so the UI never claims "safe" without naming the layer.
 */

export type LocalPersistenceState = 'not_started' | 'saving' | 'saved' | 'failed';
export type CloudPersistenceState = 'not_started' | 'queued' | 'syncing' | 'saved' | 'failed';
export type ProcessingState = 'not_started' | 'queued' | 'processing' | 'completed' | 'failed';
export type SummaryState = 'not_requested' | 'pending' | 'completed' | 'failed';

export type LifecycleStage = 'local' | 'cloud' | 'ingestion' | 'generation' | 'summary';

export type MessageLifecycleError = {
  stage: LifecycleStage;
  code?: string;
  message: string;
  retryable: boolean;
  occurredAt: string;
};

export type MessageLifecycleState = {
  localPersistence: LocalPersistenceState;
  cloudPersistence: CloudPersistenceState;
  processing: ProcessingState;
  summary: SummaryState;
  lastError?: MessageLifecycleError;
  retryCount: number;
  updatedAt: string;
};

export function createPendingLifecycle(now = new Date().toISOString()): MessageLifecycleState {
  return {
    localPersistence: 'saving',
    cloudPersistence: 'queued',
    processing: 'queued',
    summary: 'not_requested',
    retryCount: 0,
    updatedAt: now,
  };
}

export function withLifecyclePatch(
  prev: MessageLifecycleState | undefined,
  patch: Partial<Omit<MessageLifecycleState, 'updatedAt' | 'lastError'>> & {
    lastError?: MessageLifecycleError | null;
  },
  now = new Date().toISOString(),
): MessageLifecycleState {
  const base = prev ?? createPendingLifecycle(now);
  const { lastError: patchError, ...rest } = patch;
  const next: MessageLifecycleState = {
    ...base,
    ...rest,
    updatedAt: now,
  };
  if (patchError === null) delete next.lastError;
  else if (patchError) next.lastError = patchError;
  return next;
}

/** User-facing status for a message footer / system notice. */
export function describeMessageLifecycle(state: MessageLifecycleState): {
  tone: 'ok' | 'warn' | 'error' | 'info';
  title: string;
  detail: string;
  allowReloadAdvice: boolean;
  primaryAction: 'retry_sync' | 'retry_send' | 'copy' | 'none';
} {
  const localOk = state.localPersistence === 'saved';
  const cloudOk = state.cloudPersistence === 'saved';
  const procFailed = state.processing === 'failed';
  const cloudFailed = state.cloudPersistence === 'failed';
  const localFailed = state.localPersistence === 'failed';

  if (cloudOk && state.processing === 'completed') {
    return {
      tone: 'ok',
      title: 'Saved to cloud',
      detail: 'This message is backed up and processed.',
      allowReloadAdvice: true,
      primaryAction: 'none',
    };
  }

  if (cloudOk && procFailed) {
    return {
      tone: 'warn',
      title: 'Saved to cloud — reply failed',
      detail: 'Your words are in the cloud. Retry the response without rewriting.',
      allowReloadAdvice: true,
      primaryAction: 'retry_send',
    };
  }

  if (cloudOk && (state.processing === 'processing' || state.processing === 'queued')) {
    return {
      tone: 'info',
      title: 'Saved to cloud',
      detail: 'Processing…',
      allowReloadAdvice: true,
      primaryAction: 'none',
    };
  }

  if (localOk && cloudFailed) {
    return {
      tone: 'error',
      title: 'Cloud sync failed',
      detail: 'Draft is stored on this device. Tap Retry sync — do not reload until sync succeeds.',
      allowReloadAdvice: false,
      primaryAction: 'retry_sync',
    };
  }

  if (localOk && state.cloudPersistence === 'syncing') {
    return {
      tone: 'info',
      title: 'Syncing to cloud…',
      detail: 'Saved on this device; uploading.',
      allowReloadAdvice: false,
      primaryAction: 'none',
    };
  }

  if (localOk && (state.cloudPersistence === 'queued' || state.cloudPersistence === 'not_started')) {
    return {
      tone: 'warn',
      title: 'Saved on this device',
      detail: 'Queued for cloud sync.',
      allowReloadAdvice: false,
      primaryAction: 'retry_sync',
    };
  }

  if (localFailed && cloudFailed) {
    return {
      tone: 'error',
      title: 'Neither save nor processing succeeded',
      detail: state.lastError?.message || 'Copy your text, then try sending again.',
      allowReloadAdvice: false,
      primaryAction: 'copy',
    };
  }

  if (procFailed && !cloudOk) {
    return {
      tone: 'error',
      title: 'Could not save or process',
      detail: localOk
        ? 'Words are on this device only. Retry sync before reloading.'
        : 'Restored to the composer when possible. Retry send — avoid reload until a device copy exists.',
      allowReloadAdvice: false,
      primaryAction: localOk ? 'retry_sync' : 'retry_send',
    };
  }

  return {
    tone: 'info',
    title: 'Saving…',
    detail: 'Confirming device and cloud persistence.',
    allowReloadAdvice: false,
    primaryAction: 'none',
  };
}

/** Compact header cloud glyph semantics (thread-level aggregate). */
export function cloudGlyphForThreadState(
  state: string | null | undefined,
): 'synced' | 'syncing' | 'local' | 'failed' | 'hidden' {
  switch (state) {
    case 'PERSISTED':
    case 'RESTORED_FROM_BACKEND':
      return 'synced';
    case 'PERSISTING':
    case 'PERSIST_PENDING':
      return 'syncing';
    case 'LOCAL_ONLY':
    case 'OFFLINE_MODE':
    case 'RESTORED_FROM_LOCAL':
      return 'local';
    case 'SYNC_FAILED':
      return 'failed';
    default:
      return 'hidden';
  }
}
