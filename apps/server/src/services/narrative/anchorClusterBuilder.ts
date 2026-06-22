/**
 * Anchor cluster builder — discover narrative clusters from co-mention evidence.
 */
import type {
  AnchorBuildContext,
  AnchorEvidence,
  AnchorMember,
  NarrativeAnchor,
} from './narrativeAnchorTypes';
import { buildCommunityAnchors } from './communityAnchorService';
import { detectEraForCluster } from './eraDetectionService';
import { computeGravityBatch, gravityByEntityId } from './entityGravityService';
import { buildRecurringActivityAnchors } from './recurringPatternAnchorService';
import { rankAnchors, scoreAnchor } from './anchorScoringService';

const MIN_CLUSTER_SIZE = 2;
const MIN_CO_MENTION = 1;
const UNRELATED_THRESHOLD = 0.15;

class UnionFind {
  private parent = new Map<string, string>();

  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    if (this.parent.get(x) !== x) this.parent.set(x, this.find(this.parent.get(x)!));
    return this.parent.get(x)!;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }

  clusters(): Map<string, string[]> {
    const groups = new Map<string, string[]>();
    for (const id of this.parent.keys()) {
      const root = this.find(id);
      const list = groups.get(root) ?? [];
      list.push(id);
      groups.set(root, list);
    }
    return groups;
  }
}

function buildCoMentionClusters(ctx: AnchorBuildContext): string[][] {
  const uf = new UnionFind();

  for (const e of ctx.entities) uf.find(e.entityId);

  for (const pair of ctx.coMentionPairs) {
    if (pair.count < MIN_CO_MENTION) continue;
    uf.union(pair.a, pair.b);
  }

  for (const rel of ctx.relationships) {
    uf.union(rel.sourceId, rel.targetId);
  }

  for (const org of ctx.organizations) {
    for (let i = 1; i < org.memberIds.length; i++) {
      uf.union(org.memberIds[0], org.memberIds[i]);
    }
  }

  for (const ev of ctx.events) {
    for (let i = 1; i < ev.entityIds.length; i++) {
      uf.union(ev.entityIds[0], ev.entityIds[i]);
    }
  }

  return [...uf.clusters().values()].filter((c) => c.length >= MIN_CLUSTER_SIZE);
}

function memberFromEntity(
  entityId: string,
  ctx: AnchorBuildContext,
  gravity: Map<string, { gravityScore: number }>,
  evidence: AnchorEvidence[],
): AnchorMember | null {
  const ent = ctx.entities.find((e) => e.entityId === entityId);
  if (!ent) return null;
  return {
    id: ent.entityId,
    kind: 'entity',
    name: ent.name,
    role: ent.roles?.[0],
    gravityScore: gravity.get(entityId)?.gravityScore,
    evidence,
  };
}

