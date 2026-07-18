/**
 * Policy layer for PHYSICAL duplicate-event merges (deletes rows), applied on
 * top of the fingerprint clustering in eventCanonicalization. Read-time
 * merging can afford false positives — it only affects presentation — but a
 * physical merge cannot, so clusters that span multiple chat threads get
 * extra scrutiny:
 *
 * - Deictic content ("recap this thread") is identical text with
 *   thread-scoped identity — two threads' recaps are two occurrences.
 * - Generic shell titles ("Captured Conversation") carry no identity of their
 *   own; without one publishable title in the cluster there is no evidence
 *   the threads described the same real-world occurrence.
 */

import { isPublishableLifeLogTitle } from '../events/lifeLogEligibilityPolicy';

import type { CanonicalEventCluster, CanonicalizableEvent } from './eventCanonicalization';
import { tokenizeTerms } from './narrativeCohesion';

export interface MergeCandidateMember {
  title: string;
  summary: string;
  threadId?: string | null;
}

const THREAD_DEICTIC = /\b(?:this|the current) (?:thread|conversation|chat|session)\b/i;

export function clusterEligibleForPhysicalMerge(
  members: MergeCandidateMember[],
): { eligible: boolean; reason: string } {
  const threadIds = new Set(members.map((m) => m.threadId).filter(Boolean) as string[]);
  if (threadIds.size <= 1) return { eligible: true, reason: 'single-thread' };
  if (members.some((m) => THREAD_DEICTIC.test(`${m.title} ${m.summary}`))) {
    return { eligible: false, reason: 'cross-thread deictic content' };
  }
  if (!members.some((m) => isPublishableLifeLogTitle(m.title))) {
    return { eligible: false, reason: 'cross-thread with only generic titles' };
  }
  return { eligible: true, reason: 'cross-thread, specific shared content' };
}

/**
 * Cluster title for a physical merge: never let a generic shell title win
 * over a publishable one ("Captured Conversation" must not swallow
 * "Ex Lover Show"). Falls back to the cluster's own pick when no member
 * title is publishable, using the same most-distinct-terms heuristic.
 */
export function pickMergeTitle(cluster: CanonicalEventCluster<CanonicalizableEvent>): string {
  if (isPublishableLifeLogTitle(cluster.title)) return cluster.title;
  const publishable = cluster.members.filter((m) => isPublishableLifeLogTitle(m.title));
  if (publishable.length === 0) return cluster.title;
  let best = publishable[0].title;
  let bestScore = -1;
  for (const m of publishable) {
    const score = tokenizeTerms(m.title).size * 100 + m.title.length;
    if (score > bestScore) {
      bestScore = score;
      best = m.title;
    }
  }
  return best;
}
