/**
 * Relationship timeline — evidence ordered in time, per person. The timeline
 * is what makes trajectory inference honest: momentum compares the recent
 * window against the past instead of trusting any single statement.
 */
import type { RelationshipEvidence } from './relationshipCognitionTypes';

export type TimelineEntry = RelationshipEvidence & { atMs: number | null };

export function buildTimeline(evidence: RelationshipEvidence[]): TimelineEntry[] {
  return evidence
    .map((item) => {
      const parsed = item.at ? Date.parse(item.at) : NaN;
      return { ...item, atMs: Number.isFinite(parsed) ? parsed : null };
    })
    // Dated entries in order, undated entries first (treated as older history).
    .sort((a, b) => (a.atMs ?? -Infinity) - (b.atMs ?? -Infinity));
}

export function lastEvidenceAt(timeline: TimelineEntry[]): string | undefined {
  for (let i = timeline.length - 1; i >= 0; i -= 1) {
    if (timeline[i].atMs != null) return timeline[i].at;
  }
  return undefined;
}

export function daysSinceLastEvidence(timeline: TimelineEntry[], now: string): number | null {
  const last = lastEvidenceAt(timeline);
  if (!last) return null;
  const gap = Date.parse(now) - Date.parse(last);
  return Number.isFinite(gap) ? Math.max(0, gap / 86_400_000) : null;
}

/** Split the timeline into a recent window and everything before it. */
export function splitRecent(
  timeline: TimelineEntry[],
  now: string,
  windowDays = 30,
): { recent: TimelineEntry[]; past: TimelineEntry[] } {
  const cutoff = Date.parse(now) - windowDays * 86_400_000;
  const recent: TimelineEntry[] = [];
  const past: TimelineEntry[] = [];
  for (const entry of timeline) {
    if (entry.atMs != null && entry.atMs >= cutoff) recent.push(entry);
    else past.push(entry);
  }
  return { recent, past };
}
