/**
 * Anchor cluster builder — discover narrative clusters from co-mention evidence.
 */
import { createHash } from 'node:crypto';

import type {
  AnchorBuildContext,
  AnchorEvidence,
  AnchorMember,
  NarrativeAnchor,
} from './narrativeAnchorTypes';
import { narrativeAnchorEngine } from '../narrativeAnchors/narrativeAnchorEngine';
import { buildCommunityAnchors } from './communityAnchorService';
import { detectEraForCluster } from './eraDetectionService';
import { computeGravityBatch, gravityByEntityId } from './entityGravityService';
import { buildRecurringActivityAnchors } from './recurringPatternAnchorService';
import { rankAnchors, scoreAnchor } from './anchorScoringService';

const MIN_CLUSTER_SIZE = 2;
const MIN_CO_MENTION = 3;
const UNRELATED_THRESHOLD = 0.15;
const MAX_PUBLISHED_ANCHORS = 18;

function buildCoMentionClusters(ctx: AnchorBuildContext): string[][] {
  // Never transitively union co-mentions: A appearing with B and B with C is
  // not evidence that A and C share a chapter. Keep each provenance-bearing
  // candidate isolated and let era detection demand semantic support.
  const candidates: string[][] = [
    ...ctx.organizations.map((org) => org.memberIds),
    ...ctx.coMentionPairs
      .filter((pair) => pair.count >= MIN_CO_MENTION)
      .map((pair) => [pair.a, pair.b]),
  ];
  const seen = new Set<string>();
  return candidates
    .map((ids) => [...new Set(ids)].filter((id) => ctx.entities.some((entity) => entity.entityId === id)))
    .filter((ids) => ids.length >= MIN_CLUSTER_SIZE)
    .filter((ids) => {
      const key = [...ids].sort().join(':');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
  rel: AnchorBuildContext['relationships'][number],
  ctx: AnchorBuildContext,
  gravity: Map<string, { gravityScore: number; name: string }>,
): NarrativeAnchor | null {
  const source = ctx.entities.find((e) => e.entityId === rel.sourceId);
  const target = ctx.entities.find((e) => e.entityId === rel.targetId);
  if (!source || !target || !rel.directEvidence || !rel.evidence?.length) return null;

  // A relationship edge is not automatically a narrative arc. Require either
  // multiple directly sourced moments or language showing change over time.
  const hasMovement = rel.evidence.length >= 2 || rel.evidence.some((item) =>
    /\b(became|started|began|grew|changed|ended|broke up|drifted|reconnected|conflict|falling out)\b/i.test(item.label));
  if (!hasMovement) return null;

  const builtAt = new Date().toISOString();
  const title = `${source.name} — ${rel.type.replace(/_/g, ' ')}`;
  const consolidationKey = `relationship:${[rel.sourceId, rel.targetId].sort().join(':')}`;

  const entities: AnchorMember[] = [
    memberFromEntity(rel.sourceId, ctx, gravity, [
      ...rel.evidence,
    ])!,
    memberFromEntity(rel.targetId, ctx, gravity, [
      ...rel.evidence,
    ])!,
  ].filter(Boolean);

  const evidence: AnchorEvidence[] = rel.evidence;

  const anchor: NarrativeAnchor = {
    id: consolidationKey,
    title,
    anchorType: 'relationship_arc',
    confidence: Math.min(0.95, 0.72 + Math.min(3, evidence.length) * 0.06),
    gravityScore: 0,
    entities,
    events: [],
    groups: [],
    places: [],
    evidence,
    provenance: {
      builtAt,
      signals: ['relationship_arc', rel.type, 'direct_pair_evidence'],
      consolidationKey,
    },
  };

  anchor.gravityScore = scoreAnchor(anchor, ctx);
  return anchor;
}

const GENERIC_EVENT_TITLE =
  /^(?:event on |captured conversation|untitled|unknown event|conversation)\b/i;

/** Chat-ops / meta / non-life-story noise that should not become chapters */
const JUNK_EVENT_TITLE =
  /\b(?:recap everything|spam my tokens|stroke correctly|testing the chat|background check|self made|what we discussed|in this thread)\b/i;

function isSpecificEventTitle(title: string): boolean {
  const t = (title ?? '').trim();
  if (t.length < 8) return false;
  if (GENERIC_EVENT_TITLE.test(t)) return false;
  if (JUNK_EVENT_TITLE.test(t)) return false;
  // Prefer titles that look like chapter headings (not pure timestamps)
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return false;
  // Bare person name only is not a chapter
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}$/.test(t) && !/\b(show|party|era|summer|work|house|club)\b/i.test(t)) {
    // Allow "Ex Lover Show" etc via keyword check above; bare "Abel Mendoza" fails
    if (!/\b(show|party|festival|expo|graduation|interview|reflections)\b/i.test(t)) {
      // If it's just 1–3 capitalized words without chapter cues, drop
      const words = t.split(/\s+/);
      if (words.length <= 3 && !/\b(with|at|and|the)\b/i.test(t)) return false;
    }
  }
  return true;
}

