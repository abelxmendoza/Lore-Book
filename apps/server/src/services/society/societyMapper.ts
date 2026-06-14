// =====================================================
// SOCIETY MAPPER (pure)
// Purpose: Given every context (conversation / journal entry) from a user's
//          history — already reduced to {members, signals, employer names} —
//          reproduce, deterministically and cheaply, what a human does when
//          reading all the threads:
//            • link an employer/agency/school to the people around it, ACROSS
//              sessions (the Kforce → Sam/Kelly case);
//            • cluster people who keep showing up together into social groups
//              and pick the right type (family / scene / band / ...);
//            • infer org↔org links ("hired me through Kforce for the Amazon job").
//
// No I/O — the orchestration service feeds it data and persists the results.
// =====================================================

import type { GroupType, MembershipModel, OrgRelationshipType, UserRelationship } from '../organizationService';
import { CoOccurrenceGraph } from './coOccurrenceGraph';
import { isPublicEntityName, type SignalCategory } from './signals';

export interface SocietyContext {
  contextId: string;
  members: Array<{ id: string; name: string }>;
  signals: SignalCategory[];
  employerNames: string[];
  publicEntityNames: string[];
  hiringPlacement: boolean;
  /** Narrow recruiting/staffing language present (recruiter, onboarding, hired…). */
  staffing: boolean;
  snippet: string;
}

export interface SocietyCluster {
  key: string;
  name?: string;
  group_type: GroupType;
  membership_model: MembershipModel;
  user_relationship: UserRelationship;
  is_public_entity: boolean;
  memberIds: string[];
  memberNames: string[];
  confidence: number;
  context: string;
  /** Up to a few evidence snippets (windows) that justify the cluster. */
  evidence: string[];
  metadata: Record<string, unknown>;
}

export interface SocietyAffiliation {
  fromName: string;
  toName: string;
  type: OrgRelationshipType;
  notes?: string;
}

export interface SocietyResult {
  clusters: SocietyCluster[];
  affiliations: SocietyAffiliation[];
}

const MAX_CLUSTERS = 25;
const MAX_MEMBERS = 30;

const CATEGORY_TO_GROUP_TYPE: Record<SignalCategory, GroupType> = {
  family: 'family',
  scene: 'scene',
  band: 'band',
  sports: 'sports_team',
  martial_arts: 'martial_arts',
  club: 'club',
  community: 'community',
  institution: 'institution',
  work: 'company',
};

