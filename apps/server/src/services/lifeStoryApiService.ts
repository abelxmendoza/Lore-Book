/**
 * Life Story API — read-only projection of arc synthesis for HTTP surfaces.
 * No storage. Short in-memory cache to dedupe parallel panel requests.
 */
import {
  synthesizeLifeArcs,
  type EnrichedLifeArc,
  type LifeArcConflict,
  type LifeArcSynthesis,
} from './continuityRuntime/arcs/lifeArcSynthesisService';

export type LifeArcsApiResponse = {
  success: true;
  generatedAt: string;
  arcs: EnrichedLifeArc[];
  signalInventory: LifeArcSynthesis['signalInventory'];
  lifeDirection: LifeArcSynthesis['lifeDirection'];
};

export type CurrentChapterApiResponse = {
  success: true;
  generatedAt: string;
  chapter: {
    label: string;
    narrative: string;
    evidence: string[];
    provenance: {
      evidenceCount: number;
      episodes: EnrichedLifeArc['provenance']['episodes'];
      goals: EnrichedLifeArc['provenance']['goals'];
      projects: EnrichedLifeArc['provenance']['projects'];
      relationships: EnrichedLifeArc['provenance']['relationships'];
      events: EnrichedLifeArc['provenance']['events'];
      confidence: number;
    };
    dominantArcs: Array<{
      id: string;
      title: string;
      momentum: EnrichedLifeArc['momentum'];
      confidence: number;
    }>;
  };
};

export type LifeConflictsApiResponse = {
  success: true;
  generatedAt: string;
  conflicts: Array<
    LifeArcConflict & {
      provenance: {
        evidenceCount: number;
        goals: EnrichedLifeArc['provenance']['goals'];
        projects: EnrichedLifeArc['provenance']['projects'];
        relationships: EnrichedLifeArc['provenance']['relationships'];
        confidence: number;
      };
    }
  >;
};

export type MomentumItem = {
  id: string;
  title: string;
  category: EnrichedLifeArc['category'];
  momentum: EnrichedLifeArc['momentum'];
  score: number;
  confidence: number;
  evidenceCount: number;
  latestActivity: string | null;
  evidence: string[];
};

export type LifeMomentumApiResponse = {
  success: true;
  generatedAt: string;
  items: MomentumItem[];
  summary: {
    emerging: number;
    growing: number;
    stable: number;
    declining: number;
    completed: number;
  };
};

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { expires: number; synthesis: LifeArcSynthesis }>();
const inflight = new Map<string, Promise<LifeArcSynthesis>>();

async function getSynthesis(userId: string): Promise<LifeArcSynthesis> {
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && hit.expires > now) return hit.synthesis;

  let pending = inflight.get(userId);
  if (!pending) {
    pending = synthesizeLifeArcs(userId).then((synthesis) => {
      cache.set(userId, { expires: Date.now() + CACHE_TTL_MS, synthesis });
      inflight.delete(userId);
      return synthesis;
    });
    inflight.set(userId, pending);
  }
  return pending;
}

function mergeProvenance(arcs: EnrichedLifeArc[]): CurrentChapterApiResponse['chapter']['provenance'] {
  const episodes = arcs.flatMap((a) => a.provenance.episodes).slice(0, 10);
  const goals = arcs.flatMap((a) => a.provenance.goals).slice(0, 8);
  const projects = arcs.flatMap((a) => a.provenance.projects).slice(0, 8);
  const relationships = arcs.flatMap((a) => a.provenance.relationships).slice(0, 6);
  const events = arcs.flatMap((a) => a.provenance.events).slice(0, 8);
  const evidenceCount =
    episodes.length + goals.length + projects.length + relationships.length + events.length;
  const confidence =
    arcs.length > 0
      ? Math.min(1, arcs.reduce((s, a) => s + a.provenance.confidence, 0) / arcs.length)
      : 0;
  return { evidenceCount, episodes, goals, projects, relationships, events, confidence };
}

