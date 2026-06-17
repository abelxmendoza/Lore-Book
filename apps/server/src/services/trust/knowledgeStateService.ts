/**
 * Phase 2 — assign KnowledgeState to entities per domain.
 */
import { supabaseAdmin } from '../supabaseClient';
import { normalizeNameKey } from '../../utils/nameNormalization';
import { buildMemoryCoverageAudit } from '../diagnostics/memoryCoverageAudit';
import type { EntityTrustRow, KnowledgeState, TrustDomain } from './trustTypes';

function defaultStateCounts(): Record<KnowledgeState, number> {
  return { known: 0, suggested: 0, unverified: 0, conflicted: 0, archived: 0 };
}

export async function classifyCharacterStates(userId: string): Promise<{
  entities: EntityTrustRow[];
  counts: Record<KnowledgeState, number>;
}> {
  const counts = defaultStateCounts();
  const entities: EntityTrustRow[] = [];

  const [{ data: chars }, { data: facts }, audit] = await Promise.all([
    supabaseAdmin.from('characters').select('id, name, status, metadata, importance_score').eq('user_id', userId),
    supabaseAdmin.from('entity_facts').select('entity_id').eq('user_id', userId).eq('entity_type', 'character'),
    buildMemoryCoverageAudit(userId),
  ]);

  const factCounts = new Map<string, number>();
  for (const f of facts ?? []) {
    factCounts.set(f.entity_id, (factCounts.get(f.entity_id) ?? 0) + 1);
  }

  const coverageById = new Map(audit.entities.filter((e) => e.type === 'character').map((e) => [e.id, e]));

  const byName = new Map<string, number>();
  for (const c of chars ?? []) {
    if (c.status === 'archived') continue;
    const key = normalizeNameKey(c.name);
    byName.set(key, (byName.get(key) ?? 0) + 1);
  }

  for (const row of chars ?? []) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (meta.is_self || meta.is_user) continue;

    let state: KnowledgeState = 'unverified';
    let reason = 'low evidence';

    if (row.status === 'archived') {
      state = 'archived';
      reason = 'archived';
    } else if (byName.get(normalizeNameKey(row.name))! > 1) {
      state = 'conflicted';
      reason = 'duplicate name';
    } else {
      const cov = coverageById.get(row.id);
      const evidence = factCounts.get(row.id) ?? cov?.evidence ?? 0;
      const score = cov?.coverageScore ?? 0;
      if (evidence >= 2 && score >= 50) {
        state = 'known';
        reason = 'evidence-backed profile';
      } else if (evidence === 0 && score === 0) {
        state = 'suggested';
        reason = 'mentioned, thin profile';
      }
    }

    counts[state] += 1;
    const cov = coverageById.get(row.id);
    entities.push({
      id: row.id,
      name: row.name,
      domain: 'characters',
      state,
      confidence: row.importance_score ?? cov?.coverageScore ?? 0,
      evidence_count: factCounts.get(row.id) ?? cov?.evidence ?? 0,
      coverage_score: cov?.coverageScore ?? 0,
      reason,
    });
  }

  return { entities, counts };
}

export async function classifyProjectStates(userId: string): Promise<{
  entities: EntityTrustRow[];
  counts: Record<KnowledgeState, number>;
}> {
  const counts = defaultStateCounts();
  const entities: EntityTrustRow[] = [];

  const [{ data: projects }, { data: suggestions }] = await Promise.all([
    supabaseAdmin.from('projects').select('id, name, status, importance_score').eq('user_id', userId),
    supabaseAdmin
      .from('project_suggestions')
      .select('id, name, confidence, status_row')
      .eq('user_id', userId)
      .eq('status_row', 'pending'),
  ]);

  for (const p of projects ?? []) {
    const state: KnowledgeState = p.status === 'abandoned' ? 'archived' : 'known';
    counts[state] += 1;
    entities.push({
      id: p.id,
      name: p.name,
      domain: 'projects',
      state,
      confidence: p.importance_score ?? 70,
      evidence_count: 1,
      coverage_score: state === 'known' ? 75 : 20,
    });
  }

  for (const s of suggestions ?? []) {
    counts.suggested += 1;
    entities.push({
      id: s.id,
      name: s.name,
      domain: 'projects',
      state: 'suggested',
      confidence: Number(s.confidence ?? 0.6) * 100,
      evidence_count: 0,
      coverage_score: 0,
      reason: 'pending suggestion',
    });
  }

  return { entities, counts };
}

