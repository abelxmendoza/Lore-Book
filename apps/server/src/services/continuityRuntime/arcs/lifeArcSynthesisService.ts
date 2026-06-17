/**
 * Life Arc Synthesis — projection layer (no new tables, no extraction).
 *
 * Composes narrative structure from existing memory signals:
 * life_arcs, goals, projects/orgs, relationships, events, journal episodes, communities.
 */
import { supabaseAdmin } from '../../supabaseClient';
import { logger } from '../../../logger';
import { biographyFoundationService } from '../../biographyFoundationService';
import { deriveCurrentChapter } from '../../livingBiographyService';

export type ArcCategory =
  | 'career'
  | 'family'
  | 'relationship'
  | 'health'
  | 'creative'
  | 'learning'
  | 'community'
  | 'custom';

export type ArcMomentum = 'emerging' | 'growing' | 'stable' | 'declining' | 'completed';

export type CandidateLifeArc = {
  id: string;
  title: string;
  category: ArcCategory;
  momentum: ArcMomentum;
  score: number;
  evidence: string[];
  sources: string[];
};

export type ArcProvenanceRef = {
  id: string;
  label: string;
  date?: string | null;
  status?: string | null;
};

export type ArcProvenance = {
  evidenceCount: number;
  episodes: ArcProvenanceRef[];
  goals: ArcProvenanceRef[];
  projects: ArcProvenanceRef[];
  relationships: ArcProvenanceRef[];
  events: ArcProvenanceRef[];
  confidence: number;
};

export type EnrichedLifeArc = CandidateLifeArc & {
  provenance: ArcProvenance;
  startDate: string | null;
  latestActivity: string | null;
};

export type LifeArcConflict = {
  kind: 'goal' | 'project' | 'relationship' | 'time';
  label: string;
  evidence: string[];
  severity: 'low' | 'medium' | 'high';
};

export type LifeArcSynthesis = {
  currentChapter: { label: string; narrative: string; evidence: string[] };
  candidateArcs: CandidateLifeArc[];
  enrichedArcs: EnrichedLifeArc[];
  conflicts: LifeArcConflict[];
  lifeDirection: {
    movingToward: string[];
    gainingMomentum: string[];
    fading: string[];
    deservesAttention: string[];
  };
  signalInventory: Record<ArcCategory, number>;
  generatedAt: string;
  text: string;
};

const CATEGORY_KEYWORDS: Record<ArcCategory, RegExp> = {
  career: /\b(work|job|career|amazon|kforce|onboarding|employ|professional|startup)\b/i,
  family: /\b(family|mom|dad|abuela|tia|tío|cousin|household|parents|sibling)\b/i,
  relationship: /\b(relationship|dating|partner|breakup|romantic|boyfriend|girlfriend|sol)\b/i,
  health: /\b(health|gym|fitness|workout|mental|therapy|wellness)\b/i,
  creative: /\b(creative|art|music|goth|club|event|party|scene|lorebook|building)\b/i,
  learning: /\b(learn|coding|bootcamp|skill|course|study|improv)\b/i,
  community: /\b(community|crew|circle|goth|club metro|los goths|scene|friends)\b/i,
  custom: /.*/,
};

const ARC_TITLE_RULES: Array<{ title: string; category: ArcCategory; pattern: RegExp }> = [
  { title: 'LoreBook Arc', category: 'creative', pattern: /\blorebook\b/i },
  { title: 'Amazon Arc', category: 'career', pattern: /\bamazon\b/i },
  { title: 'Family Arc', category: 'family', pattern: /\b(family|abuela|tia grace|cousin)\b/i },
  { title: 'Goth Community Arc', category: 'community', pattern: /\b(goth|club metro|los goths)\b/i },
  { title: 'Relationship Arc', category: 'relationship', pattern: /\b(sol|breakup|relationship)\b/i },
  { title: 'Learning Arc', category: 'learning', pattern: /\b(bootcamp|coding|clever programmer)\b/i },
];

type SignalBundle = {
  lifeArcs: any[];
  goals: any[];
  organizations: any[];
  journalRecent: any[];
  eventsRecent: any[];
  relationships: any[];
  communities: any[];
};

