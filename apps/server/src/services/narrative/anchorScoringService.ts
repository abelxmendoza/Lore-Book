/**
 * Anchor scoring — high-scoring anchors surface first in LoreBook.
 */
import type { AnchorBuildContext, NarrativeAnchor } from './narrativeAnchorTypes';
import { computeGravityBatch, gravityByEntityId } from './entityGravityService';

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function scoreAnchor(anchor: NarrativeAnchor, ctx?: AnchorBuildContext): number {
  const entityCount = anchor.entities.length;
  const eventCount = anchor.events.length;
  const groupCount = anchor.groups.length;
  const placeCount = anchor.places.length;
  const relationshipSignals = anchor.evidence.filter((e) => e.source === 'relationship').length;
  const recurrenceSignals = anchor.evidence.filter((e) => e.source === 'pattern').length;
  const mentionSignals = anchor.evidence.filter((e) => e.source === 'mention' || e.source === 'co_mention').length;

  let entityGravityAvg = 0;
  if (ctx && anchor.entities.length > 0) {
    const scores = computeGravityBatch(ctx.entities);
    const byId = gravityByEntityId(scores);
    const vals = anchor.entities
      .map((m) => byId.get(m.id)?.gravityScore ?? 0)
      .filter((v) => v > 0);
    if (vals.length) entityGravityAvg = vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  const spanBonus =
    anchor.startDate && anchor.endDate
      ? 0.08
      : anchor.startDate || anchor.endDate
        ? 0.04
        : 0;

  const raw =
    Math.min(1, entityCount / 6) * 0.22 +
    Math.min(1, eventCount / 4) * 0.12 +
    Math.min(1, (relationshipSignals + groupCount) / 4) * 0.14 +
    Math.min(1, recurrenceSignals / 2) * 0.12 +
    Math.min(1, mentionSignals / 5) * 0.10 +
    entityGravityAvg * 0.22 +
    anchor.confidence * 0.08 +
    spanBonus;

  // Place and community richness
  const richness = Math.min(0.05, (placeCount + groupCount) * 0.02);

  return Math.round(clamp01(raw + richness) * 100) / 100;
}

export function rankAnchors(anchors: NarrativeAnchor[], ctx?: AnchorBuildContext): NarrativeAnchor[] {
  return [...anchors]
    .map((a) => ({
      ...a,
      gravityScore: a.gravityScore > 0 ? a.gravityScore : scoreAnchor(a, ctx),
    }))
    .sort((a, b) => b.gravityScore - a.gravityScore || b.confidence - a.confidence);
}
