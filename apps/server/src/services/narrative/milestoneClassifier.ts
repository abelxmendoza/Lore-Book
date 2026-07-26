/**
 * Milestone tier of the Day Story -> Milestone -> Period -> Arc -> Chapter ->
 * Era hierarchy. Adapts eventSignificanceService.ts's existing sub-scores
 * into the milestone shape rather than writing a second NLP heuristic engine
 * from scratch — same [0,100] clamp-and-threshold shape as the existing
 * cascading scorers (eventSignificance.ts, sceneSignificance.ts, ...).
 */

import { supabaseAdmin } from '../supabaseClient';
import { logger } from '../../logger';
import {
  calculateEventSignificance,
  computeEventSignificance,
  type SignificanceInputs,
} from '../events/eventSignificanceService';

export type MilestoneAssessment = {
  firstTime: boolean;
  transitionStrength: number;
  identityImpact: number;
  publicCommitment: boolean;
  projectProgress: number;
  careerProgress: number;
  relationshipImpact: number;
  emotionalImportance: number;
  futureConsequence: number;
  explicitUserImportance: boolean;
  finalScore: number;
  eligible: boolean;
  reasons: string[];
};

/** Threshold matches the existing significance_level: 'major' cutoff, for continuity. */
export const MILESTONE_ELIGIBLE_THRESHOLD = 60;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const PUBLIC_COMMITMENT_RE =
  /\b(told everyone|announced|posted about|shared with everyone|made it official|put it out there|going public)\b/i;

/**
 * Pure: assess a milestone from already-computed significance signals. No DB
 * access — callers fetch the event + signals (via eventSignificanceService)
 * and pass them in, matching computeEventSignificance's own pure-function
 * shape.
 */
export function assessMilestone(
  event: { title: string; summary?: string | null },
  signals: SignificanceInputs,
): MilestoneAssessment {
  const { significanceScore } = computeEventSignificance(signals);
  const text = `${event.title} ${event.summary ?? ''}`;

  const firstTime = signals.isFirstOccurrence;
  const transitionStrength = signals.hasLifeChangeIndicator ? 100 : signals.hasExplicitMeaning ? 50 : 0;
  const identityImpact = clamp(signals.identityImpactCount * 20, 0, 100);
  const publicCommitment = PUBLIC_COMMITMENT_RE.test(text);
  const projectProgress = 0; // No project-progress signal exists yet — left at 0 rather than guessed.
  const careerProgress = signals.careerImpact * 100;
  const relationshipImpact = signals.relationshipImpact * 100;
  const emotionalImportance = clamp(signals.emotionalIntensity * 100, 0, 100);
  const futureConsequence = signals.hasLifeChangeIndicator ? 80 : 0;
  const explicitUserImportance = signals.hasExplicitMeaning;

  const finalScore = significanceScore;
  const eligible = finalScore >= MILESTONE_ELIGIBLE_THRESHOLD;

  const reasons: string[] = [];
  if (firstTime) reasons.push('first_occurrence');
  if (signals.hasLifeChangeIndicator) reasons.push('life_change_indicator');
  if (signals.hasExplicitMeaning) reasons.push('explicit_user_importance');
  if (publicCommitment) reasons.push('public_commitment');
  if (careerProgress > 0) reasons.push('career_impact');
  if (relationshipImpact > 0) reasons.push('relationship_impact');
  if (!eligible) reasons.push('below_milestone_threshold');

  return {
    firstTime,
    transitionStrength,
    identityImpact,
    publicCommitment,
    projectProgress,
    careerProgress,
    relationshipImpact,
    emotionalImportance,
    futureConsequence,
    explicitUserImportance,
    finalScore,
    eligible,
    reasons,
  };
}

/**
 * Fetch signals for a real event, assess it, and persist to
 * narrative_milestones — mirrors eventSignificanceService's calculate/
 * persist/scoreAndPersist pattern. Corrections in narrative_hierarchy_
 * corrections are checked first so a rebuild never re-creates a row the
 * user explicitly dismissed/demoted.
 */
export async function assessAndPersistMilestone(
  userId: string,
  eventId: string
): Promise<MilestoneAssessment | null> {
  const { data: correction } = await supabaseAdmin
    .from('narrative_hierarchy_corrections')
    .select('id, correction_type')
    .eq('user_id', userId)
    .eq('object_type', 'milestone')
    .eq('object_id', eventId)
    .in('correction_type', ['remove_event', 'demote', 'archive'])
    .limit(1)
    .maybeSingle();
  if (correction) {
    logger.debug({ userId, eventId, correction: correction.correction_type }, 'Milestone assembly skipped — user correction on file');
    return null;
  }

  const { data: event } = await supabaseAdmin
    .from('resolved_events')
    .select('id, title, summary, start_time')
    .eq('id', eventId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!event) return null;

  const { inputs } = await calculateEventSignificance(userId, eventId);
  const assessment = assessMilestone({ title: event.title, summary: event.summary }, inputs);

  await supabaseAdmin
    .from('narrative_milestones')
    .upsert(
      {
        user_id: userId,
        event_id: eventId,
        title: event.title,
        occurred_at: event.start_time ?? null,
        first_time: assessment.firstTime,
        transition_strength: Math.round(assessment.transitionStrength),
        identity_impact: Math.round(assessment.identityImpact),
        public_commitment: assessment.publicCommitment,
        project_progress: Math.round(assessment.projectProgress),
        career_progress: Math.round(assessment.careerProgress),
        relationship_impact: Math.round(assessment.relationshipImpact),
        emotional_importance: Math.round(assessment.emotionalImportance),
        future_consequence: Math.round(assessment.futureConsequence),
        explicit_user_importance: assessment.explicitUserImportance,
        final_score: Math.round(assessment.finalScore),
        eligible: assessment.eligible,
        reasons: assessment.reasons,
        title_source: 'SYSTEM_SYNTHESIZED',
        evidence_ids: [eventId],
        generator_version: 'v1',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,event_id' }
    );

  return assessment;
}