function dominantArcs(synthesis: LifeArcSynthesis): EnrichedLifeArc[] {
  return synthesis.enrichedArcs
    .filter((a) => a.momentum === 'growing' || a.momentum === 'emerging' || a.momentum === 'stable')
    .slice(0, 3);
}

function enrichConflict(
  conflict: LifeArcConflict,
  synthesis: LifeArcSynthesis
): LifeConflictsApiResponse['conflicts'][number] {
  const arcByTitle = new Map(synthesis.enrichedArcs.map((a) => [a.title, a]));
  const relatedArcs = conflict.evidence
    .map((label) => arcByTitle.get(label))
    .filter((a): a is EnrichedLifeArc => Boolean(a));

  const goals = synthesis.enrichedArcs.flatMap((a) => a.provenance.goals).slice(0, 6);
  const projects = relatedArcs.flatMap((a) => a.provenance.projects).slice(0, 4);
  const relationships = relatedArcs.flatMap((a) => a.provenance.relationships).slice(0, 4);
  const evidenceCount = conflict.evidence.length + goals.length + projects.length + relationships.length;
  const confidence =
    relatedArcs.length > 0
      ? relatedArcs.reduce((s, a) => s + a.provenance.confidence, 0) / relatedArcs.length
      : 0.5;

  return {
    ...conflict,
    provenance: { evidenceCount, goals, projects, relationships, confidence },
  };
}

export async function getLifeArcsResponse(userId: string): Promise<LifeArcsApiResponse> {
  const synthesis = await getSynthesis(userId);
  return {
    success: true,
    generatedAt: synthesis.generatedAt,
    arcs: synthesis.enrichedArcs,
    signalInventory: synthesis.signalInventory,
    lifeDirection: synthesis.lifeDirection,
  };
}

export async function getCurrentChapterResponse(userId: string): Promise<CurrentChapterApiResponse> {
  const synthesis = await getSynthesis(userId);
  const dominant = dominantArcs(synthesis);
  return {
    success: true,
    generatedAt: synthesis.generatedAt,
    chapter: {
      ...synthesis.currentChapter,
      provenance: mergeProvenance(dominant),
      dominantArcs: dominant.map((a) => ({
        id: a.id,
        title: a.title,
        momentum: a.momentum,
        confidence: a.provenance.confidence,
      })),
    },
  };
}

export async function getLifeConflictsResponse(userId: string): Promise<LifeConflictsApiResponse> {
  const synthesis = await getSynthesis(userId);
  return {
    success: true,
    generatedAt: synthesis.generatedAt,
    conflicts: synthesis.conflicts.map((c) => enrichConflict(c, synthesis)),
  };
}

export async function getLifeMomentumResponse(userId: string): Promise<LifeMomentumApiResponse> {
  const synthesis = await getSynthesis(userId);
  const items: MomentumItem[] = synthesis.enrichedArcs.map((a) => ({
    id: a.id,
    title: a.title,
    category: a.category,
    momentum: a.momentum,
    score: a.score,
    confidence: a.provenance.confidence,
    evidenceCount: a.provenance.evidenceCount,
    latestActivity: a.latestActivity,
    evidence: a.evidence,
  }));
  const summary = {
    emerging: items.filter((i) => i.momentum === 'emerging').length,
    growing: items.filter((i) => i.momentum === 'growing').length,
    stable: items.filter((i) => i.momentum === 'stable').length,
    declining: items.filter((i) => i.momentum === 'declining').length,
    completed: items.filter((i) => i.momentum === 'completed').length,
  };
  return { success: true, generatedAt: synthesis.generatedAt, items, summary };
}

/** Test helper — bust per-user cache */
export function clearLifeStoryCache(userId?: string): void {
  if (userId) {
    cache.delete(userId);
    inflight.delete(userId);
  } else {
    cache.clear();
    inflight.clear();
  }
}

export const lifeStoryApiService = {
  getLifeArcsResponse,
  getCurrentChapterResponse,
  getLifeConflictsResponse,
  getLifeMomentumResponse,
  clearLifeStoryCache,
};
