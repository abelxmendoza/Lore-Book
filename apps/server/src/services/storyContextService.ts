/**
 * Story Context Packet — targeted prompt injection for story-aware chat.
 * Read-only projection from lifeArcSynthesisService / lifeStoryApiService.
 */
import type { WorkingMemoryIntent } from './chat/workingMemoryAssembler';
import { logger } from '../logger';
import { synthesizeLifeArcs, type EnrichedLifeArc, type LifeArcSynthesis } from './continuityRuntime/arcs/lifeArcSynthesisService';

export type StoryResponseType =
  | 'FACT_RESPONSE'
  | 'MEMORY_RESPONSE'
  | 'STORY_RESPONSE'
  | 'INSIGHT_RESPONSE'
  | 'DIRECTION_RESPONSE';

export type StoryContext = {
  responseType: StoryResponseType;
  intent: WorkingMemoryIntent;
  currentChapter: LifeArcSynthesis['currentChapter'];
  topArcs: EnrichedLifeArc[];
  activeConflicts: LifeArcSynthesis['conflicts'];
  momentumSummary: {
    emerging: number;
    growing: number;
    stable: number;
    declining: number;
    completed: number;
    items: Array<{ title: string; momentum: string; evidenceCount: number }>;
  };
  lifeDirection: LifeArcSynthesis['lifeDirection'];
  confidence: number;
  evidenceCount: number;
  provenanceExplanation: string;
  familyContext?: import('./kinship/familyGraphService').FamilyStoryContext;
  text: string;
  generatedAt: string;
  synthesis: LifeArcSynthesis;
};

export const STORY_INTENTS = new Set<WorkingMemoryIntent>([
  'ARC_QUERY',
  'CHAPTER_QUERY',
  'CONFLICT_QUERY',
  'DIRECTION_QUERY',
  'MOMENTUM_QUERY',
  'IDENTITY_QUERY',
]);

export function isStoryIntent(intent: WorkingMemoryIntent): boolean {
  return STORY_INTENTS.has(intent);
}

export function classifyResponseType(intent: WorkingMemoryIntent): StoryResponseType {
  switch (intent) {
    case 'CHAPTER_QUERY':
    case 'ARC_QUERY':
      return 'STORY_RESPONSE';
    case 'CONFLICT_QUERY':
      return 'INSIGHT_RESPONSE';
    case 'DIRECTION_QUERY':
    case 'MOMENTUM_QUERY':
    case 'GOAL_QUERY':
      return 'DIRECTION_RESPONSE';
    case 'IDENTITY_QUERY':
      return 'STORY_RESPONSE';
    case 'EVENT_QUERY':
    case 'PERSON_QUERY':
    case 'PLACE_QUERY':
    case 'RELATIONSHIP_QUERY':
      return 'MEMORY_RESPONSE';
    case 'PROJECT_QUERY':
    case 'SKILL_QUERY':
    case 'COMMUNITY_QUERY':
      return 'FACT_RESPONSE';
    default:
      return 'MEMORY_RESPONSE';
  }
}

const RESPONSE_RULES: Record<StoryResponseType, string> = {
  STORY_RESPONSE:
    'Lead with the Current Chapter and named life arcs. Cite arc evidence and provenance. Do not list isolated memories first.',
  DIRECTION_RESPONSE:
    'Lead with life direction (moving toward, gaining momentum, fading, deserves attention). Connect arcs to where life is heading. Avoid generic coaching.',
  INSIGHT_RESPONSE:
    'Lead with named conflicts/tensions and their evidence. Explain tradeoffs between arcs/goals. Do not minimize tensions.',
  MEMORY_RESPONSE:
    'Lead with specific retrieved memories (people, places, events). Use arcs only as supporting framing if directly relevant.',
  FACT_RESPONSE:
    'Lead with concrete facts from working memory (projects, skills, communities). Keep narrative brief unless asked.',
};

function buildProvenanceExplanation(arcs: EnrichedLifeArc[], synthesis: LifeArcSynthesis): string {
  const lines: string[] = [];
  for (const arc of arcs.slice(0, 3)) {
    const bits: string[] = [];
    if (arc.provenance.episodes.length) {
      bits.push(...arc.provenance.episodes.slice(0, 2).map((e) => e.label));
    }
    if (arc.provenance.projects.length) {
      bits.push(...arc.provenance.projects.slice(0, 2).map((p) => p.label));
    }
    if (arc.provenance.goals.length) {
      bits.push(...arc.provenance.goals.slice(0, 2).map((g) => g.label));
    }
    if (arc.provenance.events.length) {
      bits.push(...arc.provenance.events.slice(0, 1).map((e) => e.label));
    }
    if (!bits.length) bits.push(...arc.evidence.slice(0, 2));
    lines.push(
      `I believe your ${arc.title} is ${arc.momentum} because of: ${bits.slice(0, 4).join('; ')}`
    );
  }
  if (synthesis.conflicts.length) {
    const top = synthesis.conflicts[0];
    lines.push(`Conflict signal: ${top.label} (${top.severity}) — ${top.evidence.join(' · ')}`);
  }
  return lines.join('\n');
}

function focusArcs(intent: WorkingMemoryIntent, arcs: EnrichedLifeArc[]): EnrichedLifeArc[] {
  if (intent === 'MOMENTUM_QUERY') {
    return arcs.filter((a) => a.momentum === 'growing' || a.momentum === 'emerging').slice(0, 5);
  }
  if (intent === 'CONFLICT_QUERY') return arcs.slice(0, 4);
  return arcs.slice(0, 5);
}

