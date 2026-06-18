/**
 * Narrative Structure Bridge — pure lexical analysis → graph roles.
 *
 * Maps glossary-derived stage/discourse signals to narrative_role and arc
 * membership hints consumed by narrativeStructureService.
 */
import {
  detectDiscourseMoves,
  detectNarrativeStages,
  hasStoryFrameCue,
  type DiscourseMove,
  type DiscourseSignal,
  type NarrativeStage,
  type NarrativeStageSignal,
} from '../ontology/discourseStance';
import type { MembershipRole } from '../continuityRuntime/arcs/arcMembershipService';

export type NarrativeRole = 'origin' | 'turning_point' | 'resolution' | 'recurring';

export interface NarrativeStructureAnalysis {
  stages: NarrativeStageSignal[];
  discourse: DiscourseSignal[];
  /** Highest-priority narrative_role for event_interpretations / graph edges */
  primaryNarrativeRole: NarrativeRole | null;
  /** Suggested arc_memberships.role when linking event_candidates */
  primaryArcMembershipRole: MembershipRole | null;
  isStoryBlock: boolean;
}

const STAGE_TO_NARRATIVE_ROLE: Partial<Record<NarrativeStage, NarrativeRole>> = {
  SETUP: 'origin',
  INCITING: 'turning_point',
  ESCALATION: 'turning_point',
  CLIMAX: 'turning_point',
  FALLING: 'resolution',
  REFLECTION: 'resolution',
  CODA: 'resolution',
};

const STAGE_TO_ARC_ROLE: Partial<Record<NarrativeStage, MembershipRole>> = {
  INCITING: 'turning_point',
  ESCALATION: 'turning_point',
  CLIMAX: 'turning_point',
  SETUP: 'defining_moment',
  REFLECTION: 'transition',
  CODA: 'background',
};

const STAGE_PRIORITY: NarrativeStage[] = [
  'CLIMAX',
  'INCITING',
  'ESCALATION',
  'SETUP',
  'REFLECTION',
  'FALLING',
  'CODA',
];

export function stageToNarrativeRole(stage: NarrativeStage): NarrativeRole | null {
  return STAGE_TO_NARRATIVE_ROLE[stage] ?? null;
}

export function stageToArcMembershipRole(stage: NarrativeStage): MembershipRole | null {
  return STAGE_TO_ARC_ROLE[stage] ?? null;
}

export function analyzeNarrativeStructure(text: string): NarrativeStructureAnalysis {
  const stages = detectNarrativeStages(text);
  const discourse = detectDiscourseMoves(text);
  const isStoryBlock = hasStoryFrameCue(text) || stages.length >= 2;

  let primaryNarrativeRole: NarrativeRole | null = null;
  let primaryArcMembershipRole: MembershipRole | null = null;

  for (const stageKey of STAGE_PRIORITY) {
    const hit = stages.find((s) => s.stage === stageKey);
    if (!hit) continue;
    primaryNarrativeRole = stageToNarrativeRole(hit.stage);
    primaryArcMembershipRole = stageToArcMembershipRole(hit.stage);
    break;
  }

  return {
    stages,
    discourse,
    primaryNarrativeRole,
    primaryArcMembershipRole,
    isStoryBlock,
  };
}

/** Per-segment enrichment for backward storytelling. */
export function analyzeSegmentStructure(segmentText: string): {
  narrative_stages: Array<{ stage: NarrativeStage; cue: string; confidence: number }>;
  discourse_moves: Array<{ move: DiscourseMove; cue: string; confidence: number }>;
} {
  const stages = detectNarrativeStages(segmentText);
  const discourse = detectDiscourseMoves(segmentText);
  return {
    narrative_stages: stages.map((s) => ({ stage: s.stage, cue: s.cue, confidence: s.confidence })),
    discourse_moves: discourse.map((d) => ({ move: d.move, cue: d.cue, confidence: d.confidence })),
  };
}

export function hasNarrativeStructureSignals(text: string): boolean {
  const a = analyzeNarrativeStructure(text);
  return a.stages.length > 0 || a.discourse.length > 0;
}