async function classifySimpleEntities(
  userId: string,
  domain: TrustDomain,
  table: string,
  opts?: { archivedField?: string; archivedValue?: string; nameField?: string }
): Promise<{ entities: EntityTrustRow[]; counts: Record<KnowledgeState, number> }> {
  const counts = defaultStateCounts();
  const entities: EntityTrustRow[] = [];
  const nameField = opts?.nameField ?? 'name';

  const { data: rows } = await supabaseAdmin.from(table).select('*').eq('user_id', userId);

  for (const row of rows ?? []) {
    const r = row as Record<string, unknown>;
    const name = String(r[nameField] ?? r.title ?? r.id);
    let state: KnowledgeState = 'known';
    if (opts?.archivedField && r[opts.archivedField] === opts.archivedValue) {
      state = 'archived';
    }
    counts[state] += 1;
    entities.push({
      id: String(r.id),
      name,
      domain,
      state,
      confidence: Number(r.importance_score ?? 65),
      evidence_count: 1,
      coverage_score: state === 'known' ? 70 : 20,
    });
  }

  return { entities, counts };
}

export async function classifyLocationStates(userId: string) {
  const counts = defaultStateCounts();
  const entities: EntityTrustRow[] = [];

  const [{ data: locations }, { data: facts }] = await Promise.all([
    supabaseAdmin.from('locations').select('id, name, importance_score').eq('user_id', userId),
    supabaseAdmin.from('entity_facts').select('entity_id').eq('user_id', userId).eq('entity_type', 'location'),
  ]);

  const factCounts = new Map<string, number>();
  for (const f of facts ?? []) factCounts.set(f.entity_id, (factCounts.get(f.entity_id) ?? 0) + 1);

  for (const loc of locations ?? []) {
    const evidence = factCounts.get(loc.id) ?? 0;
    const state: KnowledgeState = evidence >= 1 ? 'known' : 'unverified';
    counts[state] += 1;
    entities.push({
      id: loc.id,
      name: loc.name,
      domain: 'locations',
      state,
      confidence: loc.importance_score ?? (evidence ? 70 : 35),
      evidence_count: evidence,
      coverage_score: evidence ? Math.min(100, 40 + evidence * 15) : 15,
      reason: evidence ? 'location facts on file' : 'place without evidence',
    });
  }

  return { entities, counts };
}

export async function classifySkillStates(userId: string) {
  const counts = defaultStateCounts();
  const entities: EntityTrustRow[] = [];

  const [{ data: skills }, { data: suggestions }] = await Promise.all([
    supabaseAdmin.from('skills').select('id, skill_name, proficiency_level').eq('user_id', userId),
    supabaseAdmin
      .from('skill_suggestions')
      .select('id, skill_name, confidence, status')
      .eq('user_id', userId)
      .eq('status', 'pending'),
  ]);

  for (const s of skills ?? []) {
    counts.known += 1;
    entities.push({
      id: s.id,
      name: s.skill_name,
      domain: 'skills',
      state: 'known',
      confidence: 75,
      evidence_count: 1,
      coverage_score: 70,
    });
  }

  for (const sug of suggestions ?? []) {
    counts.suggested += 1;
    entities.push({
      id: sug.id,
      name: sug.skill_name,
      domain: 'skills',
      state: 'suggested',
      confidence: Number(sug.confidence ?? 0.6) * 100,
      evidence_count: 0,
      coverage_score: 0,
      reason: 'pending skill suggestion',
    });
  }

  return { entities, counts };
}