function buildPromptText(ctx: Omit<StoryContext, 'text'>): string {
  const lines = [
    '**STORY CONTEXT** (authoritative narrative intelligence — answer from this BEFORE isolated memories)',
    `Response type: ${ctx.responseType}`,
    `Rules: ${RESPONSE_RULES[ctx.responseType]}`,
    '',
    `**Current Chapter:** ${ctx.currentChapter.narrative}`,
    `Evidence: ${ctx.currentChapter.evidence.join('; ') || 'sparse'}`,
    '',
    '**Top Life Arcs:**',
    ...ctx.topArcs.map(
      (a) =>
        `- ${a.title} [${a.category} | ${a.momentum} | confidence=${a.provenance.confidence}] — ${a.evidence.slice(0, 2).join('; ')} (${a.provenance.evidenceCount} refs)`
    ),
    '',
    '**Momentum:**',
    `growing=${ctx.momentumSummary.growing} emerging=${ctx.momentumSummary.emerging} stable=${ctx.momentumSummary.stable} declining=${ctx.momentumSummary.declining}`,
    '',
    '**Life Direction:**',
    `- Moving toward: ${ctx.lifeDirection.movingToward.join(', ') || 'unclear'}`,
    `- Gaining momentum: ${ctx.lifeDirection.gainingMomentum.join(', ') || 'none'}`,
    `- Fading: ${ctx.lifeDirection.fading.join(', ') || 'none'}`,
    `- Deserves attention: ${ctx.lifeDirection.deservesAttention.join(', ') || 'none'}`,
  ];

  if (ctx.activeConflicts.length) {
    lines.push('', '**Active Conflicts:**');
    for (const c of ctx.activeConflicts) {
      lines.push(`- [${c.severity}] ${c.label}: ${c.evidence.join(' · ')}`);
    }
  }

  if (ctx.familyContext && ctx.familyContext.topFamilyMembers.length > 0) {
    lines.push('', '**Family Intelligence:**');
    lines.push(ctx.familyContext.themeSummary);
    if (ctx.familyContext.householdHighlight) lines.push(ctx.familyContext.householdHighlight);
    lines.push(
      'Key relatives:',
      ...ctx.familyContext.topFamilyMembers.map(
        (m) => `- ${m.name} (${m.role}) strength=${m.strength.toFixed(2)}`
      )
    );
    if (ctx.familyContext.familyGroupNames.length) {
      lines.push(`Family groups: ${ctx.familyContext.familyGroupNames.join(', ')}`);
    }
  }

  lines.push(
    '',
    '**WHY (provenance — cite when explaining story claims):**',
    ctx.provenanceExplanation,
    '',
    `Aggregate confidence: ${ctx.confidence.toFixed(2)} | evidence refs: ${ctx.evidenceCount}`,
    '',
    'If the user asks why you think something, quote the provenance lines above with specific memory labels.'
  );

  return lines.join('\n');
}

export async function buildStoryContext(
  userId: string,
  intent: WorkingMemoryIntent
): Promise<StoryContext> {
  const synthesis = await synthesizeLifeArcs(userId);
  const topArcs = focusArcs(intent, synthesis.enrichedArcs);
  const activeConflicts =
    intent === 'CONFLICT_QUERY'
      ? synthesis.conflicts
      : synthesis.conflicts.filter((c) => c.severity !== 'low').slice(0, 4);

  const momentumSummary = {
    emerging: synthesis.enrichedArcs.filter((a) => a.momentum === 'emerging').length,
    growing: synthesis.enrichedArcs.filter((a) => a.momentum === 'growing').length,
    stable: synthesis.enrichedArcs.filter((a) => a.momentum === 'stable').length,
    declining: synthesis.enrichedArcs.filter((a) => a.momentum === 'declining').length,
    completed: synthesis.enrichedArcs.filter((a) => a.momentum === 'completed').length,
    items: synthesis.enrichedArcs.map((a) => ({
      title: a.title,
      momentum: a.momentum,
      evidenceCount: a.provenance.evidenceCount,
    })),
  };

  const evidenceCount = topArcs.reduce((s, a) => s + a.provenance.evidenceCount, 0);
  const confidence =
    topArcs.length > 0
      ? topArcs.reduce((s, a) => s + a.provenance.confidence, 0) / topArcs.length
      : 0;

  const provenanceExplanation = buildProvenanceExplanation(topArcs, synthesis);
  const responseType = classifyResponseType(intent);

  let familyContext: import('./kinship/familyGraphService').FamilyStoryContext | undefined;
  try {
    const { familyGraphService } = await import('./kinship/familyGraphService');
    familyContext = await familyGraphService.getStoryContext(userId);
    if (familyContext.topFamilyMembers.length === 0) familyContext = undefined;
  } catch (err) {
    logger.debug({ err, userId }, 'Family story context unavailable (non-fatal)');
  }

  const core = {
    responseType,
    intent,
    currentChapter: synthesis.currentChapter,
    topArcs,
    activeConflicts,
    momentumSummary,
    lifeDirection: synthesis.lifeDirection,
    confidence,
    evidenceCount,
    provenanceExplanation,
    familyContext,
    generatedAt: synthesis.generatedAt,
  };

  return { ...core, text: buildPromptText(core), synthesis };
}

export const storyContextService = { buildStoryContext, isStoryIntent, classifyResponseType };
