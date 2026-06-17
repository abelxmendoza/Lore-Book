/**
 * Story Health — coverage, gaps, orphans, confidence distribution.
 */
import { supabaseAdmin } from '../supabaseClient';
import type { NarrativeIR, StoryHealthMetrics, StoryState } from './types';

export async function computeStoryHealth(userId: string, ir: NarrativeIR): Promise<StoryHealthMetrics> {
  const [{ count: orphanEvents }, { count: unresolvedEntities }] = await Promise.all([
    supabaseAdmin
      .from('resolved_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('episode_id', null)
      .then((r) => r)
      .catch(() => ({ count: 0 })),
    supabaseAdmin
      .from('people_places')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('resolved', false)
      .then((r) => r)
      .catch(() => ({ count: 0 })),
  ]);

  const totalSignals =
    ir.goals.length +
    ir.projects.length +
    ir.relationships.length +
    ir.turningPoints.length +
    ir.activeArcs.length +
    ir.dormantArcs.length;

  const linkedSignals =
    ir.activeArcs.reduce((s, a) => s + a.evidence.length, 0) +
    ir.turningPoints.reduce((s, t) => s + t.evidence.length, 0) +
    ir.currentChapter.evidenceCount;

  const coverage = totalSignals > 0 ? Math.min(1, linkedSignals / (totalSignals * 2)) : 0;

  const confidences = [
    ir.currentChapter.confidence,
    ...ir.activeArcs.map((a) => a.confidence),
    ...ir.turningPoints.map((t) => t.confidence),
  ];
  const low = confidences.filter((c) => c < 0.5).length;
  const medium = confidences.filter((c) => c >= 0.5 && c < 0.8).length;
  const high = confidences.filter((c) => c >= 0.8).length;

  const storyStateCounts: Record<StoryState, number> = {
    draft: 0,
    confirmed: 0,
    compiled: 0,
    archived: 0,
  };
  for (const ev of ir.evidence) {
    const st = ev.storyState ?? 'draft';
    storyStateCounts[st]++;
  }

  const unsupported = ir.activeArcs.filter((a) => a.confidence < 0.4 || a.evidence.length < 2).length;

  const missingPeriods: StoryHealthMetrics['missingPeriods'] = [];
  if (ir.currentChapter.startDate && ir.timeline.length < 5) {
    missingPeriods.push({
      start: ir.currentChapter.startDate,
      end: ir.currentChapter.endDate ?? new Date().toISOString().split('T')[0],
      label: 'Sparse timeline in current chapter',
    });
  }

  return {
    coverage: Math.round(coverage * 100) / 100,
    missingPeriods,
    orphanEventCount: orphanEvents ?? 0,
    unresolvedEntityCount: unresolvedEntities ?? 0,
    unsupportedConclusionCount: unsupported,
    confidenceDistribution: { low, medium, high },
    storyStateCounts,
  };
}
