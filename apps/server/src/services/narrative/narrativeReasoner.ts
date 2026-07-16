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
  AttentionState,
  CognitionAnswer,
  CognitionQuestionKind,
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
      /\b(what('s| has| is)? changed( recently| lately)?|what changed (recently|lately|in my life)|what('s| is) (new|different) (in|with|about) my life)\b/i,
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
// Change detection — recent window vs what came before
// ---------------------------------------------------------------------------

const CHANGE_WINDOW_DAYS = 30;

export function detectRecentChanges(
  cctx: NarrativeCognitionContext,
  salience: PersonSalience[],
  arcs: ActiveArc[],
): RecentChange[] {
  const changes: RecentChange[] = [];
  const { graph, work, firstSeenByEntity, now } = cctx;

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
      });
    }
  }

  for (const person of risingPeople(salience)) {
    if (changes.some((c) => c.kind === 'new_person' && c.label.startsWith(person.name))) continue;
    changes.push({
      kind: 'rising_person',
      label: `${person.name} is becoming more central`,
      confidence: person.confidence,
    });
  }

  for (const arc of arcs) {
    if (arc.kind === 'community_distance') {
      changes.push({
        kind: 'quieter_community',
        label: arc.title,
        confidence: arc.confidence,
      });
    }
  }

  const newArcs = arcs.filter((arc) => arc.status === 'emerging');
  for (const arc of newArcs) {
    changes.push({ kind: 'new_arc', label: arc.title, confidence: arc.confidence });
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
  try {
    const { supabaseAdmin } = await import('../supabaseClient');
    const { data: links } = await supabaseAdmin
      .from('entity_conversation_links')
      .select('entity_id, first_linked_at, last_linked_at')
      .eq('user_id', userId);
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

  return { graph, work, recencyByEntity, firstSeenByEntity, now: new Date().toISOString() };
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
  const inputs = buildSalienceInputs(cctx.graph, cctx.recencyByEntity, cctx.now);
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
        'No one new is clearly rising in importance right now — the people around you have been steady presences.',
      confidence: 0.5,
      reasoning: ['no rising-trend people in salience'],
    };
  }
  const lines = rising.map((p) => `- **${p.name}** — ${p.reasonBreakdown.slice(0, 2).join('; ')}`);
  return {
    kind: 'rising_people',
    content: capitalize(`${hedge(0.6)}these people seem to be growing more important:\n\n${lines.join('\n')}`),
    confidence: 0.6,
    reasoning: rising.map((p) => `${p.name}: rising, score ${p.score}`),
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

function composeWhatChanged(
  cctx: NarrativeCognitionContext,
  resolved: ResolvedCognition,
): CognitionAnswer | null {
  const changes = detectRecentChanges(cctx, resolved.salience, resolved.arcs);
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
      return composeWhatChanged(cctx, resolved);
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
): Promise<CognitionAnswer | null> {
  try {
    const cctx = await buildCognitionContext(userId);
    return answerCognitionQuestion(kind, cctx);
  } catch (err) {
    logger.warn({ err, userId, kind }, 'narrativeCognition: answer failed, falling back to chat');
    return null;
  }
}
