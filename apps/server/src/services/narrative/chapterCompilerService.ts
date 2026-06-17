/**
 * Chapter Compiler — synthesize current life chapter from episodes, goals, projects, relationships.
 */
import type { LifeArcSynthesis } from '../continuityRuntime/arcs/lifeArcSynthesisService';
import type { CompiledChapter, NarrativeEvidence } from './types';

function inferDateRange(synthesis: LifeArcSynthesis): { start: string | null; end: string | null } {
  const dates: string[] = [];
  for (const arc of synthesis.enrichedArcs) {
    if (arc.startDate) dates.push(arc.startDate);
    if (arc.latestActivity) dates.push(arc.latestActivity);
  }
  if (dates.length === 0) {
    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    return { start: threeMonthsAgo.toISOString().split('T')[0], end: now.toISOString().split('T')[0] };
  }
  dates.sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}

function dominantTheme(synthesis: LifeArcSynthesis): string {
  const top = [...synthesis.enrichedArcs]
    .sort((a, b) => b.score - a.score)[0];
  return top?.category ?? 'life';
}

function buildEvidence(synthesis: LifeArcSynthesis): NarrativeEvidence[] {
  const out: NarrativeEvidence[] = [];
  let i = 0;
  for (const arc of synthesis.enrichedArcs.slice(0, 5)) {
    for (const ref of arc.provenance.episodes.slice(0, 2)) {
      out.push({
        id: `ch-ev-${i++}`,
        label: ref.label,
        source: 'episode',
        date: ref.date,
        confidence: arc.provenance.confidence,
        storyState: 'compiled',
      });
    }
    for (const ref of arc.provenance.goals.slice(0, 1)) {
      out.push({
        id: `ch-ev-${i++}`,
        label: ref.label,
        source: 'goal',
        date: ref.date,
        confidence: arc.provenance.confidence,
        storyState: 'confirmed',
      });
    }
  }
  for (const ev of synthesis.currentChapter.evidence.slice(0, 5)) {
    out.push({
      id: `ch-ev-${i++}`,
      label: ev,
      source: 'narrative',
      confidence: 0.7,
      storyState: 'compiled',
    });
  }
  return out;
}

export function compileChapter(synthesis: LifeArcSynthesis): CompiledChapter {
  const range = inferDateRange(synthesis);
  const theme = dominantTheme(synthesis);
  const evidence = buildEvidence(synthesis);
  const avgConfidence =
    synthesis.enrichedArcs.length > 0
      ? synthesis.enrichedArcs.reduce((s, a) => s + a.provenance.confidence, 0) / synthesis.enrichedArcs.length
      : 0.5;

  return {
    title: synthesis.currentChapter.label || 'Current Chapter',
    summary: synthesis.currentChapter.narrative,
    startDate: range.start,
    endDate: range.end,
    dominantTheme: theme,
    confidence: Math.round(avgConfidence * 100) / 100,
    evidenceCount: evidence.length,
    evidence,
    storyState: evidence.length >= 3 ? 'compiled' : evidence.length >= 1 ? 'confirmed' : 'draft',
  };
}
