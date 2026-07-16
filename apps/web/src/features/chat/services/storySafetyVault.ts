const VAULT_KEY = 'lorekeeper.storySafetyVault.v1';
const DRAFT_PREFIX = 'lorekeeper.composerDraft.v1';
const RECOVERY_EVENT = 'lorekeeper:story-recovery-requested';
const MAX_ATTEMPTS = 20;

export type StorySafetyAttempt = {
  id: string;
  ownerId: string;
  threadId: string;
  text: string;
  createdAt: string;
};

function storageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readAttempts(): StorySafetyAttempt[] {
  if (!storageAvailable()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(VAULT_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isStorySafetyAttempt) : [];
  } catch {
    return [];
  }
}

function isStorySafetyAttempt(value: unknown): value is StorySafetyAttempt {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<StorySafetyAttempt>;
  return Boolean(row.id && row.ownerId && row.threadId && typeof row.text === 'string' && row.createdAt);
}

function writeAttempts(attempts: StorySafetyAttempt[]): boolean {
  if (!storageAvailable()) return false;
  try {
    const payload = JSON.stringify(attempts.slice(-MAX_ATTEMPTS));
    window.localStorage.setItem(VAULT_KEY, payload);
    // Read-back confirms quota/write succeeded (setItem can no-op in private mode).
    return window.localStorage.getItem(VAULT_KEY) === payload;
  } catch {
    // The canonical send path still runs when storage is unavailable/full.
    return false;
  }
}

function draftKey(ownerId: string, threadId?: string): string {
  return `${DRAFT_PREFIX}:${ownerId}:${threadId ?? 'new-thread'}`;
}

export function saveComposerDraft(ownerId: string, threadId: string | undefined, text: string): void {
  if (!storageAvailable()) return;
  try {
    const key = draftKey(ownerId, threadId);
    if (text.trim()) window.localStorage.setItem(key, text);
    else window.localStorage.removeItem(key);
  } catch {
    // Draft persistence is best-effort and must never block typing.
  }
}

export function readComposerDraft(ownerId: string, threadId?: string): string {
  if (!storageAvailable()) return '';
  try {
    return window.localStorage.getItem(draftKey(ownerId, threadId)) ?? '';
  } catch {
    return '';
  }
}

/** Persist a pending send. Returns false when localStorage write fails (quota/private mode). */
export function preserveStoryAttempt(attempt: StorySafetyAttempt): { ok: boolean } {
  const attempts = readAttempts().filter(
    (row) =>
      row.id !== attempt.id &&
      !(row.ownerId === attempt.ownerId && row.threadId === attempt.threadId && row.text === attempt.text)
  );
  attempts.push(attempt);
  return { ok: writeAttempts(attempts) };
}

export function clearStoryAttempt(id: string): void {
  writeAttempts(readAttempts().filter((attempt) => attempt.id !== id));
}

export function latestRecoverableStory(ownerId: string, threadId?: string): StorySafetyAttempt | null {
  const matches = readAttempts().filter(
    (attempt) => attempt.ownerId === ownerId && (!threadId || attempt.threadId === threadId)
  );
  return matches.length > 0 ? matches[matches.length - 1]! : null;
}

export function requestStoryRecovery(attempt: StorySafetyAttempt): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<StorySafetyAttempt>(RECOVERY_EVENT, { detail: attempt }));
}

export function subscribeStoryRecovery(listener: (attempt: StorySafetyAttempt) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: Event) => listener((event as CustomEvent<StorySafetyAttempt>).detail);
  window.addEventListener(RECOVERY_EVENT, handler);
  return () => window.removeEventListener(RECOVERY_EVENT, handler);
}

export function resetStorySafetyVaultForTests(): void {
  if (!storageAvailable()) return;
  window.localStorage.removeItem(VAULT_KEY);
}
