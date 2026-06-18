/**
 * Pure clustering + proposal logic for narrative story blocks → life arcs.
 */
import type { EmotionalArc } from '../continuityRuntime/arcs/arcService';
import type { MembershipRole } from '../continuityRuntime/arcs/arcMembershipService';
import type { NarrativeStage } from '../ontology/discourseStance';

export interface NarrativeStructureMeta {
  stages?: Array<{ stage: string; cue: string; confidence: number }>;
  discourse?: Array<{ move: string; cue: string }>;
  primary_narrative_role?: string | null;
  primary_arc_membership_role?: string | null;
  is_story_block?: boolean;
  detector?: string;
}

export interface StoryEventRecord {
  id: string;
  title: string;
  summary: string | null;
  start_time: string;
  people: string[];
  locations: string[];
  narrative: NarrativeStructureMeta;
}

export interface StoryArcCluster {
  events: StoryEventRecord[];
  earliest: Date;
  latest: Date;
  /** Stable idempotency key for upserts */
  consolidationKey: string;
}

export interface StoryArcProposal {
  title: string;
  summary: string;
  emotional_arc: EmotionalArc;
  confidence: number;
  is_active: boolean;
  start_date: string;
  end_date: string | null;
  tags: string[];
  dominant_stages: NarrativeStage[];
}

/** Max gap between events in the same story arc (days). */
export const STORY_CLUSTER_GAP_DAYS = 45;

const STAGE_RANK: Record<string, number> = {
  CLIMAX: 6,
  INCITING: 5,
  ESCALATION: 4,
  SETUP: 3,
  REFLECTION: 2,
  FALLING: 2,
  CODA: 1,
};

export function isEligibleStoryEvent(event: StoryEventRecord): boolean {
  const n = event.narrative;
  if (!n || n.detector !== 'lexical') return false;
  if (n.is_story_block) return true;
  if (n.primary_narrative_role === 'turning_point') return true;
  if ((n.stages?.length ?? 0) >= 2) return true;
  return (n.stages ?? []).some((s) => ['CLIMAX', 'INCITING', 'SETUP'].includes(s.stage));
}

function entitySet(event: StoryEventRecord): Set<string> {
  return new Set([...(event.people ?? []), ...(event.locations ?? [])]);
}

function sharesContext(a: StoryEventRecord, b: StoryEventRecord): boolean {
  const aEnt = entitySet(a);
  const bEnt = entitySet(b);
  if (aEnt.size === 0 || bEnt.size === 0) return true;
  for (const id of aEnt) {
    if (bEnt.has(id)) return true;
  }
  return false;
}

function eventDate(event: StoryEventRecord): Date {
  return new Date(event.start_time);
}

function clusterKey(events: StoryEventRecord[]): string {
  return events
    .map((e) => e.id)
    .sort()
    .join(':');
}

/** Cluster eligible story events by time proximity + shared entities. */
export function clusterStoryEvents(
  events: StoryEventRecord[],
  gapDays = STORY_CLUSTER_GAP_DAYS,
): StoryArcCluster[] {
  const eligible = events.filter(isEligibleStoryEvent).sort(
    (a, b) => eventDate(a).getTime() - eventDate(b).getTime(),
  );

  const clusters: StoryArcCluster[] = [];
  const gapMs = gapDays * 86_400_000;

  for (const event of eligible) {
    const date = eventDate(event);
    let merged = false;

    for (const cluster of clusters) {
      const gap = date.getTime() - cluster.latest.getTime();
      if (gap > gapMs) continue;
      if (!cluster.events.some((e) => sharesContext(e, event))) continue;

      cluster.events.push(event);
      if (date < cluster.earliest) cluster.earliest = date;
      if (date > cluster.latest) cluster.latest = date;
      cluster.consolidationKey = clusterKey(cluster.events);
      merged = true;
      break;
    }

    if (!merged) {
      clusters.push({
        events: [event],
        earliest: date,
        latest: date,
        consolidationKey: clusterKey([event]),
      });
    }
  }

  return clusters.filter(
    (c) => c.events.length >= 2 || c.events.some((e) =>
      (e.narrative.stages ?? []).some((s) => s.stage === 'CLIMAX' || s.stage === 'INCITING'),
    ),
  );
}

