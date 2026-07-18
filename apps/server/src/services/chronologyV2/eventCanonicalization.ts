/**
 * Event canonicalization — collapse duplicate extracted events before stitching.
 *
 * The extraction layer can produce several summaries of the same real-world
 * occurrence ("Testing the app", "Building the app", "Name Testing App and
 * Upcoming Interview" — one afternoon, four rows). Identity must come from
 * structured properties (who / where / what / when), never from generated
 * wording, so this module fingerprints events and merges near-identical ones.
 *
 * Matching signals (renormalized when a feature is unknown on either side):
 *   - participant ID overlap
 *   - location ID overlap
 *   - activity ID overlap
 *   - title+summary term overlap (assists, never dominates)
 *   - temporal proximity
 *
 * Merging is non-destructive at this layer: it returns clusters with a
 * deterministic canonical id (stable across regenerations while the member
 * survives), the most informative title, the richest summary, unioned entity
 * IDs, and the full list of merged ids/titles for the merge log. Callers
 * decide whether to persist the merge or just present it.
 */

import { tokenizeTerms } from './narrativeCohesion';

export interface CanonicalizableEvent {
  id: string;
  title: string;
  summary: string;
  time: string; // ISO start time
  peopleIds?: string[];
  locationIds?: string[];
  activityIds?: string[];
}

export interface CanonicalEventCluster<T extends CanonicalizableEvent = CanonicalizableEvent> {
  /** Lexicographically smallest member id — stable while that member exists. */
  canonicalId: string;
  title: string;
  summary: string;
  /** Earliest member time. */
  time: string;
  peopleIds: string[];
  locationIds: string[];
  activityIds: string[];
  members: T[];
  /** Distinct titles of merged-away members (excludes the chosen title). */
  mergedTitles: string[];
}

export interface MergeLogEntry {
  canonical_id: string;
  canonical_title: string;
  merged_ids: string[];
  merged_titles: string[];
}

/** Similarity ≥ this ⇒ same real-world occurrence. */
export const MERGE_THRESHOLD = 0.6;

/** Never compare events further apart than this. */
export const MAX_MERGE_GAP_MS = 7 * 86_400_000;
const MAX_GAP_MS = MAX_MERGE_GAP_MS;
const DAY_MS = 86_400_000;

// Feature weights; renormalized over the features that are known.
const W_PEOPLE = 0.25;
const W_LOCATIONS = 0.15;
const W_ACTIVITIES = 0.1;
const W_TERMS = 0.35;
const W_TEMPORAL = 0.15;

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

interface Fingerprint {
  terms: Set<string>;
  people: Set<string>;
  locations: Set<string>;
  activities: Set<string>;
  timeMs: number;
}

function fingerprint(e: CanonicalizableEvent): Fingerprint {
  return {
    terms: tokenizeTerms(`${e.title} ${e.summary}`),
    people: new Set(e.peopleIds ?? []),
    locations: new Set(e.locationIds ?? []),
    activities: new Set(e.activityIds ?? []),
    timeMs: new Date(e.time).getTime(),
  };
}

/**
 * Weighted similarity in [0, 1]. Entity features where either side has no
 * data are treated as unknown (excluded and renormalized) — a missing
 * participant list is absence of evidence, not a contradiction.
 */
export function fingerprintSimilarity(a: CanonicalizableEvent, b: CanonicalizableEvent): number {
  const fa = fingerprint(a);
  const fb = fingerprint(b);

  const gap = Math.abs(fa.timeMs - fb.timeMs);
  if (!Number.isFinite(gap) || gap > MAX_GAP_MS) return 0;

  let score = 0;
  let weight = 0;

  const entityFeatures: Array<[Set<string>, Set<string>, number]> = [
    [fa.people, fb.people, W_PEOPLE],
    [fa.locations, fb.locations, W_LOCATIONS],
    [fa.activities, fb.activities, W_ACTIVITIES],
  ];
  for (const [sa, sb, w] of entityFeatures) {
    if (sa.size === 0 || sb.size === 0) continue; // unknown → renormalize
    score += jaccard(sa, sb) * w;
    weight += w;
  }

  score += jaccard(fa.terms, fb.terms) * W_TERMS;
  weight += W_TERMS;

  const temporal = gap <= 1.5 * DAY_MS ? 1 : Math.max(0, 1 - (gap - 1.5 * DAY_MS) / (MAX_GAP_MS - 1.5 * DAY_MS));
  score += temporal * W_TEMPORAL;
  weight += W_TEMPORAL;

  return weight > 0 ? score / weight : 0;
}

