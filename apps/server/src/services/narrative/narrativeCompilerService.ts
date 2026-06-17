/**
 * Narrative Compiler — orchestrates arc synthesis, chapter compilation, turning points, scenes.
 * Output: NarrativeIR consumed by all story surfaces.
 */
import { synthesizeLifeArcs, type EnrichedLifeArc } from '../continuityRuntime/arcs/lifeArcSynthesisService';
import { supabaseAdmin } from '../supabaseClient';
import { compileChapter } from './chapterCompilerService';
import { detectScenes } from './sceneDetectionService';
import { detectTurningPoints } from './turningPointDetectionService';
import type {
  ArcMomentum,
  ArcStatus,
  NarrativeArc,
  NarrativeCommunity,
  NarrativeEvidence,
  NarrativeGoal,
  NarrativeIR,
  NarrativeProject,
  NarrativeRelationship,
  TimelineEntry,
} from './types';

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { at: number; ir: NarrativeIR }>();

function mapMomentum(m: EnrichedLifeArc['momentum']): ArcMomentum {
  if (m === 'growing' || m === 'emerging') return 'positive';
  if (m === 'declining') return 'negative';
  return 'neutral';
}

function mapStatus(arc: EnrichedLifeArc): ArcStatus {
  switch (arc.momentum) {
    case 'emerging': return 'emerging';
    case 'growing': return 'growing';
    case 'stable': return arc.score >= 0.6 ? 'active' : 'plateaued';
    case 'declining': return 'declining';
    case 'completed': return 'completed';
    default: return 'active';
  }
}

function arcToNarrative(arc: EnrichedLifeArc, storyState: 'compiled' | 'confirmed' | 'draft'): NarrativeArc {
  const evidence: NarrativeEvidence[] = [];
  let i = 0;
  const pushRef = (label: string, source: string, date?: string | null) => {
    evidence.push({
      id: `${arc.id}-ev-${i++}`,
      label,
      source,
      date,
      confidence: arc.provenance.confidence,
      storyState,
    });
  };
  for (const r of arc.provenance.episodes) pushRef(r.label, 'episode', r.date);
  for (const r of arc.provenance.goals) pushRef(r.label, 'goal', r.date);
  for (const r of arc.provenance.projects) pushRef(r.label, 'project', r.date);
  for (const r of arc.provenance.relationships) pushRef(r.label, 'relationship', r.date);
  for (const r of arc.provenance.events) pushRef(r.label, 'event', r.date);
  for (const e of arc.evidence.slice(0, 5)) pushRef(e, 'signal');

  return {
    id: arc.id,
    title: arc.title,
    category: arc.category,
    status: mapStatus(arc),
    momentum: mapMomentum(arc.momentum),
    confidence: arc.provenance.confidence,
    score: arc.score,
    evidence,
    storyState,
    startDate: arc.startDate,
    latestActivity: arc.latestActivity,
  };
}

async function loadGoals(userId: string): Promise<NarrativeGoal[]> {
  const { data } = await supabaseAdmin
    .from('goals')
    .select('id, title, status')
    .eq('user_id', userId)
    .limit(30);
  return (data ?? []).map((g) => ({ id: g.id, title: g.title, status: g.status ?? 'active' }));
}

async function loadProjects(userId: string): Promise<NarrativeProject[]> {
  const { data } = await supabaseAdmin
    .from('organizations')
    .select('id, name, type')
    .eq('user_id', userId)
    .limit(30);
  return (data ?? []).map((p) => ({ id: p.id, name: p.name, type: p.type ?? 'project' }));
}

async function loadRelationships(userId: string): Promise<NarrativeRelationship[]> {
  const { data } = await supabaseAdmin
    .from('characters')
    .select('id, name, metadata')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(25);
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    role: String((c.metadata as Record<string, unknown>)?.kinship_role ?? 'connection'),
    confidence: Number((c.metadata as Record<string, unknown>)?.influence_score ?? 0.5),
  }));
}