function collectStages(cluster: StoryArcCluster): NarrativeStage[] {
  const found = new Set<NarrativeStage>();
  for (const event of cluster.events) {
    for (const s of event.narrative.stages ?? []) {
      if (STAGE_RANK[s.stage]) found.add(s.stage as NarrativeStage);
    }
  }
  return [...found].sort((a, b) => (STAGE_RANK[b] ?? 0) - (STAGE_RANK[a] ?? 0));
}

export function inferEmotionalArc(stages: NarrativeStage[]): EmotionalArc {
  if (stages.includes('CLIMAX')) return 'climax';
  if (stages.includes('REFLECTION') || stages.includes('CODA')) return 'resolution';
  if (stages.includes('ESCALATION') || stages.includes('INCITING')) return 'building';
  return 'neutral';
}

function pickTitle(cluster: StoryArcCluster): string {
  for (const event of cluster.events) {
    const setup = event.narrative.stages?.find((s) => s.stage === 'SETUP');
    if (setup) {
      const snippet = event.summary || event.title;
      const words = snippet.split(/\s+/).slice(0, 6).join(' ');
      return words.length > 10 ? words : `Story — ${words}`;
    }
  }
  const top = cluster.events[0];
  const base = (top.summary || top.title || 'Life chapter').trim();
  return base.length > 55 ? `${base.slice(0, 52)}…` : base;
}

function buildSummary(cluster: StoryArcCluster, stages: NarrativeStage[]): string {
  const stageLabels = stages.slice(0, 4).join(' → ');
  const eventCount = cluster.events.length;
  const range = `${cluster.earliest.toISOString().slice(0, 10)} – ${cluster.latest.toISOString().slice(0, 10)}`;
  return `Lexical story arc (${eventCount} moments, ${range})${stageLabels ? `: ${stageLabels}` : ''}.`;
}

export function proposeStoryArc(cluster: StoryArcCluster): StoryArcProposal {
  const stages = collectStages(cluster);
  const sixMonthsAgo = Date.now() - 180 * 86_400_000;
  const isActive = cluster.latest.getTime() >= sixMonthsAgo;

  let confidence = 0.55;
  if (cluster.events.length >= 3) confidence += 0.1;
  if (stages.includes('CLIMAX') || stages.includes('INCITING')) confidence += 0.12;
  if (cluster.events.some((e) => e.narrative.is_story_block)) confidence += 0.05;
  confidence = Math.min(0.88, confidence);

  return {
    title: pickTitle(cluster),
    summary: buildSummary(cluster, stages),
    emotional_arc: inferEmotionalArc(stages),
    confidence,
    is_active: isActive,
    start_date: cluster.earliest.toISOString().slice(0, 10),
    end_date: isActive ? null : cluster.latest.toISOString().slice(0, 10),
    tags: ['narrative_consolidation', ...stages.map((s) => s.toLowerCase())],
    dominant_stages: stages,
  };
}

export function membershipRoleForEvent(event: StoryEventRecord): MembershipRole {
  const lexical = event.narrative.primary_arc_membership_role as MembershipRole | undefined;
  if (lexical === 'turning_point' || lexical === 'defining_moment') return lexical;

  const stages = (event.narrative.stages ?? []).map((s) => s.stage);
  if (stages.includes('CLIMAX') || stages.includes('INCITING')) return 'turning_point';
  if (stages.includes('SETUP')) return 'defining_moment';
  if (stages.includes('REFLECTION') || stages.includes('CODA')) return 'transition';
  return 'background';
}

export function parseNarrativeStructure(metadata: Record<string, unknown> | null | undefined): NarrativeStructureMeta | null {
  const raw = metadata?.narrative_structure;
  if (!raw || typeof raw !== 'object') return null;
  return raw as NarrativeStructureMeta;
}
