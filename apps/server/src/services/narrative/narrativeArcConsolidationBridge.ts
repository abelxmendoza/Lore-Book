/**
 * Pure clustering + proposal logic for narrative story blocks → life arcs.
 */
import type { MembershipRole } from '../continuityRuntime/arcs/arcMembershipService';
import type { EmotionalArc } from '../continuityRuntime/arcs/arcService';
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
  activities?: string[];
  tags?: string[];
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

export interface ChapterContribution {
  eventId: string;
  score: number;
  classification: 'supporting' | 'background' | 'excluded';
}

export interface NarrativeChapterQuality {
  narrativeCoherence: number;
  topicPurity: number;
  chronologicalFlow: number;
  characterConsistency: number;
  locationConsistency: number;
  goalConsistency: number;
  emotionalConsistency: number;
  redundancy: number;
  overallStoryQuality: number;
}

export interface NarrativeChapterPlan {
  thesis: string;
  dominantTheme: string;
  supportingEvents: StoryEventRecord[];
  backgroundEvents: StoryEventRecord[];
  excludedEvents: StoryEventRecord[];
  contributions: ChapterContribution[];
  outcomes: string[];
  participants: string[];
  locations: string[];
  confidence: number;
  quality: NarrativeChapterQuality;
}

/** Max gap between events in the same story arc (days). */
export const STORY_CLUSTER_GAP_DAYS = 45;
export const STORY_CLUSTER_AFFINITY_THRESHOLD = 35;
export const CHAPTER_CONTRIBUTION_THRESHOLD = 60;

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

const STORY_STOPWORDS = new Set([
  'about', 'after', 'again', 'before', 'during', 'from', 'into', 'summer',
  'that', 'their', 'then', 'this', 'through', 'with', 'year', 'years', 'reflection',
  'reflections', 'event', 'summary',
]);

function storyTerms(event: StoryEventRecord): Set<string> {
  const terms = new Set<string>();
  const text = `${event.title} ${event.summary ?? ''} ${(event.tags ?? []).join(' ')}`.toLowerCase();
  for (const raw of text.split(/[^a-z0-9]+/)) {
    if (raw.length > 3 && !STORY_STOPWORDS.has(raw)) terms.add(raw);
  }
  return terms;
}

function sharedCount(a: string[] = [], b: string[] = []): number {
  if (a.length === 0 || b.length === 0) return 0;
  const right = new Set(b);
  return a.filter((value) => right.has(value)).length;
}

function termOverlap(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const term of a) if (b.has(term)) count += 1;
  return count;
}

