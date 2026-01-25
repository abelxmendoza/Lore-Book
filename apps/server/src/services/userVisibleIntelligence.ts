/**
 * User-Visible Intelligence — Phase 4
 * Turns temporal_edges, phases, scopes, and insights into human-readable explanations:
 * relationship narratives, era summaries, pattern surfacing, life diff, and life summary.
 */

import { supabaseAdmin } from './supabaseClient';
import { getRelationshipsInRange, getPreviousWindow } from './temporalRelationshipQueries';
import { generateRelationshipInsights } from '../er/relationshipInsights';
import type { RelationshipInsight } from '../er/relationshipInsights';

// --- Types ---

export type RelationshipNarrative = {
  edge_id: string;
  to_entity_name: string;
  scope: string;
  phase: string;
  sentence: string;
};

export type EraSummary = {
  dominant_scopes: string[];
  defining_people: { id: string; name: string }[];
  narrative: string;
};

export type LifeDiff = {
  new_relationships: { to_entity_id: string; scope: string }[];
  ended_relationships: { to_entity_id: string; scope: string }[];
  phase_changes: { to_entity_id: string; scope: string; from_phase: string; to_phase: string }[];
};

export type LifeSummary = {
  headline: string;
  key_changes: LifeDiff;
  insights: RelationshipInsight[];
  pattern_insights: PatternInsight[];
  narrative: string;
};

export type PatternInsight = {
  type: string;
  description: string;
  entity_ids?: string[];
  scope?: string;
};

/** Edge with at least to_entity_id and to_entity_type; used for name resolution input. */
export type EdgeWithIds = {
  to_entity_id: string;
  to_entity_type?: 'character' | 'omega_entity';
  [k: string]: unknown;
};

/** EdgeWithIds with to_entity_name attached. */
export type EdgeWithName = EdgeWithIds & { to_entity_name: string };

// --- Entity name resolution ---

/**
 * Resolve to_entity_name for edges using characters.name and omega_entities.primary_name.
 * Fallback "Someone" when not found.
 */
export async function resolveEntityNamesForEdges<T extends EdgeWithIds>(
  userId: string,
  edges: T[]
): Promise<(T & { to_entity_name: string })[]> {
  const charIds = [...new Set(edges.filter((e) => e.to_entity_type === 'character' && e.to_entity_id).map((e) => e.to_entity_id))];
  const omegaIds = [...new Set(edges.filter((e) => e.to_entity_type === 'omega_entity' && e.to_entity_id).map((e) => e.to_entity_id))];

  const nameById = new Map<string, string>();

  if (charIds.length > 0) {
    const { data: rows } = await supabaseAdmin
      .from('characters')
      .select('id, name')
      .eq('user_id', userId)
      .in('id', charIds);
    for (const r of rows || []) nameById.set(r.id, r.name ?? 'Someone');
  }

  if (omegaIds.length > 0) {
    const { data: rows } = await supabaseAdmin
      .from('omega_entities')
      .select('id, primary_name')
      .eq('user_id', userId)
      .in('id', omegaIds);
    for (const r of rows || []) nameById.set(r.id, r.primary_name ?? 'Someone');
  }

  return edges.map((edge) => {
    const ty = edge.to_entity_type;
    const name = ty === 'character' || ty === 'omega_entity'
      ? (nameById.get(edge.to_entity_id) ?? 'Someone')
      : 'Someone';
    return { ...edge, to_entity_name: name } as T & { to_entity_name: string };
  });
}

// --- Narrative and era logic ---

const PHASE_SENTENCES: Record<string, (name: string) => string> = {
  CORE: (n) => `Your relationship with ${n} has been a stable, central part of your life.`,
  ACTIVE: (n) => `You and ${n} have an active, ongoing connection.`,
  WEAK: (n) => `Your connection with ${n} has weakened lately.`,
  DORMANT: (n) => `Your relationship with ${n} is dormant, with little recent contact.`,
  ENDED: (n) => `Your relationship with ${n} has ended.`,
};

