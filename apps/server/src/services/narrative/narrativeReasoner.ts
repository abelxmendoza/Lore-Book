/**
 * Narrative Reasoner — the orchestrator of the Narrative Cognition Layer.
 *
 * "Who matters most to me?", "what era am I in?", "what changed recently?"
 * are NOT retrieval questions. This module detects them, loads the narrative
 * graph once, runs the pure resolvers, and composes a humane answer with
 * visible uncertainty — never a character dump, never a therapy deflection.
 */
import { logger } from '../../logger';
import type { AnchorBuildContext } from './narrativeAnchorTypes';
import type {
  ActiveArc,
  ActiveArcKind,
  AttentionState,
  CognitionAnswer,
  CognitionQuestionKind,
  ComparisonDimension,
  LifeEra,
  NarrativeCognitionContext,
  PersonSalience,
  RecentChange,
} from './narrativeCognitionTypes';
import { buildSalienceInputs, daysBetween } from './relationshipSalience';
import { computePersonSalience, rankMostImportant, risingPeople } from './salienceEngine';
import { resolveActiveArcs } from './activeArcResolver';
import { resolveCurrentEra } from './lifeEraResolver';
import { resolveAttention } from './attentionResolver';
import { synthesizeIdentity } from './identitySynthesizer';

// ---------------------------------------------------------------------------
// Question detection
// ---------------------------------------------------------------------------

