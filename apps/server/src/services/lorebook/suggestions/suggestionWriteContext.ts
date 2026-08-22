/**
 * One canonical index per write operation (rescan / ingest / extractor batch).
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { loadAttachCanonResult } from './suggestionAttachApply';
import { emptySuggestionDecisionIndex, type SuggestionDecisionIndex } from './suggestionDecisionIndex';
import { loadSuggestionDecisionIndex } from './suggestionDecisionStore';
import { notSamePairKey } from './suggestionDecisionTypes';
import type { AttachCanonIndex, CanonLoadStatus } from './suggestionAttachTypes';

export type SuggestionWriteContext = {
  userId: string;
  index: AttachCanonIndex;
  status: CanonLoadStatus;
  loadCount: number;
  extractor?: string;
  applyDomains?: string[];
  decisions: SuggestionDecisionIndex;
};

const als = new AsyncLocalStorage<SuggestionWriteContext>();
let testLoadCount = 0;

export function getSuggestionWriteContext(): SuggestionWriteContext | undefined {
  return als.getStore();
}

export async function ensureSuggestionWriteContext(
  userId: string,
  preload?: Partial<SuggestionWriteContext>,
): Promise<SuggestionWriteContext> {
  const existing = als.getStore();
  if (existing && existing.userId === userId) return existing;

  if (preload?.index && preload.status) {
    testLoadCount += 1;
    return {
      userId,
      index: preload.index,
      status: preload.status,
      loadCount: preload.loadCount ?? 1,
      extractor: preload.extractor,
      applyDomains: preload.applyDomains,
      decisions: preload.decisions ?? emptySuggestionDecisionIndex(),
    };
  }

  const [loaded, decisions] = await Promise.all([
    loadAttachCanonResult(userId),
    loadSuggestionDecisionIndex(userId).catch(() => emptySuggestionDecisionIndex()),
  ]);
  testLoadCount += 1;
  for (const person of loaded.index.characters ?? []) {
    for (const other of person.distinctFrom ?? []) {
      decisions.notSamePairs.add(notSamePairKey(person.id, other));
    }
  }
  return {
    userId,
    index: loaded.index,
    status: loaded.status,
    loadCount: 1,
    extractor: preload?.extractor,
    applyDomains: preload?.applyDomains,
    decisions,
  };
}

export async function withSuggestionWriteContext<T>(
  userId: string,
  fn: (ctx: SuggestionWriteContext) => Promise<T>,
  preload?: Partial<SuggestionWriteContext>,
): Promise<T> {
  const ctx = await ensureSuggestionWriteContext(userId, preload);
  return als.run(ctx, () => fn(ctx));
}

/** Test helper — number of actual canon loads since last reset. */
export function suggestionWriteLoadCount(): number {
  return testLoadCount;
}

export function resetSuggestionWriteContextForTests(): void {
  testLoadCount = 0;
}