/**
 * One short sentence for the edge's current phase, using to_entity_name.
 */
export function generateRelationshipNarrative(edge: EdgeWithName & { id?: string }): RelationshipNarrative {
  const phase = (edge.phase as string) || 'ACTIVE';
  const fn = PHASE_SENTENCES[phase] ?? PHASE_SENTENCES.ACTIVE;
  return {
    edge_id: (edge.id as string) ?? '',
    to_entity_name: edge.to_entity_name,
    scope: (edge.scope as string) ?? 'global',
    phase,
    sentence: fn(edge.to_entity_name),
  };
}

/**
 * Short paragraph from scope and phase counts. Rule-based, no LLM.
 */
export function generateEraNarrative(
  byScope: Record<string, number>,
  byPhase: Record<string, number>
): string {
  const parts: string[] = [];
  const scopeEntries = Object.entries(byScope).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const total = scopeEntries.reduce((s, [, n]) => s + n, 0);
  if (total === 0) return 'No relationship data in this period.';

  const [topScope, topCount] = scopeEntries[0] ?? ['', 0];
  if (topCount > total * 0.6) {
    const label = topScope === 'global' ? 'general life' : topScope;
    parts.push(`This era was heavily centered on ${label}.`);
  } else if (scopeEntries.length >= 2) {
    const labels = scopeEntries.slice(0, 3).map(([s]) => (s === 'global' ? 'general' : s));
    parts.push(`${labels.join(', ')} were defining during this period.`);
  }

  const core = byPhase.CORE ?? 0;
  const active = byPhase.ACTIVE ?? 0;
  if (core + active >= 3) parts.push('Several relationships remained central.');
  if ((byPhase.WEAK ?? 0) >= 2) parts.push('A number of connections weakened during this time.');

  return parts.length > 0 ? parts.join(' ') : 'Your relationships in this period reflect a mix of scopes and phases.';
}

/**
 * dominant_scopes (top 2–3 by count), defining_people (CORE/ACTIVE, deduped, top 10), narrative.
 */
export function summarizeEra(edges: EdgeWithName[], _start: string, _end: string): EraSummary {
  const byScope: Record<string, number> = {};
  const byPhase: Record<string, number> = {};
  const peopleMap = new Map<string, string>();

  for (const e of edges) {
    const sc = (e.scope as string) ?? 'global';
    byScope[sc] = (byScope[sc] ?? 0) + 1;
    const ph = (e.phase as string) ?? 'ACTIVE';
    byPhase[ph] = (byPhase[ph] ?? 0) + 1;
    if ((ph === 'CORE' || ph === 'ACTIVE') && e.to_entity_id && e.to_entity_name)
      peopleMap.set(e.to_entity_id, e.to_entity_name);
  }

  const dominant_scopes = Object.entries(byScope)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([s]) => s);

  const defining_people = [...peopleMap.entries()].slice(0, 10).map(([id, name]) => ({ id, name }));

  const narrative = generateEraNarrative(byScope, byPhase);

  return { dominant_scopes, defining_people, narrative };
}

// --- Pattern surfacing and life diff ---

/**
 * relationship_snapshots has no history of phase over time. Always false until we add snapshot history.
 */
export function hasRepeatedFadeAndReturn(_snapshots: unknown[]): boolean {
  return false;
}

/**
 * Rule-based patterns: SCOPE_IMBALANCE (>60% in one scope), MANY_WEAK (>=3 WEAK in a scope).
 */