function daysAgo(date?: string | null): number | null {
  if (!date) return null;
  const t = new Date(date).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function categorizeText(text: string): ArcCategory {
  let best: ArcCategory = 'custom';
  let bestScore = 0;
  for (const [cat, re] of Object.entries(CATEGORY_KEYWORDS) as [ArcCategory, RegExp][]) {
    if (cat === 'custom') continue;
    const matches = (text.match(new RegExp(re.source, 'gi')) ?? []).length;
    if (matches > bestScore) {
      bestScore = matches;
      best = cat;
    }
  }
  return best;
}

function scoreCategorySignals(bundle: SignalBundle): Record<ArcCategory, number> {
  const scores: Record<ArcCategory, number> = {
    career: 0,
    family: 0,
    relationship: 0,
    health: 0,
    creative: 0,
    learning: 0,
    community: 0,
    custom: 0,
  };

  const bump = (text: string, weight: number, source: string) => {
    const cat = categorizeText(text);
    scores[cat] += weight;
    if (source) scores[cat] += 0.1;
  };

  for (const row of bundle.lifeArcs) {
    bump(`${row.title} ${row.summary ?? ''}`, 3, 'life_arcs');
  }
  for (const g of bundle.goals) {
    bump(`${g.title} ${g.description ?? ''}`, g.status === 'active' ? 2.5 : 1, 'goals');
  }
  for (const o of bundle.organizations) {
    bump(`${o.name} ${o.description ?? ''}`, 2, 'organizations');
  }
  for (const j of bundle.journalRecent) {
    const age = daysAgo(j.date);
    const recency = age == null ? 0.5 : age <= 14 ? 2 : age <= 45 ? 1.2 : 0.6;
    bump(`${j.summary ?? ''} ${j.content ?? ''}`, recency, 'journal');
  }
  for (const e of bundle.eventsRecent) {
    bump(`${e.title ?? ''} ${e.summary ?? ''}`, 1.5, 'events');
  }
  for (const r of bundle.relationships) {
    bump(`${r.relationship_type ?? ''} ${r.title ?? ''}`, 2, 'relationships');
  }
  for (const c of bundle.communities) {
    bump(`${c.theme ?? c.name ?? ''} ${c.description ?? ''}`, 1.8, 'communities');
  }

  return scores;
}

function computeMomentum(
  title: string,
  category: ArcCategory,
  bundle: SignalBundle
): { momentum: ArcMomentum; evidence: string[] } {
  const needle = title.split(' ')[0]?.toLowerCase() ?? '';
  const corpus = [
    ...bundle.journalRecent.map((j) => `${j.summary} ${j.content} ${j.date}`),
    ...bundle.eventsRecent.map((e) => `${e.title} ${e.summary} ${e.start_time}`),
    ...bundle.goals.map((g) => `${g.title} ${g.status} ${g.updated_at}`),
  ].join(' ').toLowerCase();

  const recentHits = bundle.journalRecent.filter((j) => {
    const text = `${j.summary ?? ''} ${j.content ?? ''}`.toLowerCase();
    return CATEGORY_KEYWORDS[category].test(text) || (needle.length > 3 && text.includes(needle));
  });
  const recent30 = recentHits.filter((j) => (daysAgo(j.date) ?? 999) <= 30);
  const prior30 = recentHits.filter((j) => {
    const d = daysAgo(j.date);
    return d != null && d > 30 && d <= 60;
  });

  const completedGoal = bundle.goals.some(
    (g) => g.status === 'completed' && `${g.title} ${g.description ?? ''}`.toLowerCase().includes(needle)
  );
  if (completedGoal) {
    return { momentum: 'completed', evidence: ['goal marked completed'] };
  }

  if (recent30.length >= 1 && prior30.length === 0 && recent30.length <= 2) {
    return {
      momentum: 'emerging',
      evidence: [`${recent30.length} new mention(s) in last 30d`, 'no prior-30d baseline'],
    };
  }

  if (recent30.length > prior30.length + 1) {
    return {
      momentum: 'growing',
      evidence: [`${recent30.length} recent mentions (30d)`, `category signal: ${category}`],
    };
  }
  if (recent30.length === 0 && recentHits.length > 0) {
    return { momentum: 'declining', evidence: ['no mentions in last 30 days', 'older activity exists'] };
  }
  if (recent30.length > 0) {
    return { momentum: 'stable', evidence: [`${recent30.length} mentions in last 30d`] };
  }
  if (CATEGORY_KEYWORDS[category].test(corpus)) {
    return { momentum: 'stable', evidence: [`background ${category} activity`] };
  }
  return { momentum: 'declining', evidence: ['sparse signal'] };
}

function buildCandidateArcs(bundle: SignalBundle, inventory: Record<ArcCategory, number>): CandidateLifeArc[] {
  const candidates: CandidateLifeArc[] = [];
  const seen = new Set<string>();

  for (const arc of bundle.lifeArcs) {
    const title = String(arc.title ?? 'Life arc');
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const category = categorizeText(`${title} ${arc.summary ?? ''} ${arc.arc_type ?? ''}`);
    const { momentum, evidence } = computeMomentum(title, category, bundle);
    candidates.push({
      id: String(arc.id),
      title,
      category,
      momentum: arc.is_active === false && arc.end_date ? 'completed' : momentum,
      score: Number(arc.stability_score ?? arc.confidence ?? 0.5) * 3 + (inventory[category] ?? 0),
      evidence: [...evidence, arc.summary ? `summary: ${String(arc.summary).slice(0, 120)}` : ''].filter(Boolean),
      sources: ['life_arcs'],
    });
  }

  const allText = [
    ...bundle.organizations.map((o) => `${o.name} ${o.description ?? ''}`),
    ...bundle.goals.map((g) => `${g.title} ${g.description ?? ''}`),
    ...bundle.journalRecent.map((j) => `${j.summary ?? ''} ${j.content ?? ''}`),
  ].join('\n');

  for (const rule of ARC_TITLE_RULES) {
    if (!rule.pattern.test(allText)) continue;
    const key = rule.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const { momentum, evidence } = computeMomentum(rule.title, rule.category, bundle);
    candidates.push({
      id: `signal:${key.replace(/\s+/g, '_')}`,
      title: rule.title,
      category: rule.category,
      momentum,
      score: (inventory[rule.category] ?? 0) + (momentum === 'growing' ? 2 : 1),
      evidence,
      sources: ['episodes', 'goals', 'projects', 'relationships', 'communities'],
    });
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 8);
}

function detectConflicts(bundle: SignalBundle, arcs: CandidateLifeArc[]): LifeArcConflict[] {
  const conflicts: LifeArcConflict[] = [];
  const activeGoals = bundle.goals.filter((g) => g.status === 'active');
  const abandonedGoals = bundle.goals.filter((g) => g.status === 'abandoned');

  if (activeGoals.length >= 2) {
    const titles = activeGoals.map((g) => g.title).join(' vs ');
    conflicts.push({
      kind: 'goal',
      label: `Multiple active goals competing for attention`,
      evidence: activeGoals.slice(0, 4).map((g) => g.title),
      severity: activeGoals.length >= 4 ? 'high' : 'medium',
    });
  }

  const lorebook = arcs.find((a) => /lorebook/i.test(a.title));
  const amazon = arcs.find((a) => /amazon/i.test(a.title));
  if (lorebook && amazon && lorebook.momentum !== 'completed' && amazon.momentum === 'growing') {
    conflicts.push({
      kind: 'project',
      label: 'LoreBook build vs employment transition (Amazon)',
      evidence: [lorebook.title, amazon.title],
      severity: 'high',
    });
  }

  const social = arcs.find((a) => a.category === 'community' && a.momentum === 'growing');
  const creative = arcs.find((a) => /lorebook/i.test(a.title) && a.momentum === 'growing');
  if (social && creative) {
    conflicts.push({
      kind: 'time',
      label: 'Social/community life vs productivity/building',
      evidence: [social.title, creative.title],
      severity: 'medium',
    });
  }

  const family = arcs.find((a) => a.category === 'family' && a.momentum !== 'declining');
  if (family && activeGoals.some((g) => /personal|creative|career/i.test(`${g.title} ${g.description ?? ''}`))) {
    conflicts.push({
      kind: 'relationship',
      label: 'Family obligations vs personal/career goals',
      evidence: [family.title, ...activeGoals.slice(0, 2).map((g) => g.title)],
      severity: 'medium',
    });
  }

  if (abandonedGoals.length > 0 && activeGoals.length > 0) {
    conflicts.push({
      kind: 'goal',
      label: 'Abandoned goals alongside active priorities',
      evidence: [...abandonedGoals.slice(0, 2).map((g) => g.title), '→', ...activeGoals.slice(0, 2).map((g) => g.title)],
      severity: 'low',
    });
  }

  return conflicts.slice(0, 6);
}

function arcMatchesText(arc: CandidateLifeArc, text: string): boolean {
  if (CATEGORY_KEYWORDS[arc.category].test(text)) return true;
  const needle = arc.title.replace(/ Arc$/i, '').split(' ')[0]?.toLowerCase() ?? '';
  return needle.length > 3 && text.toLowerCase().includes(needle);
}

function buildArcProvenance(arc: CandidateLifeArc, bundle: SignalBundle): ArcProvenance {
  const episodes = bundle.journalRecent
    .filter((j) => arcMatchesText(arc, `${j.summary ?? ''} ${j.content ?? ''}`))
    .slice(0, 8)
    .map((j) => ({
      id: String(j.id),
      label: String(j.summary ?? j.content ?? 'Journal entry').slice(0, 120),
      date: j.date ?? null,
    }));

  const goals = bundle.goals
    .filter((g) => arcMatchesText(arc, `${g.title} ${g.description ?? ''}`))
    .slice(0, 6)
    .map((g) => ({
      id: String(g.id),
      label: String(g.title),
      status: g.status ?? null,
    }));

  const projects = bundle.organizations
    .filter((o) => arcMatchesText(arc, `${o.name} ${o.description ?? ''}`))
    .slice(0, 6)
    .map((o) => ({
      id: String(o.id),
      label: String(o.name),
    }));

  const relationships = bundle.relationships
    .filter((r) => arcMatchesText(arc, `${r.relationship_type ?? ''} ${r.title ?? ''}`))
    .slice(0, 6)
    .map((r) => ({
      id: String(r.id),
      label: String(r.title ?? r.relationship_type ?? 'Relationship'),
    }));

  const events = bundle.eventsRecent
    .filter((e) => arcMatchesText(arc, `${e.title ?? ''} ${e.summary ?? ''}`))
    .slice(0, 6)
    .map((e) => ({
      id: String(e.id),
      label: String(e.title ?? e.summary ?? 'Event').slice(0, 120),
      date: e.start_time ?? null,
    }));

  const evidenceCount =
    episodes.length + goals.length + projects.length + relationships.length + events.length;
  const confidence = Math.min(1, Math.round((arc.score / 45) * 100) / 100);

  return { evidenceCount, episodes, goals, projects, relationships, events, confidence };
}

function buildEnrichedArcs(candidates: CandidateLifeArc[], bundle: SignalBundle): EnrichedLifeArc[] {
  return candidates.map((arc) => {
    const provenance = buildArcProvenance(arc, bundle);
    const dates = [
      ...provenance.episodes.map((e) => e.date),
      ...provenance.events.map((e) => e.date),
    ].filter((d): d is string => Boolean(d));
    dates.sort();
    return {
      ...arc,
      provenance,
      startDate: dates[0] ?? null,
      latestActivity: dates.length ? dates[dates.length - 1] : null,
    };
  });
}

function buildCurrentChapter(
  arcs: CandidateLifeArc[],
  bundle: SignalBundle,
  bioChapter: { label: string; evidence: string[] } | null
): LifeArcSynthesis['currentChapter'] {
  const active = arcs.filter((a) => a.momentum === 'growing' || a.momentum === 'stable');
  const growing = arcs.filter((a) => a.momentum === 'growing');

  const parts: string[] = [];
  const evidence: string[] = [];

  if (growing.length >= 2) {
    parts.push(
      `${growing[0].title.replace(/ Arc$/, '')} and ${growing[1].title.replace(/ Arc$/, '')} are both gaining momentum`
    );
    evidence.push(...growing[0].evidence, ...growing[1].evidence);
  } else if (active.length >= 1) {
    parts.push(`Centered on ${active[0].title.replace(/ Arc$/, '')}`);
    evidence.push(...active[0].evidence);
  }

  const career = arcs.find((a) => a.category === 'career' && a.momentum === 'growing');
  const creative = arcs.find((a) => /lorebook/i.test(a.title));
  const relationship = arcs.find((a) => a.category === 'relationship');

  if (creative && career) {
    parts.push(`building LoreBook while transitioning back into work`);
    evidence.push('LoreBook + career signals');
  } else if (career) {
    parts.push(`navigating a career transition`);
  }

  if (relationship && relationship.momentum === 'declining') {
    parts.push(`recovering after a difficult relationship period`);
    evidence.push(...relationship.evidence);
  }

  const activeGoals = bundle.goals.filter((g) => g.status === 'active').slice(0, 2);
  if (activeGoals.length && parts.length < 2) {
    parts.push(`focused on: ${activeGoals.map((g) => g.title).join(', ')}`);
    evidence.push(...activeGoals.map((g) => `goal: ${g.title}`));
  }

  let narrative = parts.join(' while ').replace(/ while $/, '');
  if (!narrative && bioChapter) {
    narrative = bioChapter.label.replace(/ Era$/, '');
    evidence.push(...bioChapter.evidence);
  }
  if (!narrative && active.length) {
    narrative = `A chapter shaped by ${active[0].title.replace(/ Arc$/, '')}`;
  }
  if (!narrative) {
    narrative = 'A transitional chapter — narrative signals are still sparse';
    evidence.push('insufficient cross-signal density');
  }

  const label = narrative.charAt(0).toUpperCase() + narrative.slice(1) + (narrative.endsWith('.') ? '' : '.');

  return { label, narrative: label, evidence: [...new Set(evidence)].slice(0, 6) };
}

function buildLifeDirection(arcs: CandidateLifeArc[], conflicts: LifeArcConflict[]): LifeArcSynthesis['lifeDirection'] {
  return {
    movingToward: arcs
      .filter((a) => a.momentum === 'growing')
      .slice(0, 3)
      .map((a) => `${a.title} (${a.category})`),
    gainingMomentum: arcs.filter((a) => a.momentum === 'growing').map((a) => a.title),
    fading: arcs.filter((a) => a.momentum === 'declining').map((a) => a.title),
    deservesAttention: [
      ...conflicts.filter((c) => c.severity !== 'low').map((c) => c.label),
      ...arcs.filter((a) => a.momentum === 'growing' && a.category === 'career').map((a) => a.title),
    ].slice(0, 4),
  };
}

function buildPromptText(synthesis: Omit<LifeArcSynthesis, 'text'>): string {
  const lines = [
    '**LIFE ARC SYNTHESIS** (narrative projection from existing memory — cite evidence, do not invent)',
    '',
    `**Current Chapter:** ${synthesis.currentChapter.narrative}`,
    `Evidence: ${synthesis.currentChapter.evidence.join('; ')}`,
    '',
    '**Active Life Arcs:**',
    ...synthesis.candidateArcs.slice(0, 6).map(
      (a) =>
        `- ${a.title} [${a.category} | ${a.momentum} | score=${a.score.toFixed(1)}] — ${a.evidence.slice(0, 2).join('; ')}`
    ),
    '',
    '**Life Direction:**',
    `- Moving toward: ${synthesis.lifeDirection.movingToward.join(', ') || 'unclear'}`,
    `- Gaining momentum: ${synthesis.lifeDirection.gainingMomentum.join(', ') || 'none detected'}`,
    `- Fading: ${synthesis.lifeDirection.fading.join(', ') || 'none detected'}`,
    `- Deserves attention: ${synthesis.lifeDirection.deservesAttention.join(', ') || 'none flagged'}`,
  ];

  if (synthesis.conflicts.length) {
    lines.push('', '**Tensions / Conflicts:**');
    for (const c of synthesis.conflicts) {
      lines.push(`- [${c.severity}] ${c.label}: ${c.evidence.join(' · ')}`);
    }
  }

  lines.push(
    '',
    '**Signal strength by domain:**',
    Object.entries(synthesis.signalInventory)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}: ${v.toFixed(1)}`)
      .join(' | ')
  );

  return lines.join('\n');
}

async function loadSignals(userId: string): Promise<SignalBundle> {
  const since90 = new Date(Date.now() - 90 * 86_400_000).toISOString();

  const [lifeArcs, goals, organizations, journalRecent, eventsRecent, relationships, communities] =
    await Promise.all([
      supabaseAdmin
        .from('life_arcs')
        .select('id, title, arc_type, summary, confidence, stability_score, is_active, start_date, end_date, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(12)
        .then((r) => r.data ?? [])
        .catch(() => []),
      supabaseAdmin
        .from('goals')
        .select('id, title, description, status, updated_at, last_action_at, source')
        .eq('user_id', userId)
        .then((r) => r.data ?? [])
        .catch(() => []),
      supabaseAdmin
        .from('organizations')
        .select('id, name, description, type, status, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(12)
        .then((r) => r.data ?? [])
        .catch(() => []),
      supabaseAdmin
        .from('journal_entries')
        .select('id, summary, content, date')
        .eq('user_id', userId)
        .gte('date', since90)
        .order('date', { ascending: false })
        .limit(20)
        .then((r) => r.data ?? [])
        .catch(() => []),
      supabaseAdmin
        .from('resolved_events')
        .select('id, title, summary, start_time, type')
        .eq('user_id', userId)
        .gte('start_time', since90)
        .order('start_time', { ascending: false })
        .limit(15)
        .then((r) => r.data ?? [])
        .catch(() => []),
      supabaseAdmin
        .from('character_relationships')
        .select('id, relationship_type, status, metadata, updated_at')
        .eq('user_id', userId)
        .limit(15)
        .then((r) => r.data ?? [])
        .catch(() => []),
      supabaseAdmin
        .from('organizations')
        .select('id, name, description, type, updated_at')
        .eq('user_id', userId)
        .or('type.eq.family,name.ilike.%goth%,name.ilike.%household%')
        .then((r) => r.data ?? [])
        .catch(() => []),
    ]);

  return {
    lifeArcs,
    goals,
    organizations,
    journalRecent,
    eventsRecent,
    relationships: relationships.map((r: any) => ({
      ...r,
      title: (r.metadata as Record<string, unknown>)?.kinship ?? r.relationship_type,
    })),
    communities,
  };
}

export async function synthesizeLifeArcs(userId: string): Promise<LifeArcSynthesis> {
  try {
    const bundle = await loadSignals(userId);
    const signalInventory = scoreCategorySignals(bundle);
    const candidateArcs = buildCandidateArcs(bundle, signalInventory);
    const enrichedArcs = buildEnrichedArcs(candidateArcs, bundle);
    const conflicts = detectConflicts(bundle, candidateArcs);

    let bioChapter: { label: string; evidence: string[] } | null = null;
    try {
      const bio = await biographyFoundationService.getBiography(userId);
      if (bio) bioChapter = deriveCurrentChapter(bio);
    } catch {
      /* optional */
    }

    const currentChapter = buildCurrentChapter(candidateArcs, bundle, bioChapter);
    const lifeDirection = buildLifeDirection(candidateArcs, conflicts);

    const core = {
      currentChapter,
      candidateArcs,
      enrichedArcs,
      conflicts,
      lifeDirection,
      signalInventory,
      generatedAt: new Date().toISOString(),
    };

    return { ...core, text: buildPromptText(core) };
  } catch (err) {
    logger.warn({ err, userId }, 'lifeArcSynthesis: failed, returning empty');
    const empty: LifeArcSynthesis = {
      currentChapter: { label: 'Unknown chapter', narrative: 'Insufficient narrative signals.', evidence: [] },
      candidateArcs: [],
      enrichedArcs: [],
      conflicts: [],
      lifeDirection: { movingToward: [], gainingMomentum: [], fading: [], deservesAttention: [] },
      signalInventory: {
        career: 0,
        family: 0,
        relationship: 0,
        health: 0,
        creative: 0,
        learning: 0,
        community: 0,
        custom: 0,
      },
      generatedAt: new Date().toISOString(),
      text: '',
    };
    return empty;
  }
}

export const lifeArcSynthesisService = { synthesize: synthesizeLifeArcs };