function membershipFor(type: GroupType): MembershipModel {
  if (type === 'scene' || type === 'community') return 'fuzzy';
  if (type === 'public_entity') return 'none';
  return 'strict';
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function firstName(name: string): string {
  return name.split(' ')[0];
}

/** Deterministic name for an unnamed social cluster. */
function nameCluster(type: GroupType, names: string[]): string {
  const firsts = names.map(firstName).filter(Boolean);
  if (type === 'family') {
    const lasts = names.map(n => n.split(' ').slice(1).join(' ')).filter(Boolean);
    const surname = lasts.find(l => lasts.filter(x => x === l).length >= 2);
    if (surname) return `${surname} Family`;
    return firsts.length ? `${firsts.slice(0, 2).join(' & ')} Family` : 'Family';
  }
  const suffix: Partial<Record<GroupType, string>> = {
    scene: 'Scene', band: 'Project', sports_team: 'Squad', club: 'Club',
    community: 'Community', crew: 'Crew', collective: 'Collective',
    martial_arts: 'Dojo', institution: 'Institute',
  };
  const tail = suffix[type] ?? 'Circle';
  if (firsts.length >= 2) return `${firsts.slice(0, 2).join(' & ')} ${tail}`;
  if (firsts.length === 1) return `${firsts[0]}'s ${tail}`;
  return `New ${tail}`;
}

export function mapSociety(contexts: SocietyContext[]): SocietyResult {
  const nameById = new Map<string, string>();
  for (const ctx of contexts) for (const m of ctx.members) nameById.set(m.id, m.name);

  const clusters: SocietyCluster[] = [];
  const affiliations = new Map<string, SocietyAffiliation>();
  const claimed = new Set<string>(); // member ids captured by an employer cluster

  // ── 1. Employer / institution anchored clusters (cross-session) ────────────
  // Only NON-public employer names become member-bearing clusters. Famous
  // public entities (Amazon, Google, ...) are handled as workplaces via the
  // affiliation step — never as agencies whose roster we populate.
  const allEmployers = new Set<string>();
  for (const ctx of contexts) {
    for (const e of ctx.employerNames) {
      if (!isPublicEntityName(e)) allEmployers.add(e);
    }
  }

  // People mentioned alongside STAFFING/recruiting language — used to bridge an
  // agency to its people even when the agency name and the people appear in
  // DIFFERENT conversations, but only when there's a single unambiguous
  // employer. Narrow staffing language (recruiter/onboarding/hired) avoids
  // sweeping in anyone who merely showed up near a generic work word.
  const staffingMemberIds = new Set<string>();
  for (const ctx of contexts) {
    if (ctx.staffing) for (const m of ctx.members) staffingMemberIds.add(m.id);
  }
  const singleEmployer = allEmployers.size === 1;

  for (const employer of allEmployers) {
    const ctxs = contexts.filter(c => c.employerNames.includes(employer));
    const direct = new Set<string>();
    const categories = new Set<SignalCategory>();
    const evidence: string[] = [];
    for (const c of ctxs) {
      for (const m of c.members) direct.add(m.id);
      for (const s of c.signals) categories.add(s);
      if (c.snippet && evidence.length < 3) evidence.push(c.snippet);
    }
    const snippet = evidence[0] ?? '';
    const memberIds = singleEmployer ? new Set([...direct, ...staffingMemberIds]) : direct;

    const type: GroupType = categories.has('institution') ? 'institution' : 'company';
    const ids = [...memberIds].slice(0, MAX_MEMBERS);
    for (const id of ids) claimed.add(id);

    clusters.push({
      key: `society:employer:${hash(employer.toLowerCase())}`,
      name: employer,
      group_type: type,
      membership_model: 'fuzzy',
      user_relationship: type === 'institution' ? 'alumnus' : 'member',
      is_public_entity: false,
      memberIds: ids,
      memberNames: ids.map(id => nameById.get(id) ?? '').filter(Boolean),
      confidence: 0.9,
      context: snippet,
      evidence,
      metadata: { source: 'society_mapper', anchor: 'employer', employer },
    });

    // org↔org: agency placed the user at a public company.
    for (const c of ctxs) {
      if (!c.hiringPlacement) continue;
      for (const pub of c.publicEntityNames) {
        if (pub.toLowerCase() === employer.toLowerCase()) continue;
        const key = `${employer.toLowerCase()}->${pub.toLowerCase()}`;
        if (!affiliations.has(key)) {
          affiliations.set(key, {
            fromName: employer,
            toName: pub,
            type: 'affiliated_with',
            notes: `${employer} placed/hired the user in connection with ${pub}.`,
          });
        }
      }
    }
  }

  // ── 2. Co-occurrence social clusters ───────────────────────────────────────
  const graph = new CoOccurrenceGraph();
  for (const ctx of contexts) graph.addContext(ctx.members.map(m => m.id), ctx.contextId);

  for (const component of graph.communities()) {
    const ids = component.filter(id => nameById.has(id));
    if (ids.length < 2 || ids.length > 12) continue;

    // Skip components fully absorbed by an employer cluster.
    if (ids.every(id => claimed.has(id))) continue;

    // Density gate: only emit a community whose members are actually
    // interconnected. A real group is cohesive; a loose blob accidentally
    // bridged together is not, and we'd rather skip it than mislabel everyone.
    const possiblePairs = (ids.length * (ids.length - 1)) / 2;
    let presentPairs = 0;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (graph.edgeWeight(ids[i], ids[j]) >= 1) presentPairs += 1;
      }
    }
    const density = possiblePairs === 0 ? 0 : presentPairs / possiblePairs;
    if (ids.length > 2 && density < 0.5) continue;

    // Type the cluster from the signals of the windows where these people
    // actually co-appear (>= 2 of them in the same window).
    const sharedContexts = contexts.filter(c => c.members.filter(m => ids.includes(m.id)).length >= 2);
    const sharedSignals = new Set<SignalCategory>();
    for (const c of sharedContexts) for (const s of c.signals) sharedSignals.add(s);

    const hasRepeatPair = ids.some((a, i) => ids.slice(i + 1).some(b => graph.edgeWeight(a, b) >= 2));
    const typeSignal = (['family', 'scene', 'band', 'sports', 'martial_arts', 'club', 'community'] as SignalCategory[])
      .find(s => sharedSignals.has(s));

    const type: GroupType = typeSignal ? CATEGORY_TO_GROUP_TYPE[typeSignal] : 'friend_group';
    const names = ids.map(id => nameById.get(id) ?? '').filter(Boolean);
    const evidence = sharedContexts.map(c => c.snippet).filter(Boolean).slice(0, 3);
    const snippet = evidence[0] ?? '';

    clusters.push({
      key: `society:cluster:${hash([...ids].sort().join('|'))}`,
      name: nameCluster(type, names),
      group_type: type,
      membership_model: membershipFor(type),
      user_relationship: 'member',
      is_public_entity: false,
      memberIds: ids.slice(0, MAX_MEMBERS),
      memberNames: names.slice(0, MAX_MEMBERS),
      // Social clusters surface for review rather than auto-create.
      confidence: hasRepeatPair && typeSignal ? 0.82 : 0.7,
      context: snippet,
      evidence,
      metadata: { source: 'society_mapper', anchor: 'co_occurrence', signals: [...sharedSignals] },
    });
  }

  clusters.sort((a, b) => b.confidence - a.confidence);
  return { clusters: clusters.slice(0, MAX_CLUSTERS), affiliations: [...affiliations.values()] };
}