export function detectRelationshipPatterns(edges: EdgeWithIds[]): PatternInsight[] {
  const out: PatternInsight[] = [];
  const total = edges.length;
  if (total === 0) return out;

  const byScope: Record<string, EdgeWithIds[]> = {};
  for (const e of edges) {
    const sc = (e.scope as string) ?? 'global';
    if (!byScope[sc]) byScope[sc] = [];
    byScope[sc].push(e);
  }

  for (const [scope, list] of Object.entries(byScope)) {
    if (list.length > total * 0.6) {
      const label = scope === 'global' ? 'general life' : scope;
      out.push({
        type: 'SCOPE_IMBALANCE',
        description: `Over 60% of your relationships in this period are in ${label}.`,
        scope,
      });
    }
    const weak = list.filter((e) => (e.phase as string) === 'WEAK');
    if (weak.length >= 3) {
      out.push({
        type: 'MANY_WEAK',
        description: `Several connections in ${scope === 'global' ? 'general' : scope} have weakened.`,
        scope,
        entity_ids: weak.map((e) => e.to_entity_id).filter(Boolean),
      });
    }
  }

  return out;
}

/**
 * Phase changes between before and after. Identity: (to_entity_id, scope).
 */
export function detectPhaseChanges(
  before: EdgeWithIds[],
  after: EdgeWithIds[]
): LifeDiff['phase_changes'] {
  const key = (e: EdgeWithIds) => `${e.to_entity_id}:${(e.scope as string) ?? 'global'}`;
  const afterMap = new Map<string, EdgeWithIds>();
  for (const e of after) afterMap.set(key(e), e);

  const out: LifeDiff['phase_changes'] = [];
  for (const b of before) {
    const k = key(b);
    const a = afterMap.get(k);
    if (!a || (b.phase as string) === (a.phase as string)) continue;
    out.push({
      to_entity_id: b.to_entity_id,
      scope: (b.scope as string) ?? 'global',
      from_phase: (b.phase as string) ?? 'ACTIVE',
      to_phase: (a.phase as string) ?? 'ACTIVE',
    });
  }
  return out;
}

/**
 * new_relationships (in after not before), ended_relationships (in before not after), phase_changes.
 * Identity: (to_entity_id, scope).
 */
export function diffLifeState(before: EdgeWithIds[], after: EdgeWithIds[]): LifeDiff {
  const key = (e: EdgeWithIds) => `${e.to_entity_id}:${(e.scope as string) ?? 'global'}`;
  const beforeSet = new Set(before.map(key));
  const afterSet = new Set(after.map(key));

  const new_relationships = after.filter((e) => !beforeSet.has(key(e))).map((e) => ({
    to_entity_id: e.to_entity_id,
    scope: (e.scope as string) ?? 'global',
  }));
  const ended_relationships = before.filter((e) => !afterSet.has(key(e))).map((e) => ({
    to_entity_id: e.to_entity_id,
    scope: (e.scope as string) ?? 'global',
  }));
  const phase_changes = detectPhaseChanges(before, after);

  return { new_relationships, ended_relationships, phase_changes };
}

// --- Life summary ---

/**
 * Weekly/monthly life summary: current vs previous window, diff, insights, era narrative.
 */
export async function generateLifeSummary(userId: string, start: string, end: string): Promise<LifeSummary> {
  const current = await getRelationshipsInRange(userId, { start, end });
  const prev = getPreviousWindow({ start, end });
  const before = await getRelationshipsInRange(userId, prev);

  const currentEdges = (current.edges ?? []) as EdgeWithIds[];
  const beforeEdges = (before.edges ?? []) as EdgeWithIds[];

  const resolved = await resolveEntityNamesForEdges(userId, currentEdges);
  const diff = diffLifeState(beforeEdges, currentEdges);
  const insights = generateRelationshipInsights(currentEdges);
  const pattern_insights = detectRelationshipPatterns(currentEdges);
  const era = summarizeEra(resolved, start, end);

  const narrative = era.narrative;
  let headline = narrative.split(/[.!?]/)[0]?.trim() || narrative;
  if (headline.length > 100) headline = headline.slice(0, 97) + '...';
  if (headline && !/\.$/.test(headline)) headline += '.';

  return {
    headline,
    key_changes: diff,
    insights,
    pattern_insights,
    narrative,
  };
}
