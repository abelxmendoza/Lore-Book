import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { LifecycleEntry, StatusSignal, StatusTransition, StatusValue } from './statusInferenceTypes';

export function entityKey(type: StatusSignal['attachedToType'], title: string): string {
  return `${type}:${normalizeNameKey(title)}`;
}

export function resolveTransitionFromStatus(
  status: StatusValue,
  text: string,
): StatusTransition | undefined {
  if (status === 'paused') return 'paused';
  if (status === 'blocked') return 'blocked';
  if (status === 'completed') return 'completed';
  if (status === 'confirmed') return 'confirmed';
  if (status === 'ended' || status === 'former') return 'ended';
  if (/\b(?:started working on|started again|resumed|came back|reappeared)\b/i.test(text)) {
    return 'resumed';
  }
  if (/\b(?:started|begin|began)\b/i.test(text)) return 'started';
  if (/\b(?:revived|reappeared|came back)\b/i.test(text)) return 'revived';
  if (status === 'active' || status === 'current') return 'started';
  return undefined;
}

export function appendTransition(
  prior: LifecycleEntry[],
  signal: StatusSignal,
  recordedAt?: string,
): LifecycleEntry[] {
  const key = entityKey(signal.attachedToType, signal.inferredTitle ?? '');
  const entry: LifecycleEntry = {
    entityKey: key,
    attachedToType: signal.attachedToType,
    inferredTitle: signal.inferredTitle ?? '',
    status: signal.status,
    transition: signal.transition ?? resolveTransitionFromStatus(signal.status, signal.evidencePhrases[0] ?? ''),
    timeHint: signal.timeHint,
    evidencePhrases: signal.evidencePhrases,
    sourceMessageIds: signal.sourceMessageIds,
    recordedAt,
  };

  const last = prior[prior.length - 1];
  if (
    last &&
    last.status === entry.status &&
    last.transition === entry.transition &&
    normalizeNameKey(last.inferredTitle) === normalizeNameKey(entry.inferredTitle)
  ) {
    return prior;
  }

  return [...prior, entry];
}

export function mergeLifecycleState(
  base: Record<string, LifecycleEntry[]>,
  incoming: LifecycleEntry[],
): Record<string, LifecycleEntry[]> {
  const merged = { ...base };
  for (const entry of incoming) {
    const existing = merged[entry.entityKey] ?? [];
    merged[entry.entityKey] = appendTransition(existing, {
      attachedToType: entry.attachedToType,
      inferredTitle: entry.inferredTitle,
      status: entry.status,
      transition: entry.transition,
      timeHint: entry.timeHint,
      evidencePhrases: entry.evidencePhrases,
      sourceMessageIds: entry.sourceMessageIds,
      confidence: 0.8,
      inferredNotConfirmed: true,
      requiresReview: false,
    }, entry.recordedAt);
  }
  return merged;
}

export function getLatestStatus(
  lifecycle: LifecycleEntry[],
): LifecycleEntry | undefined {
  return lifecycle[lifecycle.length - 1];
}

export function statusHistoryPreserved(
  prior: LifecycleEntry[],
  next: LifecycleEntry[],
): boolean {
  return next.length >= prior.length;
}
