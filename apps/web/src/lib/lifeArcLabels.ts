import type { LifeArc } from '../hooks/useLifeArcs';

export type NarrativeConsolidationMetadata = {
  detector?: string;
  consolidation_key?: string;
  dominant_stages?: string[];
  source_event_ids?: string[];
  proposed?: boolean;
};

export function getArcMetadata(arc: LifeArc): NarrativeConsolidationMetadata | undefined {
  return arc.metadata as NarrativeConsolidationMetadata | undefined;
}

export function isNarrativeConsolidationArc(arc: LifeArc): boolean {
  const meta = getArcMetadata(arc);
  return (
    meta?.detector === 'narrative_consolidation' ||
    meta?.detector === 'narrative_chapter' ||
    arc.tags?.includes('narrative_consolidation') === true
  );
}

export function formatNarrativeStages(arc: LifeArc): string[] {
  const meta = getArcMetadata(arc);
  if (meta?.dominant_stages?.length) return meta.dominant_stages;
  return (arc.tags ?? []).filter((t) => t !== 'narrative_consolidation');
}

export const STAGE_LABELS: Record<string, string> = {
  SETUP: 'Setup',
  INCITING: 'Inciting',
  ESCALATION: 'Escalation',
  CLIMAX: 'Climax',
  FALLING: 'Falling',
  REFLECTION: 'Reflection',
  CODA: 'Coda',
};