const QUESTION_PATTERNS: Array<{ kind: CognitionQuestionKind; pattern: RegExp }> = [
  {
    kind: 'rising_people',
    pattern:
      /\b(who('s| is) becoming (more )?important|becoming more (important|central)|who('s| is) (growing|rising) in (importance|my life)|getting closer to (anyone|someone))\b/i,
  },
  {
    kind: 'who_matters',
    pattern:
      /\b(who matters?( the)? most|most important (people|person)( in my life)?|who('s| is| are) (the )?most important|who do i care (the )?most about|closest people|who am i closest to|top people in my life)\b/i,
  },
  {
    kind: 'current_era',
    pattern:
      /\b((what|which) era ((of my life )?)?(am i|i'?m) (in|living)|era of my life|what (chapter|season) (of (my )?life )?(am i|i'?m) (in|living)|current (era|chapter) of my life)\b/i,
  },
  {
    kind: 'active_arcs',
    pattern:
      /\b((what|which) arcs? (am i|i'?m|are) (in|living|active|running)|current arcs?\b|active arcs?\b|(what|which) storylines? (am i (living|in)|are (active|running)))\b/i,
  },
  {
    kind: 'what_changed',
    pattern:
      /\b(what('s| has| is)? changed( recently| lately| over time)?|what changed (recently|lately|in my life|over time)|what('s| is) (new|different) (in|with|about) my life|how (have|has|'ve) (i|my .+) (changed|evolved|shifted)|(plans|opinions|goals|priorities|beliefs).{0,40}(changed|evolved|shifted)( over time)?|before and after|what('s| is| are) different (now|about me)( (vs|versus|compared to).*)?)\b/i,
  },
  {
    kind: 'attention',
    pattern:
      /\b(what has my attention|what('s| is) (occupying|taking up|holding) my (attention|mind|headspace)|what am i (most )?focused on|where('s| is) my (focus|attention))\b/i,
  },
  {
    kind: 'life_summary',
    pattern:
      /\b(what('s| is) my life about( right now)?|biggest thing (happening|going on)( in my life)?|what('s| is) the biggest thing in my life|where am i in life|what('s| is) (going on|happening) in my life( right now)?)\b/i,
  },
  {
    kind: 'struggles',
    pattern:
      /\b(what am i struggling with|my (biggest )?struggles?\b|what('s| is) (the )?hard(est)?( thing| part)? (for me )?(right now|lately)|what am i (dealing|wrestling) with)\b/i,
  },
];

/** Detect a cognition question. Returns null for everything retrieval handles. */
export function detectCognitionQuestion(message: string): CognitionQuestionKind | null {
  const text = message.trim();
  if (!text) return null;
  for (const { kind, pattern } of QUESTION_PATTERNS) {
    if (pattern.test(text)) return kind;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Comparison scoping — "what changed" isn't one question. A "what changed"
// question that names a scope ("my goals", "my career") must stay inside it
// instead of surfacing every detected change (new people crowd out everything
// else because they're the most common change kind).
// ---------------------------------------------------------------------------

const DIMENSION_PATTERNS: Array<{ dimension: ComparisonDimension; pattern: RegExp }> = [
  { dimension: 'goals', pattern: /\b(goals?|plans?|ambitions?)\b/i },
  { dimension: 'values', pattern: /\b(opinions?|beliefs?|values?|priorit(?:y|ies))\b/i },
  { dimension: 'career', pattern: /\b(career|job|role)\b/i },
  { dimension: 'projects', pattern: /\bprojects?\b/i },
  { dimension: 'identity', pattern: /\b(identity|sense of self|who i am|confidence)\b/i },
  { dimension: 'relationships', pattern: /\b(relationships?|friendships?|friends?|people)\b/i },
];

/**
 * Which dimensions a "what changed" question is actually scoped to.
 * Returns null for a truly generic question ("what's changed lately?") —
 * that keeps the old unfiltered behavior, since there's nothing to scope to.
 */
export function detectComparisonDimensions(question: string): Set<ComparisonDimension> | null {
  const dimensions = new Set<ComparisonDimension>();
  for (const { dimension, pattern } of DIMENSION_PATTERNS) {
    if (pattern.test(question)) dimensions.add(dimension);
  }
  return dimensions.size > 0 ? dimensions : null;
}

// "What changed recently?" and "what's changed over time?" are different
// questions — the former wants the last few weeks, the latter wants the
// full history. Without this, goal/priority evidence older than the fixed
// recency window gets silently dropped even when the question explicitly
// asked to look across all of it.
const FULL_HISTORY_PATTERN =
  /\b(over time|before and after|since (the beginning|i started|day one)|throughout|historically|over the years|ever since)\b/i;

export function wantsFullHistoryHorizon(question: string): boolean {
  return FULL_HISTORY_PATTERN.test(question);
}

// ---------------------------------------------------------------------------
// Change detection — recent window vs what came before
// ---------------------------------------------------------------------------

const CHANGE_WINDOW_DAYS = 30;
// Goals and priorities move slower than who's in your life — a wider window
// matches "what changed over time" better than the 30-day people/role window.
const GOAL_CHANGE_WINDOW_DAYS = 180;

/** Which comparison dimension owns a given active-arc kind. */
function dimensionForArcKind(kind: ActiveArcKind): ComparisonDimension {
  switch (kind) {
    case 'job_onboarding':
      return 'career';
    case 'project_build':
      return 'projects';
    case 'relationship_healing':
    case 'community_distance':
      return 'relationships';
    case 'financial_stability':
    case 'social_confidence':
    case 'health_fitness':
      return 'identity';
    default:
      return 'identity';
  }
}

export function detectRecentChanges(
  cctx: NarrativeCognitionContext,
  salience: PersonSalience[],
  arcs: ActiveArc[],
  options?: { horizon?: 'recent' | 'all_time' },
): RecentChange[] {
  const changes: RecentChange[] = [];
  const { graph, work, firstSeenByEntity, now } = cctx;
  // Goals/priorities move slower than who's in your life, and "over time"
  // questions explicitly ask to look past the default recency window.
  const goalWindowDays = options?.horizon === 'all_time' ? Infinity : GOAL_CHANGE_WINDOW_DAYS;

  if (work?.currentRole?.status === 'current' && work.organization?.name) {
    const startedRecently =
      work.tenure?.inferredStartDateRange?.earliest &&
      (daysBetween(work.tenure.inferredStartDateRange.earliest, now) ?? Infinity) <= 120;
    if (startedRecently || work.tenure?.phrase) {
      changes.push({
        kind: 'new_role',
        label: `Started as ${work.currentRole.title} at ${work.organization.name}`,
        detail: work.tenure?.phrase,
        confidence: work.currentRole.confidence,
        dimension: 'career',
      });
    }
  }

  const salienceById = new Map(salience.map((p) => [p.personId, p]));
  for (const entity of graph.entities) {
    if (entity.entityType !== 'character') continue;
    const firstSeenDays = daysBetween(firstSeenByEntity.get(entity.entityId), now);
    if (firstSeenDays != null && firstSeenDays <= CHANGE_WINDOW_DAYS) {
      const person = salienceById.get(entity.entityId);
      changes.push({
        kind: 'new_person',
        label: `${entity.name} entered your story`,
        detail: person ? person.reasonBreakdown[0] : undefined,
        confidence: 0.7,
        dimension: 'relationships',
      });
    }
  }

  for (const person of risingPeople(salience)) {
    if (changes.some((c) => c.kind === 'new_person' && c.label.startsWith(person.name))) continue;
    changes.push({
      kind: 'rising_person',
      label: `${person.name} is becoming more central`,
      confidence: person.confidence,
      dimension: 'relationships',
    });
  }

  for (const arc of arcs) {
    if (arc.kind === 'community_distance') {
      changes.push({
        kind: 'quieter_community',
        label: arc.title,
        confidence: arc.confidence,
        dimension: 'relationships',
      });
    }
  }

  const newArcs = arcs.filter((arc) => arc.status === 'emerging');
  for (const arc of newArcs) {
    changes.push({
      kind: 'new_arc',
      label: arc.title,
      confidence: arc.confidence,
      dimension: dimensionForArcKind(arc.kind),
    });
  }

  for (const goal of cctx.goals ?? []) {
    if (goal.status === 'ACTIVE') {
      const createdDays = daysBetween(goal.created_at, cctx.now);
      if (createdDays != null && createdDays <= goalWindowDays) {
        changes.push({
          kind: 'new_goal',
          label: `Took on a new goal: ${goal.title}`,
          confidence: 0.7,
          dimension: 'goals',
        });
      }
      continue;
    }
    if (goal.status === 'COMPLETED' || goal.status === 'ABANDONED') {
      const endedDays = daysBetween(goal.ended_at ?? undefined, cctx.now);
      if (endedDays != null && endedDays <= goalWindowDays) {
        changes.push({
          kind: goal.status === 'COMPLETED' ? 'goal_completed' : 'goal_abandoned',
          label:
            goal.status === 'COMPLETED'
              ? `Completed: ${goal.title}`
              : `Stepped away from: ${goal.title}`,
          confidence: 0.75,
          dimension: 'goals',
        });
      }
    }
  }

  for (const shift of cctx.priorityShifts ?? []) {
    const shiftDays = daysBetween(shift.createdAt, cctx.now);
    if (shiftDays == null || shiftDays > goalWindowDays) continue;
    const direction = shift.newPriority > shift.oldPriority ? 'grew in importance' : 'became less central';
    changes.push({
      kind: 'priority_shift',
      label: `${shift.valueName} ${direction}`,
      detail: `${shift.oldPriority.toFixed(2)} → ${shift.newPriority.toFixed(2)}`,
      confidence: 0.65,
      dimension: 'values',
    });
  }

  return changes.sort((a, b) => b.confidence - a.confidence).slice(0, 8);
}

// ---------------------------------------------------------------------------
// Context loading
// ---------------------------------------------------------------------------

export async function buildCognitionContext(userId: string): Promise<NarrativeCognitionContext> {
  const { narrativeAnchorService } = await import('./narrativeAnchorService');
  const graph: AnchorBuildContext = await narrativeAnchorService.loadBuildContext(userId);

  let work: NarrativeCognitionContext['work'] = null;
  try {
    const workModule = await import('../work');
    work = await workModule.resolveWorkContext(userId);
  } catch (err) {
    logger.debug({ err, userId }, 'narrativeCognition: work context unavailable, continuing');
  }

  const recencyByEntity = new Map<string, string>();
  const firstSeenByEntity = new Map<string, string>();
  const activityByEntity: NonNullable<NarrativeCognitionContext['activityByEntity']> = new Map();
  try {
    const { supabaseAdmin } = await import('../supabaseClient');
    const { data: links } = await supabaseAdmin
      .from('entity_conversation_links')
      .select('entity_id, entity_type, session_id, mention_count, first_linked_at, last_linked_at')
      .eq('user_id', userId)
      .eq('entity_type', 'character');
    const nowMs = Date.now();
    const recentWindowDays = 30;
    const priorWindowDays = 120;
    for (const link of links ?? []) {
      const id = link.entity_id as string;
      const last = link.last_linked_at as string | null;
      const first = link.first_linked_at as string | null;
      if (last && (!recencyByEntity.has(id) || last > recencyByEntity.get(id)!)) {
        recencyByEntity.set(id, last);
      }
      if (first && (!firstSeenByEntity.has(id) || first < firstSeenByEntity.get(id)!)) {
        firstSeenByEntity.set(id, first);
      }
      const lastMs = last ? Date.parse(last) : Number.NaN;
      if (!Number.isFinite(lastMs)) continue;
      const ageDays = Math.max(0, (nowMs - lastMs) / 86_400_000);
      const activity = activityByEntity.get(id) ?? {
        recentMentions: 0,
        priorMentions: 0,
        recentThreadIds: [],
        priorThreadIds: [],
        recentWindowDays,
        priorWindowDays,
      };
      const count = Math.max(1, Number(link.mention_count) || 1);
      const sessionId = String(link.session_id ?? '');
      if (ageDays <= recentWindowDays) {
        activity.recentMentions += count;
        if (sessionId && !activity.recentThreadIds.includes(sessionId)) activity.recentThreadIds.push(sessionId);
        if (!activity.recentLastSeen || last! > activity.recentLastSeen) activity.recentLastSeen = last!;
      } else if (ageDays <= recentWindowDays + priorWindowDays) {
        activity.priorMentions += count;
        if (sessionId && !activity.priorThreadIds.includes(sessionId)) activity.priorThreadIds.push(sessionId);
        if (!activity.priorLastSeen || last! > activity.priorLastSeen) activity.priorLastSeen = last!;
      }
      activityByEntity.set(id, activity);
    }
  } catch (err) {
    logger.debug({ err, userId }, 'narrativeCognition: recency load failed, continuing');
  }
  // Event participation also proves recency, even without conversation links.
  for (const event of graph.events) {
    if (!event.startDate) continue;
    for (const id of event.entityIds) {
      if (!recencyByEntity.has(id) || event.startDate > recencyByEntity.get(id)!) {
        recencyByEntity.set(id, event.startDate);
      }
    }
  }

  // Goals and value-priority shifts are the "plans, opinions, goals, or
  // priorities" half of "what changed" — people/role/arcs alone answer
  // "who/where changed", not "what I'm working toward changed". Reuses the
  // existing Goal Tracking & Value Alignment Engine rather than a new store.
  let goals: NarrativeCognitionContext['goals'];
  let priorityShifts: NarrativeCognitionContext['priorityShifts'];
  try {
    const { goalValueAlignmentService } = await import('../goalValueAlignmentService');
    const [goalRows, values, evolutionEvents] = await Promise.all([
      goalValueAlignmentService.getGoals(userId),
      goalValueAlignmentService.getValues(userId, false),
      goalValueAlignmentService.getValueEvolutionHistory(userId, undefined, 10),
    ]);
    goals = goalRows.map((g) => ({
      id: g.id,
      title: g.title,
      status: g.status,
      created_at: g.created_at,
      ended_at: g.ended_at,
    }));
    const valueNameById = new Map(values.map((v) => [v.id, v.name]));
    priorityShifts = evolutionEvents
      .filter((e) => valueNameById.has(e.value_id))
      .map((e) => ({
        valueName: valueNameById.get(e.value_id)!,
        oldPriority: e.old_priority,
        newPriority: e.new_priority,
        createdAt: e.created_at,
      }));
  } catch (err) {
    logger.debug({ err, userId }, 'narrativeCognition: goal/value context unavailable, continuing');
  }

  return {
    graph,
    work,
    recencyByEntity,
    firstSeenByEntity,
    activityByEntity,
    now: new Date().toISOString(),
    goals,
    priorityShifts,
  };
}

// ---------------------------------------------------------------------------
// Answer composition — humane prose, visible uncertainty, no dumps
// ---------------------------------------------------------------------------

type ResolvedCognition = {
  salience: PersonSalience[];
  arcs: ActiveArc[];
  era: LifeEra | null;
  attention: AttentionState;
};

function resolveAll(cctx: NarrativeCognitionContext): ResolvedCognition {
  const inputs = buildSalienceInputs(cctx.graph, cctx.recencyByEntity, cctx.now, cctx.activityByEntity);
  const salience = computePersonSalience(inputs, cctx.now);
  const arcs = resolveActiveArcs(cctx.graph, { work: cctx.work, salience });
  const era = resolveCurrentEra(cctx.graph, {
    work: cctx.work,
    arcs,
    salience,
    recencyByEntity: cctx.recencyByEntity,
    now: cctx.now,
  });
  const attention = resolveAttention({ arcs, salience, work: cctx.work });
  return { salience, arcs, era, attention };
}

function hedge(confidence: number): string {
  return confidence < 0.75 ? 'Based on what you\'ve shared recently, ' : '';
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function arcLine(arc: ActiveArc): string {
  const status = arc.status === 'active' ? '' : ` (${arc.status})`;
  return `- ${arc.title}${status}`;
}

function composeWhoMatters(resolved: ResolvedCognition): CognitionAnswer | null {
  const ranked = rankMostImportant(resolved.salience);
  if (ranked.length === 0) return null;
  const confidence = Math.min(
    0.85,
    ranked.reduce((sum, p) => sum + p.confidence, 0) / ranked.length,
  );
  const lines = ranked.map(
    (p, i) => `${i + 1}. **${p.name}** — ${p.reasonBreakdown.slice(0, 2).join('; ')}`,
  );
  const content =
    `${hedge(confidence)}the people most central to your life right now:\n\n` +
    `${lines.join('\n')}\n\n` +
    `I'm less certain about the exact order — importance shifts with what you're living, ` +
    `and this reflects recent weight, not all-time history.`;
  return {
    kind: 'who_matters',
    content: capitalize(content),
    confidence,
    reasoning: ranked.map((p) => `${p.name}: score ${p.score} (${p.reasonBreakdown.join(', ')})`),
  };
}

function composeRisingPeople(resolved: ResolvedCognition): CognitionAnswer | null {
  const rising = risingPeople(resolved.salience);
  if (rising.length === 0) {
    return {
      kind: 'rising_people',
      content:
        "I don't have enough grounded history in both a recent and an earlier period to say that anyone has become more relevant.",
      confidence: 0.9,
      reasoning: ['no person had both historical evidence and a measurable recent increase'],
      sources: [],
      grounded: false,
    };
  }
  const lines = rising.map((p) => {
    const comparison = p.reasonBreakdown.find((reason) => /recent mentions vs/i.test(reason));
    return `- **${p.name}** — ${comparison ?? p.reasonBreakdown.slice(0, 2).join('; ')}`;
  });
  return {
    kind: 'rising_people',
    content: capitalize(`${hedge(0.6)}these people seem to be growing more important:\n\n${lines.join('\n')}`),
    confidence: 0.6,
    reasoning: rising.map((p) => `${p.name}: rising, score ${p.score}`),
    grounded: true,
    sources: rising.flatMap((person) => {
      const evidence = person.trendEvidence;
      if (!evidence) return [];
      const recent = evidence.recentThreadIds.map((threadId) => ({
        type: 'knowledge' as const,
        id: `conversation:${threadId}`,
        title: `${person.name} — recent conversation evidence`,
        snippet: `${evidence.recentMentions} mentions in the last ${evidence.recentWindowDays} days`,
        date: evidence.recentLastSeen,
        relevanceScore: 95,
        relevanceReasons: ['recent person activity', 'supports the rising comparison'],
        usage: 'supporting' as const,
      }));
      const prior = evidence.priorThreadIds.map((threadId) => ({
        type: 'knowledge' as const,
        id: `conversation:${threadId}`,
        title: `${person.name} — earlier comparison evidence`,
        snippet: `${evidence.priorMentions} mentions in the earlier ${evidence.priorWindowDays}-day period`,
        date: evidence.priorLastSeen,
        relevanceScore: 90,
        relevanceReasons: ['historical person activity', 'provides the comparison baseline'],
        usage: 'supporting' as const,
      }));
      return [...recent, ...prior];
    }),
  };
}

function composeCurrentEra(resolved: ResolvedCognition): CognitionAnswer | null {
  const era = resolved.era;
  if (!era) return null;
  const arcLines = era.arcs.slice(0, 6).map(arcLine);
  const parts = [`${hedge(era.confidence)}you're in your **${era.title}**.`];
  if (era.startDateEstimate) parts.push(`It started around ${era.startDateEstimate.slice(0, 10)}.`);
  if (arcLines.length > 0) {
    parts.push(`\n\nOne era holds several running storylines:\n${arcLines.join('\n')}`);
  }
  if (era.majorPeople.length > 0) {
    parts.push(`\n\nThe people most present in it: ${era.majorPeople.join(', ')}.`);
  }
  const content = parts.join(' ');
  return {
    kind: 'current_era',
    content: capitalize(content),
    confidence: era.confidence,
    reasoning: [`era: ${era.title}`, ...era.themes.slice(0, 4)],
  };
}

function composeActiveArcs(resolved: ResolvedCognition): CognitionAnswer | null {
  if (resolved.arcs.length === 0) return null;
  const confidence = Math.min(0.8, resolved.arcs[0].confidence);
  const lines = resolved.arcs.slice(0, 6).map(arcLine);
  const eraNote = resolved.era ? ` inside your ${resolved.era.title}` : '';
  return {
    kind: 'active_arcs',
    content: capitalize(`${hedge(confidence)}these are the arcs running${eraNote} right now:\n\n${lines.join('\n')}`),
    confidence,
    reasoning: resolved.arcs.map((arc) => `${arc.kind}: ${arc.status} (${arc.confidence})`),
  };
}

const DIMENSION_LABELS: Record<ComparisonDimension, string> = {
  goals: 'goals',
  values: 'opinions and values',
  career: 'career',
  projects: 'projects',
  identity: 'sense of identity',
  relationships: 'relationships',
};

function composeWhatChanged(
  cctx: NarrativeCognitionContext,
  resolved: ResolvedCognition,
  question: string,
): CognitionAnswer | null {
  const horizon = wantsFullHistoryHorizon(question) ? 'all_time' : 'recent';
  const allChanges = detectRecentChanges(cctx, resolved.salience, resolved.arcs, { horizon });
  const requestedDimensions = detectComparisonDimensions(question);
  const changes = requestedDimensions
    ? allChanges.filter((c) => requestedDimensions.has(c.dimension))
    : allChanges;

  if (requestedDimensions && changes.length === 0) {
    // The question named a scope and nothing in it moved — say so plainly
    // instead of falling back to unrelated changes (e.g. new people) just to
    // fill space.
    const dims = [...requestedDimensions].map((d) => DIMENSION_LABELS[d]).join(', ');
    return {
      kind: 'what_changed',
      content: capitalize(`I don't see a meaningful shift in your ${dims} — that part of your story looks like it's held steady.`),
      confidence: 0.4,
      reasoning: [`requested dimensions: ${[...requestedDimensions].join(', ')}`, 'no matching changes in scope'],
    };
  }
  if (changes.length === 0) return null;

  const lines = changes.map((c) => `- ${c.label}${c.detail ? ` (${c.detail})` : ''}`);
  const confidence = Math.min(0.75, changes[0].confidence);
  return {
    kind: 'what_changed',
    content: capitalize(`${hedge(confidence)}here's what's shifted recently:\n\n${lines.join('\n')}`),
    confidence,
    reasoning: changes.map((c) => `${c.kind}: ${c.label}`),
  };
}

function composeAttention(resolved: ResolvedCognition): CognitionAnswer | null {
  const domains = resolved.attention.domains.filter((d) => d.weight > 0.05);
  if (domains.length === 0) return null;
  const lines = domains
    .slice(0, 5)
    .map((d) => `- **${d.domain}** (${Math.round(d.weight * 100)}%)${d.items.length ? ` — ${d.items.join(', ')}` : ''}`);
  return {
    kind: 'attention',
    content: capitalize(`${hedge(0.65)}your attention is mostly going to:\n\n${lines.join('\n')}`),
    confidence: 0.65,
    reasoning: domains.map((d) => `${d.domain}: ${d.weight}`),
  };
}

function composeLifeSummary(resolved: ResolvedCognition, cctx: NarrativeCognitionContext): CognitionAnswer | null {
  const summary = synthesizeIdentity({
    era: resolved.era,
    arcs: resolved.arcs,
    salience: resolved.salience,
    attention: resolved.attention,
    work: cctx.work,
  });
  if (!summary) return null;
  const confidence = resolved.era ? Math.min(0.8, resolved.era.confidence) : 0.55;
  return {
    kind: 'life_summary',
    content: capitalize(`${hedge(confidence)}${summary}`),
    confidence,
    reasoning: [
      ...(resolved.era ? [`era: ${resolved.era.title}`] : []),
      ...resolved.arcs.slice(0, 4).map((arc) => arc.title),
    ],
  };
}

const STRUGGLE_ARC_KINDS: ReadonlySet<ActiveArc['kind']> = new Set([
  'relationship_healing',
  'community_distance',
  'financial_stability',
  'social_confidence',
]);

function composeStruggles(resolved: ResolvedCognition): CognitionAnswer | null {
  const struggles = resolved.arcs.filter((arc) => STRUGGLE_ARC_KINDS.has(arc.kind));
  if (struggles.length === 0) return null;
  const lines = struggles.map(arcLine);
  const confidence = Math.min(0.7, struggles[0].confidence);
  return {
    kind: 'struggles',
    content: capitalize(
      `${hedge(confidence)}the heavier threads you seem to be carrying:\n\n${lines.join('\n')}\n\n` +
        `These read from your recent stories — tell me if any of them has already eased.`,
    ),
    confidence,
    reasoning: struggles.map((arc) => `${arc.kind}: ${arc.evidence[0] ?? 'evidence'}`),
  };
}

/** Pure composition over a prebuilt context — the testable core. */
export function answerCognitionQuestion(
  kind: CognitionQuestionKind,
  cctx: NarrativeCognitionContext,
  question: string = '',
): CognitionAnswer | null {
  const peopleCount = cctx.graph.entities.filter((e) => e.entityType === 'character').length;
  // Reasoning needs a graph to reason over. Thin graphs fall through to chat.
  if (peopleCount < 2 && !cctx.work?.currentRole) return null;

  const resolved = resolveAll(cctx);
  switch (kind) {
    case 'who_matters':
      return composeWhoMatters(resolved);
    case 'rising_people':
      return composeRisingPeople(resolved);
    case 'current_era':
      return composeCurrentEra(resolved);
    case 'active_arcs':
      return composeActiveArcs(resolved);
    case 'what_changed':
      return composeWhatChanged(cctx, resolved, question);
    case 'attention':
      return composeAttention(resolved);
    case 'life_summary':
      return composeLifeSummary(resolved, cctx);
    case 'struggles':
      return composeStruggles(resolved);
    default:
      return null;
  }
}

/** Load + reason + compose. Returns null when the graph can't support an answer. */
export async function answerNarrativeCognition(
  userId: string,
  kind: CognitionQuestionKind,
  question: string = '',
): Promise<CognitionAnswer | null> {
  try {
    const cctx = await buildCognitionContext(userId);
    return answerCognitionQuestion(kind, cctx, question);
  } catch (err) {
    logger.warn({ err, userId, kind }, 'narrativeCognition: answer failed, falling back to chat');
    return null;
  }
}