function buildRelationshipArcAnchor(
  rel: { sourceId: string; targetId: string; type: string },
  ctx: AnchorBuildContext,
  gravity: Map<string, { gravityScore: number; name: string }>,
): NarrativeAnchor | null {
  const source = ctx.entities.find((e) => e.entityId === rel.sourceId);
  const target = ctx.entities.find((e) => e.entityId === rel.targetId);
  if (!source || !target) return null;

  const phases = ctx.facts
    .filter((f) => f.entityId === rel.sourceId || f.entityId === rel.targetId)
    .map((f) => f.text)
    .filter((t) => /\b(met|dating|birthday|distancing|ghosting|blocking|reappearance|friend|bandmate)\b/i.test(t));

  const builtAt = new Date().toISOString();
  const title = `${source.name} — ${rel.type.replace(/_/g, ' ')}`;
  const consolidationKey = `relationship:${[rel.sourceId, rel.targetId].sort().join(':')}`;

  const entities: AnchorMember[] = [
    memberFromEntity(rel.sourceId, ctx, gravity, [
      { id: 'rel-src', label: rel.type, source: 'relationship', confidence: 0.85 },
    ])!,
    memberFromEntity(rel.targetId, ctx, gravity, [
      { id: 'rel-tgt', label: rel.type, source: 'relationship', confidence: 0.85 },
    ])!,
  ].filter(Boolean);

  const evidence: AnchorEvidence[] = [
    { id: 'rel-ev', label: `${rel.type} relationship`, source: 'relationship', confidence: 0.9 },
    ...phases.map((p, i) => ({
      id: `phase-${i}`,
      label: p,
      source: 'fact' as const,
      confidence: 0.75,
    })),
  ];

  const anchor: NarrativeAnchor = {
    id: consolidationKey,
    title,
    anchorType: 'relationship_arc',
    confidence: 0.75,
    gravityScore: 0,
    entities,
    events: [],
    groups: [],
    places: [],
    evidence,
    provenance: {
      builtAt,
      signals: ['relationship_arc', rel.type, ...phases.slice(0, 3)],
      consolidationKey,
    },
  };

  anchor.gravityScore = scoreAnchor(anchor, ctx);
  return anchor;
}

function buildEventAnchor(
  event: { id: string; title: string; entityIds: string[]; startDate?: string },
  ctx: AnchorBuildContext,
  gravity: Map<string, { gravityScore: number }>,
): NarrativeAnchor | null {
  if (event.entityIds.length === 0) return null;

  const isFamily = /\b(family|graduation|party|tio|aunt|uncle)\b/i.test(event.title);
  const anchorType = isFamily ? 'family_period' : 'life_era';

  const entities = event.entityIds
    .map((id) =>
      memberFromEntity(id, ctx, gravity, [
        { id: `ev-${event.id}`, label: event.title, source: 'event', sourceRef: event.id, confidence: 0.8 },
      ]),
    )
    .filter(Boolean) as AnchorMember[];

  const builtAt = new Date().toISOString();
  const consolidationKey = `event:${event.id}`;

  const anchor: NarrativeAnchor = {
    id: consolidationKey,
    title: event.title,
    anchorType,
    confidence: 0.7,
    gravityScore: 0,
    startDate: event.startDate,
    entities,
    events: [
      {
        id: event.id,
        kind: 'event',
        name: event.title,
        evidence: [{ id: `ev-anchor-${event.id}`, label: event.title, source: 'event', confidence: 0.85 }],
      },
    ],
    groups: [],
    places: [],
    evidence: [
      { id: `ev-intro-${event.id}`, label: `Event introduced ${entities.length} entities`, source: 'event', confidence: 0.8 },
    ],
    provenance: {
      builtAt,
      signals: ['event_anchor'],
      consolidationKey,
    },
  };

  anchor.gravityScore = scoreAnchor(anchor, ctx);
  return anchor;
}

/** Returns true when two entity sets should NOT be merged (low co-mention, no shared signals). */
export function shouldNotCluster(
  clusterA: string[],
  clusterB: string[],
  ctx: AnchorBuildContext,
): boolean {
  const setA = new Set(clusterA);
  const setB = new Set(clusterB);
  let coCount = 0;
  for (const pair of ctx.coMentionPairs) {
    if (setA.has(pair.a) && setB.has(pair.b)) coCount += pair.count;
    if (setA.has(pair.b) && setB.has(pair.a)) coCount += pair.count;
  }
  return coCount === 0 && clusterA.length === 1 && clusterB.length === 1;
}