/** Story affinity prioritizes shared goal/activity/people/place; time only supports it. */
export function storyAffinity(a: StoryEventRecord, b: StoryEventRecord): number {
  const people = sharedCount(a.people, b.people) > 0 ? 28 : 0;
  const location = sharedCount(a.locations, b.locations) > 0 ? 24 : 0;
  const activity = sharedCount(a.activities, b.activities) > 0 ? 22 : 0;
  const lexicalHits = termOverlap(storyTerms(a), storyTerms(b));
  const goal = lexicalHits >= 3 ? 30 : lexicalHits === 2 ? 22 : lexicalHits === 1 ? 10 : 0;

  const gapDays = Math.abs(eventDate(a).getTime() - eventDate(b).getTime()) / 86_400_000;
  const temporal = gapDays <= 1 ? 18 : gapDays <= 3 ? 12 : gapDays <= 14 ? 10 : gapDays <= 45 ? 2 : 0;
  const narrativeSignal = people + location + activity + goal;
  return narrativeSignal > 0 ? Math.min(100, narrativeSignal + temporal) : 0;
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

/** Discover story clusters by narrative affinity, using time only as support. */
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
      const affinity = Math.max(...cluster.events.map((e) => storyAffinity(e, event)));
      if (affinity < STORY_CLUSTER_AFFINITY_THRESHOLD) continue;

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

const DURABLE_BACKGROUND_PATTERNS = [
  /\bunemploy(ed|ment)\b/i,
  /\b(jobless|job hunt|job search|looking for work)\b/i,
  /\bgraduat(ed|ion|ing)\b/i,
  /\bliv(e|es|ing) with\b/i,
];

const EPISODIC_CONTEXT_PATTERNS = [
  /\bheartbr(eak|oken)\b/i,
  /\b(breakup|broke up|recovering from)\b/i,
];

function looksLikeBackground(event: StoryEventRecord): boolean {
  const text = `${event.title} ${event.summary ?? ''}`;
  return [...DURABLE_BACKGROUND_PATTERNS, ...EPISODIC_CONTEXT_PATTERNS]
    .some((pattern) => pattern.test(text));
}

function looksLikeDurableBackground(event: StoryEventRecord): boolean {
  const text = `${event.title} ${event.summary ?? ''}`;
  return DURABLE_BACKGROUND_PATTERNS.some((pattern) => pattern.test(text));
}

function narrativeSalience(event: StoryEventRecord, cluster: StoryArcCluster): number {
  const strongestStage = Math.max(
    0,
    ...(event.narrative.stages ?? []).map((stage) => STAGE_RANK[stage.stage] ?? 0),
  );
  const specificity = Math.min(18, storyTerms(event).size * 2);
  const structure = (event.activities?.length ?? 0) * 4
    + event.people.length * 2
    + event.locations.length * 2;
  const centrality = cluster.events.reduce(
    (sum, other) => sum + storyAffinity(event, other),
    0,
  ) / Math.max(1, cluster.events.length);
  return strongestStage * 12 + specificity + structure + centrality * 0.2;
}

function dominantEvent(cluster: StoryArcCluster): StoryEventRecord {
  const nonBackground = cluster.events.filter((event) => !looksLikeBackground(event));
  const candidates = nonBackground.length > 0 ? nonBackground : cluster.events;
  return [...candidates].sort((a, b) => {
    const salience = narrativeSalience(b, cluster) - narrativeSalience(a, cluster);
    if (salience !== 0) return salience;
    return eventDate(a).getTime() - eventDate(b).getTime();
  })[0];
}

function contributionToChapter(core: StoryEventRecord, event: StoryEventRecord): number {
  if (core.id === event.id) return 100;
  return Math.min(100, 35 + storyAffinity(core, event));
}

function qualityForChapter(
  supporting: StoryEventRecord[],
  candidates: StoryEventRecord[],
  contributions: ChapterContribution[],
): NarrativeChapterQuality {
  const supportScores = contributions
    .filter((item) => item.classification === 'supporting')
    .map((item) => item.score);
  const narrativeCoherence = supportScores.length
    ? Math.round(supportScores.reduce((sum, score) => sum + score, 0) / supportScores.length)
    : 0;
  const topicPurity = Math.round((supporting.length / Math.max(1, candidates.filter((e) => !looksLikeBackground(e)).length)) * 100);
  const chronologicalFlow = supporting.every((event, index) => index === 0 || eventDate(event) >= eventDate(supporting[index - 1])) ? 100 : 70;
  const core = supporting[0];
  const characterConsistency = core?.people.length
    ? Math.round((supporting.filter((event) => sharedCount(core.people, event.people) > 0).length / supporting.length) * 100)
    : narrativeCoherence;
  const locationConsistency = core?.locations.length
    ? Math.round((supporting.filter((event) => sharedCount(core.locations, event.locations) > 0).length / supporting.length) * 100)
    : narrativeCoherence;
  const goalConsistency = narrativeCoherence;
  const emotionalConsistency = supporting.some((event) => (event.narrative.stages ?? []).length > 0) ? 85 : 65;
  const normalizedTitles = supporting.map((event) => event.title.trim().toLowerCase());
  const redundancy = Math.round((new Set(normalizedTitles).size / Math.max(1, normalizedTitles.length)) * 100);
  const overallStoryQuality = Math.round(
    narrativeCoherence * 0.25 +
    topicPurity * 0.2 +
    chronologicalFlow * 0.1 +
    characterConsistency * 0.1 +
    locationConsistency * 0.1 +
    goalConsistency * 0.15 +
    emotionalConsistency * 0.05 +
    redundancy * 0.05,
  );
  return {
    narrativeCoherence,
    topicPurity,
    chronologicalFlow,
    characterConsistency,
    locationConsistency,
    goalConsistency,
    emotionalConsistency,
    redundancy,
    overallStoryQuality,
  };
}

/** Build the chapter before naming it: thesis → contribution gate → context → outcome. */
export function buildNarrativeChapterPlan(
  cluster: StoryArcCluster,
  allEvents: StoryEventRecord[] = cluster.events,
  threshold = CHAPTER_CONTRIBUTION_THRESHOLD,
): NarrativeChapterPlan {
  const core = dominantEvent(cluster);
  const windowStart = cluster.earliest.getTime() - 3 * 86_400_000;
  const windowEnd = cluster.latest.getTime() + 3 * 86_400_000;
  const candidates = allEvents.filter((event) => {
    const time = eventDate(event).getTime();
    return time >= windowStart && time <= windowEnd;
  });
  const contributions: ChapterContribution[] = candidates.map((event) => {
    const score = contributionToChapter(core, event);
    const inCluster = cluster.events.some((member) => member.id === event.id);
    const classification = looksLikeBackground(event) && score < 80
      ? 'background'
      : inCluster && score >= threshold
        ? 'supporting'
        : 'excluded';
    return { eventId: event.id, score, classification };
  });
  const byId = new Map(candidates.map((event) => [event.id, event]));
  const supportingEvents = contributions
    .filter((item) => item.classification === 'supporting')
    .map((item) => byId.get(item.eventId)!)
    .sort((a, b) => eventDate(a).getTime() - eventDate(b).getTime());
  if (supportingEvents.length === 0) supportingEvents.push(core);
  const backgroundEvents = contributions
    .filter((item) => item.classification === 'background')
    .map((item) => byId.get(item.eventId)!);
  const excludedEvents = contributions
    .filter((item) => item.classification === 'excluded')
    .map((item) => byId.get(item.eventId)!);
  const participants = [...new Set(supportingEvents.flatMap((event) => event.people))];
  const locations = [...new Set(supportingEvents.flatMap((event) => event.locations))];
  const dominantTheme = [...storyTerms(core)].slice(0, 3).join(' ') || 'Life chapter';
  const thesis = `This chapter tells the story of ${core.summary || core.title}.`;
  const outcomes = supportingEvents.slice(-2).map((event) => event.title);
  const quality = qualityForChapter(supportingEvents, candidates, contributions);

  return {
    thesis,
    dominantTheme,
    supportingEvents,
    backgroundEvents,
    excludedEvents,
    contributions,
    outcomes,
    participants,
    locations,
    confidence: Math.min(0.95, quality.overallStoryQuality / 100),
    quality,
  };
}

/**
 * Split a transitive semantic cluster into thesis-sized chapters. Events that
 * fail one chapter's contribution gate are reconsidered as a new dominant
 * story instead of disappearing from the user's life narrative.
 */
export function buildNarrativeChapterPlans(
  cluster: StoryArcCluster,
  allEvents: StoryEventRecord[] = cluster.events,
  threshold = CHAPTER_CONTRIBUTION_THRESHOLD,
): NarrativeChapterPlan[] {
  let remaining = [...cluster.events];
  const plans: NarrativeChapterPlan[] = [];

  while (remaining.length > 0) {
    const subcluster: StoryArcCluster = {
      events: remaining,
      earliest: new Date(Math.min(...remaining.map((event) => eventDate(event).getTime()))),
      latest: new Date(Math.max(...remaining.map((event) => eventDate(event).getTime()))),
      consolidationKey: clusterKey(remaining),
    };
    const plan = buildNarrativeChapterPlan(subcluster, allEvents, threshold);
    plans.push(plan);

    const consumed = new Set([
      ...plan.supportingEvents.map((event) => event.id),
      ...plan.backgroundEvents
        .filter((event) =>
          remaining.some((candidate) => candidate.id === event.id)
          && looksLikeDurableBackground(event),
        )
        .map((event) => event.id),
    ]);
    if (consumed.size === 0) consumed.add(remaining[0].id);
    remaining = remaining.filter((event) => !consumed.has(event.id));
  }

  return plans;
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