export async function classifyEventStates(userId: string) {
  const counts = defaultStateCounts();
  const entities: EntityTrustRow[] = [];

  const [{ data: resolved }, { data: candidates }] = await Promise.all([
    supabaseAdmin.from('resolved_events').select('id, title').eq('user_id', userId),
    supabaseAdmin.from('event_candidates').select('id, canonical_title, timeline_candidate').eq('user_id', userId),
  ]);

  for (const e of resolved ?? []) {
    counts.known += 1;
    entities.push({
      id: e.id,
      name: e.title ?? 'Event',
      domain: 'events',
      state: 'known',
      confidence: 80,
      evidence_count: 1,
      coverage_score: 75,
    });
  }

  for (const c of candidates ?? []) {
    counts.suggested += 1;
    entities.push({
      id: c.id,
      name: c.canonical_title ?? 'Candidate event',
      domain: 'events',
      state: 'suggested',
      confidence: 50,
      evidence_count: 0,
      coverage_score: 25,
      reason: `candidate (${c.timeline_candidate ?? 'pending'})`,
    });
  }

  return { entities, counts };
}

export async function classifyAllDomainStates(userId: string): Promise<{
  byDomain: Partial<Record<TrustDomain, Record<KnowledgeState, number>>>;
  entities: EntityTrustRow[];
}> {
  const [
    characters,
    projects,
    locations,
    organizations,
    goals,
    skills,
    communities,
    relationships,
    events,
    households,
  ] = await Promise.all([
    classifyCharacterStates(userId),
    classifyProjectStates(userId),
    classifyLocationStates(userId),
    classifySimpleEntities(userId, 'organizations', 'organizations'),
    classifySimpleEntities(userId, 'goals', 'goals'),
    classifySkillStates(userId),
    classifySimpleEntities(userId, 'communities', 'social_communities', { nameField: 'theme' }),
    (async () => {
      const counts = defaultStateCounts();
      const entities: EntityTrustRow[] = [];
      const [{ data: rom }, { data: charRel }] = await Promise.all([
        supabaseAdmin.from('romantic_relationships').select('id, partner_name').eq('user_id', userId),
        supabaseAdmin.from('character_relationships').select('id, relationship_type').eq('user_id', userId),
      ]);
      for (const r of rom ?? []) {
        counts.known += 1;
        entities.push({
          id: r.id,
          name: r.partner_name ?? 'Relationship',
          domain: 'relationships',
          state: 'known',
          confidence: 80,
          evidence_count: 1,
          coverage_score: 75,
        });
      }
      for (const r of charRel ?? []) {
        counts.known += 1;
        entities.push({
          id: r.id,
          name: r.relationship_type ?? 'Character tie',
          domain: 'relationships',
          state: 'known',
          confidence: 75,
          evidence_count: 1,
          coverage_score: 70,
        });
      }
      return { entities, counts };
    })(),
    classifyEventStates(userId),
    (async () => {
      const counts = defaultStateCounts();
      const entities: EntityTrustRow[] = [];
      const { data: orgs } = await supabaseAdmin
        .from('organizations')
        .select('id, name, metadata')
        .eq('user_id', userId)
        .eq('type', 'family');
      const households = (orgs ?? []).filter(
        (o) =>
          (o.metadata as Record<string, unknown>)?.inference_source === 'household_residence' ||
          /household|house|home/i.test(o.name ?? '')
      );
      for (const h of households) {
        counts.known += 1;
        entities.push({
          id: h.id,
          name: h.name,
          domain: 'households',
          state: 'known',
          confidence: 70,
          evidence_count: 1,
          coverage_score: 65,
        });
      }
      return { entities, counts };
    })(),
  ]);

  const byDomain: Partial<Record<TrustDomain, Record<KnowledgeState, number>>> = {
    characters: characters.counts,
    locations: locations.counts,
    organizations: organizations.counts,
    projects: projects.counts,
    goals: goals.counts,
    skills: skills.counts,
    communities: communities.counts,
    relationships: relationships.counts,
    events: events.counts,
    households: households.counts,
  };

  return {
    byDomain,
    entities: [
      ...characters.entities,
      ...projects.entities,
      ...locations.entities,
      ...organizations.entities,
      ...goals.entities,
      ...skills.entities,
      ...communities.entities,
      ...relationships.entities,
      ...events.entities,
      ...households.entities,
    ],
  };
}

export function aggregateStateTotals(
  byDomain: Partial<Record<TrustDomain, Record<KnowledgeState, number>>>
): Record<KnowledgeState, number> {
  const totals = defaultStateCounts();
  for (const counts of Object.values(byDomain)) {
    if (!counts) continue;
    for (const k of Object.keys(totals) as KnowledgeState[]) {
      totals[k] += counts[k] ?? 0;
    }
  }
  return totals;
}