/** Most informative title: most distinct meaningful terms, then longest. */
function pickBestTitle(members: CanonicalizableEvent[]): string {
  let best = members[0].title;
  let bestScore = -1;
  for (const m of members) {
    const s = tokenizeTerms(m.title).size * 100 + m.title.length;
    if (s > bestScore) {
      bestScore = s;
      best = m.title;
    }
  }
  return best;
}

/**
 * Single-link greedy clustering over chronologically sorted events. Each
 * event joins the best-matching existing cluster above MERGE_THRESHOLD
 * (max similarity to any member), else opens its own.
 */
export function clusterDuplicateEvents<T extends CanonicalizableEvent>(
  events: T[],
): CanonicalEventCluster<T>[] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
  );

  const clusters: T[][] = [];
  for (const event of sorted) {
    let bestCluster: T[] | null = null;
    let bestSim = 0;
    for (const cluster of clusters) {
      for (const member of cluster) {
        const sim = fingerprintSimilarity(event, member);
        if (sim > bestSim) {
          bestSim = sim;
          bestCluster = cluster;
        }
      }
    }
    if (bestCluster && bestSim >= MERGE_THRESHOLD) bestCluster.push(event);
    else clusters.push([event]);
  }

  return clusters.map((members) => {
    const canonicalId = members.map((m) => m.id).sort()[0];
    const title = pickBestTitle(members);
    const summary = members.reduce(
      (acc, m) => (m.summary.length > acc.length ? m.summary : acc),
      '',
    );
    const mergedTitles = [
      ...new Set(members.map((m) => m.title).filter((t) => t && t !== title)),
    ];
    return {
      canonicalId,
      title,
      summary,
      time: members[0].time,
      peopleIds: [...new Set(members.flatMap((m) => m.peopleIds ?? []))],
      locationIds: [...new Set(members.flatMap((m) => m.locationIds ?? []))],
      activityIds: [...new Set(members.flatMap((m) => m.activityIds ?? []))],
      members,
      mergedTitles,
    };
  });
}

/**
 * Best duplicate for one incoming event, or null when nothing clears
 * MERGE_THRESHOLD. Write-time complement of clusterDuplicateEvents: lets the
 * ingestion path ask "does this occurrence already exist?" with the same
 * fingerprint math the read-time stitcher uses.
 */
export function findBestDuplicate<T extends CanonicalizableEvent>(
  incoming: CanonicalizableEvent,
  candidates: T[],
): { match: T; similarity: number } | null {
  let best: T | null = null;
  let bestSim = 0;
  for (const candidate of candidates) {
    if (candidate.id === incoming.id) continue;
    const sim = fingerprintSimilarity(incoming, candidate);
    if (sim > bestSim) {
      bestSim = sim;
      best = candidate;
    }
  }
  return best && bestSim >= MERGE_THRESHOLD ? { match: best, similarity: bestSim } : null;
}

export function buildMergeLog(
  clusters: CanonicalEventCluster[],
): MergeLogEntry[] {
  return clusters
    .filter((c) => c.members.length > 1)
    .map((c) => ({
      canonical_id: c.canonicalId,
      canonical_title: c.title,
      merged_ids: c.members.map((m) => m.id).filter((id) => id !== c.canonicalId),
      merged_titles: c.mergedTitles,
    }));
}
