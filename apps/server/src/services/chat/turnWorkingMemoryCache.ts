/**
 * In-flight Working Memory memoization for one turn.
 * Concurrent assemblers with the same key share one promise.
 * Sequential calls recompute so corrections are visible.
 */

import type { WorkingMemoryAssembly } from './workingMemoryAssembler';

const inflight = new Map<string, Promise<WorkingMemoryAssembly>>();

export function workingMemoryTurnKey(input: {
  userId: string;
  question: string;
  threadId?: string | null;
  focusId?: string | null;
}): string {
  return `${input.userId}|${input.threadId ?? ''}|${input.focusId ?? ''}|${input.question}`;
}

export function getTurnWorkingMemory(
  key: string,
): Promise<WorkingMemoryAssembly> | undefined {
  return inflight.get(key);
}

export function setTurnWorkingMemory(
  key: string,
  promise: Promise<WorkingMemoryAssembly>,
): void {
  inflight.set(key, promise);
}

export function invalidateTurnWorkingMemory(key?: string): void {
  if (key) {
    inflight.delete(key);
    return;
  }
  inflight.clear();
}
