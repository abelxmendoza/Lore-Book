/**
 * Attention Resolver — what currently occupies the user's mind, as a
 * weighted distribution over life domains rather than a single answer.
 */
import type { ActiveArc, AttentionDomain, AttentionState, PersonSalience } from './narrativeCognitionTypes';
import type { WorkContext } from '../work/workContextTypes';

const ARC_DOMAIN: Record<ActiveArc['kind'], AttentionDomain> = {
  job_onboarding: 'work',
  project_build: 'projects',
  relationship_healing: 'relationships',
  community_distance: 'social',
  financial_stability: 'work',
  social_confidence: 'social',
  health_fitness: 'health',
};

const SALIENCE_DOMAIN: Partial<Record<PersonSalience['category'], AttentionDomain>> = {
  family: 'family',
  partner_or_ex: 'relationships',
  coworker: 'work',
  friend: 'social',
  community: 'social',
};

export function resolveAttention(opts: {
  arcs: ActiveArc[];
  salience: PersonSalience[];
  work?: WorkContext | null;
}): AttentionState {
  const weights = new Map<AttentionDomain, number>();
  const items = new Map<AttentionDomain, Set<string>>();

  const add = (domain: AttentionDomain, weight: number, item?: string) => {
    weights.set(domain, (weights.get(domain) ?? 0) + weight);
    if (item) {
      if (!items.has(domain)) items.set(domain, new Set());
      items.get(domain)!.add(item);
    }
  };

  for (const arc of opts.arcs) {
    add(ARC_DOMAIN[arc.kind], arc.confidence, arc.title);
  }
  // A live current role keeps work in attention even without an explicit arc.
  if (opts.work?.currentRole?.status === 'current') {
    add('work', 0.5, opts.work.organization?.name ?? opts.work.currentRole.title);
  }
  for (const person of opts.salience.slice(0, 8)) {
    const domain = SALIENCE_DOMAIN[person.category];
    if (domain) add(domain, person.score * 0.4, person.name);
  }

  const total = [...weights.values()].reduce((sum, w) => sum + w, 0);
  const domains = [...weights.entries()]
    .map(([domain, weight]) => ({
      domain,
      weight: total > 0 ? Math.round((weight / total) * 100) / 100 : 0,
      items: [...(items.get(domain) ?? [])].slice(0, 4),
    }))
    .sort((a, b) => b.weight - a.weight);

  return { domains };
}
