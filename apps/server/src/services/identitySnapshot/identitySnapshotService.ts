import { createHash } from 'crypto';

import { logger } from '../../logger';
import { biographyFoundationService, type BiographyOutput } from '../biographyFoundationService';
import { evaluateWrongDomain } from '../characters/audit/wrongDomainCharacterGuard';
import {
  getLivingBiographyCard,
  type LivingBiographyCard,
} from '../livingBiographyService';
import { compileNarrativeIR } from '../narrative/narrativeCompilerService';
import type { NarrativeArc, NarrativeIR } from '../narrative/types';
import { projectService, type ProjectRow } from '../projectService';
import { skillService, type Skill } from '../skills/skillService';

import type {
  IdentityCoverage,
  IdentityDomain,
  IdentityEvidenceRef,
  IdentityMomentum,
  IdentitySnapshot,
  IdentityStability,
  IdentityThread,
  IdentityTrajectory,
} from './identitySnapshotTypes';

const ALGORITHM_VERSION = 'identity-snapshot-v1';
const CACHE_TTL_MS = 60_000;
const snapshotCache = new Map<string, { at: number; snapshot: IdentitySnapshot }>();

export type IdentitySnapshotInputs = {
  userId: string;
  generatedAt: string;
  biography: BiographyOutput | null;
  card: LivingBiographyCard;
  narrative: NarrativeIR | null;
  projects: ProjectRow[];
  skills: Skill[];
};

const DOMAIN_PATTERNS: Record<IdentityDomain, RegExp> = {
  career: /\b(career|job|work|engineer|engineering|robot|robotics|technical|professional|interview|employment|ai|machine learning|ros|software)\b/i,
  projects: /\b(build|building|built|ship|shipping|project|product|platform|app|startup|founder|mission|launch|develop)\b/i,
  creativity: /\b(creative|music|musician|song|record|recording|audio|artist|art|vocal|perform|performance|content|video|writing)\b/i,
  learning: /\b(learn|learning|study|school|degree|course|skill|practice|research|training|certification)\b/i,
  relationships: /\b(relationship|friend|partner|romantic|dating|connection|social)\b/i,
  family: /\b(family|parent|sibling|cousin|aunt|uncle|grandparent|household)\b/i,
  health: /\b(health|fitness|gym|exercise|training|therapy|sleep|wellness|martial arts)\b/i,
  community: /\b(community|scene|group|collective|club|organization|network)\b/i,
};

const ACTIVE_PROJECT_STATUSES = new Set(['active', 'in_progress', 'ongoing', 'planning', 'started']);
const CLOSED_PROJECT_STATUSES = new Set(['completed', 'archived', 'abandoned', 'cancelled', 'ended']);

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function hash(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 20);
}

function daysSince(date: string | null | undefined, now: string): number | null {
  if (!date) return null;
  const time = Date.parse(date);
  if (!Number.isFinite(time)) return null;
  return Math.max(0, (Date.parse(now) - time) / 86_400_000);
}

function freshness(date: string | null, now: string): number {
  const days = daysSince(date, now);
  if (days == null) return 0.45;
  if (days <= 30) return 1;
  if (days <= 90) return 0.8;
  if (days <= 365) return 0.6;
  return 0.35;
}

function domainForText(text: string): IdentityDomain | null {
  let best: IdentityDomain | null = null;
  let bestHits = 0;
  for (const [domain, pattern] of Object.entries(DOMAIN_PATTERNS) as Array<[IdentityDomain, RegExp]>) {
    const hits = (text.match(new RegExp(pattern.source, 'gi')) ?? []).length;
    if (hits > bestHits) {
      best = domain;
      bestHits = hits;
    }
  }
  return best;
}

function arcDomain(arc: NarrativeArc): IdentityDomain | null {
  if (arc.category === 'creative') return 'creativity';
  if (arc.category === 'relationship') return 'relationships';
  if (arc.category in DOMAIN_PATTERNS) return arc.category as IdentityDomain;
  return domainForText(`${arc.title} ${arc.category}`);
}

