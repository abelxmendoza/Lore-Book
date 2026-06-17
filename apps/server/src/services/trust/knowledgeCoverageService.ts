/**
 * Phase 1 — per-domain knowledge coverage audit.
 */
import { supabaseAdmin } from '../supabaseClient';
import type {
  ConfidenceBucket,
  ConfidenceDistribution,
  DomainCoverageMetrics,
  KnowledgeState,
  TrustDomain,
} from './trustTypes';
import { TRUST_DOMAINS } from './trustTypes';

function emptyDistribution(): ConfidenceDistribution {
  return { high: 0, medium: 0, low: 0, none: 0 };
}

function bucketConfidence(score: number): ConfidenceBucket {
  if (score >= 76) return 'high';
  if (score >= 51) return 'medium';
  if (score >= 1) return 'low';
  return 'none';
}

function scoreFromEvidence(evidence: number, entityCount: number): number {
  if (entityCount === 0) return 0;
  const avg = evidence / entityCount;
  return Math.min(100, Math.round(avg * 25));
}

function statesFromCounts(counts: {
  known: number;
  suggested: number;
  unverified: number;
  conflicted: number;
  archived: number;
}): Record<KnowledgeState, number> {
  return { ...counts };
}

async function countEvidence(userId: string, table: string, filter?: Record<string, string>): Promise<number> {
  let q = supabaseAdmin.from(table).select('id', { count: 'exact', head: true }).eq('user_id', userId);
  for (const [k, v] of Object.entries(filter ?? {})) {
    q = q.eq(k, v);
  }
  const { count } = await q;
  return count ?? 0;
}

export async function auditDomainCoverage(
  userId: string,
  domain: TrustDomain,
  stateCounts?: Record<KnowledgeState, number>
): Promise<DomainCoverageMetrics> {
  const states = stateCounts ?? {
    known: 0,
    suggested: 0,
    unverified: 0,
    conflicted: 0,
    archived: 0,
  };
  const confidence_distribution = emptyDistribution();
  let entity_count = 0;
  let evidence_count = 0;
  let coverage_score = 0;

  switch (domain) {
    case 'characters': {
      const [{ count: total }, { count: facts }, { count: archived }] = await Promise.all([
        supabaseAdmin.from('characters').select('id', { count: 'exact', head: true }).eq('user_id', userId).neq('status', 'archived'),
        supabaseAdmin.from('entity_facts').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('entity_type', 'character'),
        supabaseAdmin.from('characters').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'archived'),
      ]);
      entity_count = total ?? 0;
      evidence_count = facts ?? 0;
      states.archived = archived ?? 0;
      coverage_score = entity_count ? Math.min(100, Math.round((evidence_count / entity_count) * 40 + 30)) : 0;
      break;
    }
    case 'locations': {
      const [{ count: locs }, { count: facts }] = await Promise.all([
        supabaseAdmin.from('locations').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabaseAdmin.from('entity_facts').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('entity_type', 'location'),
      ]);
      entity_count = locs ?? 0;
      evidence_count = facts ?? 0;
      coverage_score = scoreFromEvidence(evidence_count, entity_count || 1);
      break;
    }
    case 'organizations': {
      const { count } = await supabaseAdmin.from('organizations').select('id', { count: 'exact', head: true }).eq('user_id', userId);
      entity_count = count ?? 0;
      evidence_count = await countEvidence(userId, 'entity_facts', { entity_type: 'organization' });
      coverage_score = scoreFromEvidence(evidence_count, entity_count || 1);
      break;
    }
    case 'projects': {
      const [{ count: projects }, { count: suggestions }] = await Promise.all([
        supabaseAdmin.from('projects').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabaseAdmin.from('project_suggestions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status_row', 'pending'),
      ]);
      entity_count = projects ?? 0;
      evidence_count = suggestions ?? 0;
      coverage_score = entity_count ? Math.min(100, 50 + Math.round(entity_count * 5)) : 0;
      break;
    }
    case 'goals': {
      const { count } = await supabaseAdmin.from('goals').select('id', { count: 'exact', head: true }).eq('user_id', userId);
      entity_count = count ?? 0;
      coverage_score = entity_count ? 60 : 0;
      break;
    }
    case 'skills': {
      const [{ count: skills }, { count: pending }] = await Promise.all([
        supabaseAdmin.from('skills').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabaseAdmin.from('skill_suggestions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'pending'),
      ]);
      entity_count = skills ?? 0;
      evidence_count = pending ?? 0;
      coverage_score = entity_count ? Math.min(100, 45 + entity_count * 4) : 0;
      break;
    }
    case 'communities': {
      const { count } = await supabaseAdmin
        .from('social_communities')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      entity_count = count ?? 0;
      coverage_score = entity_count ? 55 : 0;
      break;
    }
    case 'relationships': {
      const [{ count: rom }, { count: charRel }] = await Promise.all([
        supabaseAdmin.from('romantic_relationships').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabaseAdmin.from('character_relationships').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      ]);
      entity_count = (rom ?? 0) + (charRel ?? 0);
      evidence_count = rom ?? 0;
      coverage_score = entity_count ? Math.min(100, 40 + entity_count * 8) : 0;
      break;
    }
    case 'events': {
      const [{ count: events }, { count: candidates }] = await Promise.all([
        supabaseAdmin.from('resolved_events').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabaseAdmin.from('event_candidates').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      ]);
      entity_count = (events ?? 0) + (candidates ?? 0);
      evidence_count = events ?? 0;
      coverage_score = events ? Math.min(100, 35 + (events ?? 0) * 2) : 0;
      break;
    }
    case 'households': {
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
      entity_count = households.length;
      coverage_score = entity_count ? 50 + households.length * 10 : 0;
      break;
    }
  }

  const bucket = bucketConfidence(coverage_score);
  confidence_distribution[bucket] = entity_count;

  return {
    domain,
    entity_count,
    evidence_count,
    confidence_distribution,
    coverage_score,
    states: statesFromCounts(states),
  };
}

export async function auditAllDomainCoverage(
  userId: string,
  stateByDomain?: Partial<Record<TrustDomain, Record<KnowledgeState, number>>>
): Promise<DomainCoverageMetrics[]> {
  const results: DomainCoverageMetrics[] = [];
  for (const domain of TRUST_DOMAINS) {
    results.push(await auditDomainCoverage(userId, domain, stateByDomain?.[domain]));
  }
  return results;
}