async function loadCommunities(userId: string): Promise<NarrativeCommunity[]> {
  const { data } = await supabaseAdmin
    .from('organizations')
    .select('id, name')
    .eq('user_id', userId)
    .or('type.eq.family,name.ilike.%goth%,name.ilike.%household%')
    .limit(20)
    .then((r) => r)
    .catch(() => ({ data: [] as Array<{ id: string; name: string }> }));
  return (data ?? []).map((c) => ({ id: c.id, name: c.name }));
}

async function loadFamilySummary(userId: string): Promise<NarrativeIR['family']> {
  const [{ data: households }, { count: memberCount }, { data: familyGroups }] = await Promise.all([
    supabaseAdmin.from('households').select('id, name').eq('user_id', userId).limit(20).catch(() => ({ data: [] })),
    supabaseAdmin.from('characters').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabaseAdmin
      .from('organizations')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'family')
      .limit(50)
      .catch(() => ({ data: [] })),
  ]);
  return {
    householdCount: households?.length ?? 0,
    memberCount: memberCount ?? 0,
    groupCount: familyGroups?.length ?? 0,
    headOfHousehold: households?.[0]?.name ?? null,
  };
}

function buildTimeline(
  turningPoints: NarrativeIR['turningPoints'],
  arcs: NarrativeArc[]
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const tp of turningPoints) {
    if (!tp.date) continue;
    entries.push({ date: tp.date, label: tp.title, source: 'turning_point', confidence: tp.confidence });
  }
  for (const arc of arcs) {
    if (arc.latestActivity) {
      entries.push({ date: arc.latestActivity, label: arc.title, source: 'arc', confidence: arc.confidence });
    }
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40);
}

export async function compileNarrativeIR(userId: string, opts?: { bypassCache?: boolean }): Promise<NarrativeIR> {
  const cached = cache.get(userId);
  if (!opts?.bypassCache && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.ir;
  }

  const synthesis = await synthesizeLifeArcs(userId);
  const chapter = compileChapter(synthesis);
  const turningPoints = await detectTurningPoints(userId, synthesis.enrichedArcs);
  const scenes = detectScenes(synthesis.enrichedArcs);

  const activeArcs = synthesis.enrichedArcs
    .filter((a) => a.momentum !== 'completed' && a.momentum !== 'declining')
    .map((a) => arcToNarrative(a, 'compiled'));
  const dormantArcs = synthesis.enrichedArcs
    .filter((a) => a.momentum === 'completed' || a.momentum === 'declining')
    .map((a) => arcToNarrative(a, 'archived'));

  const [goals, projects, relationships, communities, family] = await Promise.all([
    loadGoals(userId),
    loadProjects(userId),
    loadRelationships(userId),
    loadCommunities(userId),
    loadFamilySummary(userId),
  ]);

  const evidence = [
    ...chapter.evidence,
    ...activeArcs.flatMap((a) => a.evidence),
    ...turningPoints.flatMap((t) => t.evidence),
  ].slice(0, 50);

  const avgConfidence =
    activeArcs.length > 0
      ? activeArcs.reduce((s, a) => s + a.confidence, 0) / activeArcs.length
      : chapter.confidence;

  const ir: NarrativeIR = {
    generatedAt: new Date().toISOString(),
    currentChapter: chapter,
    activeArcs,
    dormantArcs,
    conflicts: synthesis.conflicts,
    goals,
    projects,
    relationships,
    communities,
    turningPoints,
    scenes,
    timeline: buildTimeline(turningPoints, activeArcs),
    family,
    evidence,
    provenance: {
      confidence: Math.round(avgConfidence * 100) / 100,
      signalInventory: synthesis.signalInventory as Record<string, number>,
      why: `Compiled from ${activeArcs.length} active arcs, ${turningPoints.length} turning points, ${evidence.length} evidence refs`,
    },
  };

  cache.set(userId, { at: Date.now(), ir });
  return ir;
}

export function clearNarrativeCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}

export const narrativeCompilerService = { compile: compileNarrativeIR, clearCache: clearNarrativeCache };