function projectIsCanonical(project: ProjectRow): boolean {
  return project.metadata?.source !== 'organizations_fallback';
}

function projectIsOpen(project: ProjectRow): boolean {
  const status = (project.status ?? '').toLowerCase();
  if (CLOSED_PROJECT_STATUSES.has(status)) return false;
  return !status || ACTIVE_PROJECT_STATUSES.has(status) || !CLOSED_PROJECT_STATUSES.has(status);
}

function isLikelyPerson(person: LivingBiographyCard['keyPeople'][number]): boolean {
  const name = person.name.trim();
  if (!name || /(?:['’]s)$/i.test(name)) return false;
  if (evaluateWrongDomain(name, person.relationship).wrongDomain) return false;
  return !/\b(book|app|project|organization|company|school|gym|police|fitness)\b/i.test(name);
}

function evidenceDate(evidence: IdentityEvidenceRef[]): string | null {
  return evidence
    .map(item => item.date)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
}

function momentumFromArcs(arcs: NarrativeArc[], evidence: IdentityEvidenceRef[]): IdentityMomentum {
  if (arcs.some(arc => arc.status === 'growing' || arc.status === 'emerging' || arc.momentum === 'positive')) {
    return 'growing';
  }
  if (arcs.some(arc => arc.status === 'declining' || arc.momentum === 'negative')) return 'declining';
  return evidence.length > 0 ? 'steady' : 'dormant';
}

function trajectoryFor(momentum: IdentityMomentum, evidenceCount: number): IdentityTrajectory {
  if (momentum === 'declining' || momentum === 'dormant') return 'fading';
  if (momentum === 'growing' && evidenceCount <= 2) return 'emerging';
  if (momentum === 'growing') return 'transforming';
  return 'continuing';
}

function stabilityFor(sourceDiversity: number, contradictions: number): IdentityStability {
  if (contradictions > 1) return 'volatile';
  if (sourceDiversity >= 3) return 'stable';
  return 'evolving';
}

function coverageBand(score: number): IdentityCoverage['band'] {
  if (score >= 0.75) return 'strong';
  if (score >= 0.45) return 'developing';
  if (score > 0) return 'sparse';
  return 'unknown';
}

function threadName(domain: IdentityDomain, labels: string[]): string {
  if (domain === 'projects' && labels[0]) return labels[0];
  if (domain === 'career') return 'Technical and Career Work';
  if (domain === 'creativity') return 'Creative Expression';
  if (domain === 'learning') return 'Learning and Skill Building';
  if (domain === 'relationships') return 'Relationships';
  if (domain === 'family') return 'Family';
  if (domain === 'health') return 'Health and Physical Practice';
  return 'Community';
}

function threadSummary(
  domain: IdentityDomain,
  labels: string[],
  momentum: IdentityMomentum,
): string {
  const examples = labels.slice(0, 3);
  const named = examples.length > 0 ? examples.join(', ') : threadName(domain, labels);
  const movement = momentum === 'growing'
    ? 'is gaining momentum'
    : momentum === 'declining'
      ? 'has become less central recently'
      : momentum === 'dormant'
        ? 'is present historically but not active right now'
        : 'remains a continuing part of your life';

  switch (domain) {
    case 'career': return `${named} ${movement}, forming a durable technical and professional through-line.`;
    case 'projects': return `Building ${named} ${movement} and represents mission-driven work rather than a one-off task.`;
    case 'creativity': return `${named} ${movement} as a creative outlet and form of expression.`;
    case 'learning': return `${named} ${movement}, showing continued investment in learning and capability.`;
    case 'health': return `${named} ${movement} as part of your physical life and self-maintenance.`;
    case 'relationships': return `${named} ${movement} in your relational life.`;
    case 'family': return `${named} ${movement} as family context and support.`;
    case 'community': return `${named} ${movement} in your connection to communities.`;
  }
}

function evidenceForDomain(
  domain: IdentityDomain,
  narrative: NarrativeIR | null,
  projects: ProjectRow[],
  skills: Skill[],
  card: LivingBiographyCard,
): IdentityEvidenceRef[] {
  const evidence: IdentityEvidenceRef[] = [];

  for (const arc of narrative?.activeArcs ?? []) {
    if (arcDomain(arc) !== domain) continue;
    evidence.push({
      id: arc.id,
      label: arc.title,
      source: 'narrative_arc',
      date: arc.latestActivity,
      confidence: arc.confidence,
    });
  }

  for (const project of projects) {
    if (!projectIsCanonical(project) || !projectIsOpen(project)) continue;
    const projectDomain = domainForText(`${project.name} ${project.type ?? ''} ${project.description ?? ''} ${project.tags?.join(' ') ?? ''}`);
    if (domain !== 'projects' && projectDomain !== domain) continue;
    evidence.push({
      id: project.id,
      label: project.name,
      source: 'project',
      date: project.updated_at,
      confidence: clamp(project.importance_score ?? 0.72),
    });
  }

  for (const skill of skills) {
    if (!skill.is_active || skill.confidence_score < 0.5) continue;
    const mappedDomain: IdentityDomain =
      skill.skill_category === 'creative' || skill.skill_category === 'artistic'
        ? 'creativity'
        : skill.skill_category === 'physical'
          ? 'health'
          : skill.skill_category === 'social' || skill.skill_category === 'emotional'
            ? 'relationships'
            : skill.skill_category === 'technical' || skill.skill_category === 'professional'
              ? 'career'
              : 'learning';
    if (mappedDomain !== domain) continue;
    evidence.push({
      id: skill.id,
      label: skill.skill_name,
      source: 'skill',
      date: skill.last_practiced_at ?? skill.updated_at,
      confidence: clamp(skill.confidence_score),
    });
  }

  for (const goal of narrative?.goals ?? []) {
    if (!['active', 'in_progress', 'ongoing', 'pending'].includes(goal.status.toLowerCase())) continue;
    if (domainForText(goal.title) !== domain) continue;
    evidence.push({
      id: goal.id,
      label: goal.title,
      source: 'goal',
      confidence: 0.78,
    });
  }

  if (domain === 'relationships' || domain === 'family') {
    for (const person of card.keyPeople) {
      const isFamily = /family|parent|sibling|cousin|aunt|uncle|grand/i.test(person.relationship);
      if ((domain === 'family') !== isFamily) continue;
      evidence.push({
        id: `person:${normalizeKey(person.name)}`,
        label: person.name,
        source: 'relationship',
        confidence: 0.72,
      });
    }
  }

  const deduped = new Map<string, IdentityEvidenceRef>();
  for (const item of evidence) {
    const key = `${item.source}:${normalizeKey(item.label)}`;
    const existing = deduped.get(key);
    if (!existing || item.confidence > existing.confidence) deduped.set(key, item);
  }
  return [...deduped.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 12);
}

export function compileIdentitySnapshot(inputs: IdentitySnapshotInputs): IdentitySnapshot {
  const { userId, generatedAt, biography, card, narrative } = inputs;
  const projects = inputs.projects.filter(projectIsCanonical);
  const skills = inputs.skills.filter(skill => skill.is_active && skill.confidence_score >= 0.5);
  const importantPeople = card.keyPeople.filter(isLikelyPerson);
  const cleanCard = { ...card, keyPeople: importantPeople };
  const tensions = (narrative?.conflicts ?? []).slice(0, 4).map(conflict => ({
    label: conflict.label,
    evidence: conflict.evidence.slice(0, 4),
    confidence: conflict.severity === 'high' ? 0.8 : conflict.severity === 'medium' ? 0.68 : 0.55,
  }));

  const domains = Object.keys(DOMAIN_PATTERNS) as IdentityDomain[];
  const threadDrafts = domains.map(domain => {
    const evidence = evidenceForDomain(domain, narrative, projects, skills, cleanCard);
    const arcs = (narrative?.activeArcs ?? []).filter(arc => arcDomain(arc) === domain);
    const sources = new Set(evidence.map(item => item.source));
    const latest = evidenceDate(evidence);
    const avgConfidence = evidence.length > 0
      ? evidence.reduce((sum, item) => sum + item.confidence, 0) / evidence.length
      : 0;
    const coverageScore = evidence.length === 0
      ? 0
      : clamp(
          Math.min(1, evidence.length / 6) * 0.35 +
          Math.min(1, sources.size / 3) * 0.25 +
          avgConfidence * 0.25 +
          freshness(latest, generatedAt) * 0.15,
        );
    const momentum = momentumFromArcs(arcs, evidence);
    const contradictions = tensions
      .filter(tension => DOMAIN_PATTERNS[domain].test(`${tension.label} ${tension.evidence.join(' ')}`))
      .map(tension => tension.label);
    const strength = Math.round(clamp(coverageScore * 0.7 + Math.min(1, evidence.length / 5) * 0.3) * 100);
    const labels = evidence.map(item => item.label).filter(Boolean);

    return {
      domain,
      evidence,
      sources,
      latest,
      avgConfidence,
      coverageScore,
      momentum,
      contradictions,
      strength,
      labels,
    };
  });

  const ranked = threadDrafts
    .filter(thread => thread.evidence.length > 0)
    .sort((a, b) => b.strength - a.strength);

  const threads: IdentityThread[] = ranked.map((thread, index) => ({
    id: `identity-thread-${thread.domain}`,
    domain: thread.domain,
    name: threadName(thread.domain, thread.labels),
    summary: threadSummary(thread.domain, thread.labels, thread.momentum),
    salience: index < 2 ? 'dominant' : index < 5 ? 'significant' : 'supporting',
    stability: stabilityFor(thread.sources.size, thread.contradictions.length),
    momentum: thread.momentum,
    trajectory: trajectoryFor(thread.momentum, thread.evidence.length),
    strength: thread.strength,
    confidence: Math.round(thread.avgConfidence * 100) / 100,
    supportingEvidence: thread.evidence,
    contradictions: thread.contradictions,
    lastReinforced: thread.latest,
  }));

  const coverage: IdentityCoverage[] = threadDrafts.map(thread => ({
    domain: thread.domain,
    score: Math.round(thread.coverageScore * 100),
    band: coverageBand(thread.coverageScore),
    evidenceCount: thread.evidence.length,
    sourceDiversity: thread.sources.size,
    lastReinforced: thread.latest,
  }));

  const goals = (narrative?.goals ?? [])
    .filter(goal => ['active', 'in_progress', 'ongoing', 'pending'].includes(goal.status.toLowerCase()))
    .slice(0, 4);
  const existingGoalKeys = new Set(goals.map(goal => normalizeKey(goal.title)));
  for (const [index, focus] of card.currentFocus.entries()) {
    if (goals.length >= 4 || existingGoalKeys.has(normalizeKey(focus))) continue;
    goals.push({ id: `focus-${index}`, title: focus, status: 'active' });
  }

  const recentChanges = [
    ...(narrative?.turningPoints ?? [])
      .filter(point => point.importance >= 0.55)
      .map(point => ({ id: point.id, label: point.title, confidence: point.confidence, date: point.date })),
    ...(narrative?.activeArcs ?? [])
      .filter(arc => arc.status === 'growing' || arc.status === 'emerging')
      .map(arc => ({ id: `arc-change-${arc.id}`, label: arc.title, confidence: arc.confidence, date: arc.latestActivity })),
  ]
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.confidence - a.confidence)
    .filter((item, index, all) => all.findIndex(other => normalizeKey(other.label) === normalizeKey(item.label)) === index)
    .slice(0, 4);

  const allEvidence = threads.flatMap(thread => thread.supportingEvidence);
  const sourceCounts = allEvidence.reduce<Record<string, number>>((counts, item) => {
    counts[item.source] = (counts[item.source] ?? 0) + 1;
    return counts;
  }, {});
  const narrativeVersion = narrative?.generatedAt ?? biography?.generatedAt ?? generatedAt;
  const graphRevision = hash([
    ...allEvidence.map(item => `${item.source}:${item.id}:${item.date ?? ''}`).sort(),
    narrativeVersion,
  ]);
  const confidence = threads.length > 0
    ? threads.reduce((sum, thread) => sum + thread.confidence, 0) / threads.length
    : 0;

  return {
    id: `identity-${hash([userId, ALGORITHM_VERSION, narrativeVersion, graphRevision])}`,
    generatedAt,
    algorithmVersion: ALGORITHM_VERSION,
    narrativeVersion,
    graphRevision,
    stale: Boolean(biography?.stale),
    confidence: Math.round(confidence * 100) / 100,
    coverage,
    coreIdentity: {
      name: biography?.facts.identity.name ?? card.name,
      education: biography?.facts.identity.education ?? null,
      employment: biography?.facts.identity.employment ?? null,
      location: biography?.facts.identity.location ?? null,
    },
    currentChapter: narrative
      ? {
          title: narrative.currentChapter.title,
          summary: narrative.currentChapter.summary,
          confidence: narrative.currentChapter.confidence,
        }
      : card.currentChapter
        ? {
            title: card.currentChapter.label,
            summary: card.currentFocus.length > 0
              ? `Your current attention is on ${card.currentFocus.join(', ')}.`
              : '',
            confidence: 0.65,
          }
        : null,
    threads,
    goals,
    recentChanges,
    importantPeople,
    tensions,
    provenance: {
      evidenceCount: allEvidence.length,
      sourceCounts,
      rejectedCounts: {
        organization_fallback_projects: inputs.projects.length - projects.length,
        low_certainty_or_inactive_skills: inputs.skills.length - skills.length,
        wrong_domain_people: card.keyPeople.length - importantPeople.length,
      },
      why: `Derived from ${threads.length} identity threads, ${allEvidence.length} evidence references, and Narrative IR ${narrativeVersion}.`,
    },
  };
}

export async function getIdentitySnapshot(
  userId: string,
  options: { bypassCache?: boolean } = {},
): Promise<IdentitySnapshot> {
  const cached = snapshotCache.get(userId);
  if (!options.bypassCache && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.snapshot;

  const [biographyResult, narrativeResult, projectsResult, skillsResult, cardResult] = await Promise.allSettled([
    biographyFoundationService.getBiography(userId),
    compileNarrativeIR(userId),
    projectService.listProjects(userId),
    skillService.getSkills(userId, { active_only: true, limit: 20 }),
    getLivingBiographyCard(userId),
  ]);

  const biography = biographyResult.status === 'fulfilled' ? biographyResult.value : null;
  const narrative = narrativeResult.status === 'fulfilled' ? narrativeResult.value : null;
  const projects = projectsResult.status === 'fulfilled' ? projectsResult.value : [];
  const skills = skillsResult.status === 'fulfilled' ? skillsResult.value : [];
  const card = cardResult.status === 'fulfilled'
    ? cardResult.value
    : {
        name: biography?.facts.identity.name ?? null,
        currentChapter: null,
        topThemes: [],
        keyPeople: [],
        currentFocus: [],
        recentDevelopments: [],
        lastUpdated: biography?.generatedAt ?? null,
        hasEnoughData: Boolean(biography),
      };

  if (narrativeResult.status === 'rejected') {
    logger.warn({ error: narrativeResult.reason, userId }, 'IdentitySnapshot: Narrative IR unavailable');
  }

  const snapshot = compileIdentitySnapshot({
    userId,
    generatedAt: new Date().toISOString(),
    biography,
    card,
    narrative,
    projects,
    skills,
  });
  snapshotCache.set(userId, { at: Date.now(), snapshot });
  return snapshot;
}

export function clearIdentitySnapshotCache(userId?: string): void {
  if (userId) snapshotCache.delete(userId);
  else snapshotCache.clear();
}
