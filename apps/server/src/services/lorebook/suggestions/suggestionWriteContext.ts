/**
 * One canonical index + one decision index per write operation.
 * Nested writers reuse the ALS store so N candidates cost 0 extra DB loads.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { loadAttachCanonResult } from './suggestionAttachApply';
import { emptySuggestionDecisionIndex, type SuggestionDecisionIndex } from './suggestionDecisionIndex';
import {
  loadSuggestionDecisionResult,
  resetSuggestionDecisionStoreLoadCount,
} from './suggestionDecisionStore';
import { notSamePairKey } from './suggestionDecisionTypes';
import type { AttachCanonIndex, CanonLoadStatus } from './suggestionAttachTypes';

export type SuggestionWriteContext = {
  userId: string;
  index: AttachCanonIndex;
  status: CanonLoadStatus;
  decisionStatus: CanonLoadStatus;
  loadCount: number;
  extractor?: string;
  applyDomains?: string[];
  decisions: SuggestionDecisionIndex;
};

const als = new AsyncLocalStorage<SuggestionWriteContext>();
let testLoadCount = 0;
let canonIoLoadCount = 0;
let decisionIoLoadCount = 0;

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
      decisionStatus: preload.decisionStatus ?? 'ok',
      loadCount: preload.loadCount ?? 1,
      extractor: preload.extractor,
      applyDomains: preload.applyDomains,
      decisions: preload.decisions ?? emptySuggestionDecisionIndex(),
    };
  }

  const [loaded, decisionLoaded] = await Promise.all([
    loadAttachCanonResult(userId),
    loadSuggestionDecisionResult(userId).catch(() => ({
      index: emptySuggestionDecisionIndex(),
      status: 'degraded' as const,
      successfulLoads: 0,
      failedLoads: 1,
    })),
  ]);
  testLoadCount += 1;
  canonIoLoadCount += 1;
  decisionIoLoadCount += 1;
  const decisions = decisionLoaded.index;
  for (const person of loaded.index.characters ?? []) {
    for (const other of person.distinctFrom ?? []) {
      decisions.notSamePairs.add(notSamePairKey(person.id, other));
    }
  }
  return {
    userId,
    index: loaded.index,
    status: loaded.status,
    decisionStatus: decisionLoaded.status,
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

/** Test helper — number of write-context constructions since last reset. */
export function suggestionWriteLoadCount(): number {
  return testLoadCount;
}

/** Test helper — actual canon DB loads (preload does not increment). */
export function suggestionCanonIoLoadCount(): number {
  return canonIoLoadCount;
}

/** Test helper — actual decision DB loads (preload does not increment). */
export function suggestionDecisionIoLoadCount(): number {
  return decisionIoLoadCount;
}

export function resetSuggestionWriteContextForTests(): void {
  testLoadCount = 0;
  canonIoLoadCount = 0;
  decisionIoLoadCount = 0;
  resetSuggestionDecisionStoreLoadCount();
}
