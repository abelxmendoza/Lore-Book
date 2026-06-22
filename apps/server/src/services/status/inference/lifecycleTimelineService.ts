import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { LifecycleEntry, StatusSignal } from './statusInferenceTypes';
import { appendTransition, entityKey } from './statusTransitionResolver';

export function recordLifecycleTransitions(
  signals: StatusSignal[],
  priorLifecycle: Record<string, LifecycleEntry[]> = {},
  recordedAt?: string,
): { lifecycle: LifecycleEntry[]; state: Record<string, LifecycleEntry[]> } {
  const state = { ...priorLifecycle };
  const lifecycle: LifecycleEntry[] = [];

  for (const signal of signals) {
    const key = entityKey(signal.attachedToType, signal.inferredTitle ?? '');
    const existing = state[key] ?? [];
    const updated = appendTransition(existing, signal, recordedAt);
    state[key] = updated;
    const added = updated[updated.length - 1];
    if (added && added !== existing[existing.length - 1]) {
      lifecycle.push(added);
    }
  }

  return { lifecycle, state };
}

export function buildTimelineMetadata(entry: LifecycleEntry): Record<string, unknown> {
  return {
    kind: 'status_lifecycle',
    entityKey: entry.entityKey,
    attachedToType: entry.attachedToType,
    inferredTitle: entry.inferredTitle,
    status: entry.status,
    transition: entry.transition,
    timeHint: entry.timeHint,
    evidencePhrases: entry.evidencePhrases,
    sourceMessageIds: entry.sourceMessageIds,
    recordedAt: entry.recordedAt,
  };
}

export function getEntityLifecycleSummary(
  state: Record<string, LifecycleEntry[]>,
  titlePart: string,
): LifecycleEntry[] {
  const needle = normalizeNameKey(titlePart);
  return Object.values(state)
    .flat()
    .filter((e) => normalizeNameKey(e.inferredTitle).includes(needle));
}