export function buildAnchorsFromContext(ctx: AnchorBuildContext): NarrativeAnchor[] {
  const gravityScores = computeGravityBatch(ctx.entities);
  const gravity = gravityByEntityId(gravityScores);
  const builtAt = new Date().toISOString();
  const anchors: NarrativeAnchor[] = [];
  const seenKeys = new Set<string>();

  const clusters = buildCoMentionClusters(ctx);

  for (const entityIds of clusters) {
    const era = detectEraForCluster(entityIds, ctx);
    if (!era) continue;

    const consolidationKey = `cluster:${era.anchorType}:${entityIds.sort().join(',')}`;
    if (seenKeys.has(consolidationKey)) continue;
    seenKeys.add(consolidationKey);

    const entities: AnchorMember[] = entityIds
      .map((id) => {
        const coEvidence: AnchorEvidence[] = ctx.coMentionPairs
          .filter((p) => (p.a === id || p.b === id) && entityIds.includes(p.a) && entityIds.includes(p.b))
          .map((p, i) => ({
            id: `co-${i}`,
            label: `Co-mentioned ${p.count}x with cluster`,
            source: 'co_mention' as const,
            confidence: Math.min(0.9, 0.5 + p.count * 0.1),
          }));
        return memberFromEntity(id, ctx, gravity, coEvidence);
      })
      .filter(Boolean) as AnchorMember[];

    const places: AnchorMember[] = entityIds
      .map((id) => ctx.entities.find((e) => e.entityId === id))
      .filter((e) => e?.entityType === 'location')
      .map((e) => ({
        id: e!.entityId,
        kind: 'place' as const,
        name: e!.name,
        evidence: [{ id: `place-${e!.entityId}`, label: e!.name, source: 'mention' as const, confidence: 0.7 }],
      }));

    const relatedEvents = ctx.events.filter((ev) => ev.entityIds.some((id) => entityIds.includes(id)));

    const anchor: NarrativeAnchor = {
      id: consolidationKey,
      title: era.title,
      anchorType: era.anchorType,
      confidence: era.confidence,
      gravityScore: 0,
      entities: entities.filter((e) => !places.some((p) => p.id === e.id)),
      events: relatedEvents.map((ev) => ({
        id: ev.id,
        kind: 'event' as const,
        name: ev.title,
        evidence: [{ id: `ev-${ev.id}`, label: ev.title, source: 'event', confidence: 0.75 }],
      })),
      groups: [],
      places,
      evidence: era.matchedSignals.map((s, i) => ({
        id: `sig-${i}`,
        label: s,
        source: 'mention' as const,
        confidence: era.confidence,
      })),
      provenance: {
        builtAt,
        signals: era.matchedSignals,
        consolidationKey,
      },
    };

    anchor.gravityScore = scoreAnchor(anchor, ctx);
    anchors.push(anchor);
  }

  // Relationship arcs (Sol, Bryan friendship, etc.)
  for (const rel of ctx.relationships) {
    const arc = buildRelationshipArcAnchor(rel, ctx, gravity);
    if (!arc) continue;
    if (seenKeys.has(arc.provenance.consolidationKey!)) continue;
    seenKeys.add(arc.provenance.consolidationKey!);
    anchors.push(arc);
  }

  // Event-introduced anchors (Leslie graduation party, Bad Dogg show)
  for (const ev of ctx.events) {
    if (ev.entityIds.length < 2) continue;
    const anchor = buildEventAnchor(ev, ctx, gravity);
    if (!anchor) continue;
    if (seenKeys.has(anchor.provenance.consolidationKey!)) continue;
    seenKeys.add(anchor.provenance.consolidationKey!);
    anchors.push(anchor);
  }

  for (const a of buildCommunityAnchors(ctx)) {
    if (seenKeys.has(a.provenance.consolidationKey!)) continue;
    seenKeys.add(a.provenance.consolidationKey!);
    anchors.push(a);
  }

  for (const a of buildRecurringActivityAnchors(ctx)) {
    if (seenKeys.has(a.provenance.consolidationKey!)) continue;
    seenKeys.add(a.provenance.consolidationKey!);
    anchors.push(a);
  }

  return rankAnchors(anchors, ctx).filter((a) => a.gravityScore >= UNRELATED_THRESHOLD || a.entities.length >= 2);
}