/** Map TS pivot type onto DB-allowed anchor_type values */
export function mapEventAnchorType(title: string): NarrativeAnchorType {
  const t = title.toLowerCase();
  if (/\b(lorebook|code|build|app|parser)\b/i.test(t)) return 'project_arc';
  if (/\b(work|job|amazon|interview|office)\b/i.test(t)) return 'work_era';
  if (/\b(family|abuela|t[ií]o|t[ií]a|cousin|graduation)\b/i.test(t)) return 'family_period';
  if (/\b(club|goth|ska|show|festival|expo|nocturno|metro)\b/i.test(t)) return 'community';
  if (/\b(travel|trip|vacation)\b/i.test(t)) return 'travel_period';
  return 'life_era';
}

function buildEventAnchor(
  event: AnchorBuildContext['events'][number],
  ctx: AnchorBuildContext,
  gravity: Map<string, { gravityScore: number }>,
): NarrativeAnchor | null {
  if (!isSpecificEventTitle(event.title)) return null;

  const level = (event.significanceLevel ?? '').toLowerCase();
  const score = event.significanceScore ?? 0;
  const significant =
    score >= 40
    || ['moderate', 'major', 'legendary', 'high'].includes(level)
    || isSpecificEventTitle(event.title);

  if (!significant) return null;

  // Prefer real evidence; fall back to the title so empty summaries still qualify.
  const evidence: AnchorEvidence[] =
    event.evidence?.length
      ? event.evidence
      : [{
          id: `event-title-${event.id}`,
          label: event.title,
          source: 'event',
          sourceRef: event.id,
          confidence: 0.7,
        }];

  const peopleNames = event.entityIds
    .map((id) => ctx.entities.find((e) => e.entityId === id && e.entityType === 'character')?.name)
    .filter(Boolean) as string[];
  const placeNames = event.entityIds
    .map((id) => ctx.entities.find((e) => e.entityId === id && e.entityType === 'location')?.name)
    .filter(Boolean) as string[];

  const cognition = narrativeAnchorEngine.evaluate({
    title: event.title,
    proposedType: 'pivotal_event',
    peopleNames,
    placeNames,
    eventTitles: [event.title],
    evidenceLabels: evidence.map((e) => e.label),
    evidenceText: [event.summary, event.title].filter(Boolean).join(' '),
    eventCount: 1,
    significanceScore: Math.max(score, level === 'moderate' ? 50 : 0),
    dates: event.startDate ? [event.startDate] : [],
    membershipOnly: false,
  });

  // Keep strong specific events even when impact scoring is conservative.
  if (
    cognition.status === 'rejected'
    || cognition.status === 'routed'
  ) {
    // Still allow chapter-worthy titles through as emerging anchors.
    if (!isSpecificEventTitle(event.title) || cognition.decision === 'ROUTE_COMMUNITY') {
      return null;
    }
  }

  const entities = event.entityIds
    .map((id) =>
      memberFromEntity(id, ctx, gravity, [
        { id: `ev-${event.id}`, label: event.title, source: 'event', sourceRef: event.id, confidence: 0.8 },
      ]),
    )
    .filter(Boolean) as AnchorMember[];

  const builtAt = new Date().toISOString();
  const consolidationKey = `event:${event.id}`;
  const title = cognition.title && !/^(family|goth|work|social)\s+(period|community)$/i.test(cognition.title)
    ? cognition.title
    : event.title;

  const places: AnchorMember[] = placeNames.map((name, i) => ({
    id: event.entityIds.find((id) => ctx.entities.find((e) => e.entityId === id)?.name === name) ?? `place-${i}`,
    kind: 'place' as const,
    name,
    evidence: [{ id: `ev-place-${i}`, label: name, source: 'event' as const, confidence: 0.75 }],
  }));

  const anchor: NarrativeAnchor = {
    id: consolidationKey,
    title,
    // DB check constraint does not include pivotal_event — map to allowed types
    anchorType: mapEventAnchorType(title),
    confidence: Math.min(0.95, Math.max(0.55, cognition.confidence, 0.65 + score / 300)),
    gravityScore: 0,
    startDate: event.startDate,
    entities: entities.filter((e) => !places.some((p) => p.id === e.id)),
    events: [
      {
        id: event.id,
        kind: 'event',
        name: event.title,
        evidence,
      },
    ],
    groups: [],
    places,
    evidence,
    provenance: {
      builtAt,
      signals: [
        'pivotal_event',
        `significance:${event.significanceLevel ?? event.significanceScore ?? 'inferred'}`,
        `cognition:${cognition.decision}`,
      ],
      consolidationKey,
    },
  };

  anchor.gravityScore = scoreAnchor(anchor, ctx);
  // Boost specific named events so they clear the rank filter even with low entity gravity
  if (isSpecificEventTitle(title)) {
    anchor.gravityScore = Math.max(anchor.gravityScore, 0.35);
  }
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

    const entityKey = createHash('sha256').update([...entityIds].sort().join(',')).digest('hex').slice(0, 24);
    const consolidationKey = `cluster:${era.anchorType}:${entityKey}`;
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
    const relatedOrganizations = ctx.organizations.filter((organization) =>
      organization.memberIds.some((id) => entityIds.includes(id)),
    );

    const evidenceLabels = era.matchedSignals;
    const cognition = narrativeAnchorEngine.evaluate({
      title: era.title,
      proposedType: era.anchorType,
      peopleNames: entities.map((e) => e.name),
      groupNames: relatedOrganizations.map((o) => o.name),
      eventTitles: relatedEvents.map((e) => e.title),
      placeNames: places.map((p) => p.name),
      evidenceLabels,
      signals: era.matchedSignals,
      membershipOnly: relatedEvents.length === 0 && relatedOrganizations.length > 0,
      memberCount: entityIds.length,
      eventCount: relatedEvents.length,
      dates: relatedEvents.map((e) => e.startDate).filter(Boolean) as string[],
    });

    // Route pure communities/households out of the published anchor set
    if (cognition.status === 'routed' || cognition.status === 'rejected') {
      continue;
    }
    if (cognition.status === 'event_only' && relatedEvents.length < 1) {
      continue;
    }
    if (cognition.status === 'needs_review' && relatedEvents.length === 0) {
      continue;
    }

    const anchor: NarrativeAnchor = {
      id: consolidationKey,
      title: cognition.title || era.title,
      anchorType: era.anchorType,
      confidence: Math.min(era.confidence, cognition.confidence),
      gravityScore: 0,
      startDate: relatedEvents
        .map((event) => event.startDate)
        .filter((date): date is string => Boolean(date))
        .sort()[0],
      endDate: relatedEvents
        .map((event) => event.startDate)
        .filter((date): date is string => Boolean(date))
        .sort()
        .at(-1),
      entities: entities
        .filter((e) => !places.some((p) => p.id === e.id))
        .map((e) => {
          // Boundary repair: strip trailing possessive person names
          const cleaned = cognition.peopleNames.find(
            (n) => n.toLowerCase() === e.name.replace(/['’]s$/i, '').toLowerCase(),
          );
          return cleaned && cleaned !== e.name ? { ...e, name: cleaned } : e;
        }),
      events: relatedEvents.map((ev) => ({
        id: ev.id,
        kind: 'event' as const,
        name: ev.title,
        evidence: [{ id: `ev-${ev.id}`, label: ev.title, source: 'event', confidence: 0.75 }],
      })),
      groups: relatedOrganizations.map((organization) => ({
        id: organization.id,
        kind: 'group' as const,
        name: organization.name,
        role: organization.type,
        evidence: [{
          id: `org-${organization.id}`,
          label: `${organization.name}${organization.type ? ` (${organization.type})` : ''}`,
          source: 'organization' as const,
          confidence: 0.85,
        }],
      })),
      places: [
        ...places,
        ...cognition.placeNames
          .filter((n) => !places.some((p) => p.name.toLowerCase() === n.toLowerCase()))
          .map((name, i) => ({
            id: `repaired-place-${i}`,
            kind: 'place' as const,
            name,
            evidence: [{ id: `rp-${i}`, label: name, source: 'mention' as const, confidence: 0.65 }],
          })),
      ],
      evidence: era.matchedSignals.map((s, i) => ({
        id: `sig-${i}`,
        label: s,
        source: 'mention' as const,
        confidence: era.confidence,
      })),
      provenance: {
        builtAt,
        signals: [...era.matchedSignals, `cognition:${cognition.decision}`],
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

  // Event-introduced anchors (Leslie graduation party, Bad Dogg show, work chapters, etc.)
  // Allow 0–N linked entities — a well-titled moment can stand alone as a chapter seed.
  for (const ev of ctx.events) {
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

  return rankAnchors(anchors, ctx).filter((anchor) => {
    const memberCount = anchor.entities.length + anchor.events.length + anchor.groups.length + anchor.places.length;
    return memberCount > 0 && (anchor.gravityScore >= UNRELATED_THRESHOLD || anchor.entities.length >= 2);
  }).slice(0, MAX_PUBLISHED_ANCHORS);
}
