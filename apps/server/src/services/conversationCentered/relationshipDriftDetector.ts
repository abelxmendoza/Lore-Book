// =====================================================
// RELATIONSHIP DRIFT DETECTOR
//
// Detects when relationships are drifting apart, breaking up, or reconnecting.
//
// Primary signal: romantic_interactions (relationship-scoped, immune to
// nickname/pronoun ambiguity — works whether the user says "Maya", "she",
// "my girlfriend", or "babe").
//
// Old approach: 4 ILIKE name searches across journal_entries + omega_messages.
// New approach: structured interaction recency + sentiment from romantic_interactions.
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export type DriftType =
  | 'drifting_apart'
  | 'growing_closer'
  | 'stable'
  | 'volatile'
  | 'breaking_up'
  | 'reconnecting';

export interface DriftDetection {
  relationshipId: string;
  driftType: DriftType;
  driftStrength: number;
  mentionFrequencyChange: number;
  sentimentChange: number;
  interactionFrequencyChange: number;
  timeSinceLastMentionDays: number;
  evidence: string;
}

export class RelationshipDriftDetector {
  async detectDriftForAll(userId: string): Promise<DriftDetection[]> {
    try {
      const { data: relationships } = await supabaseAdmin
        .from('romantic_relationships')
        .select('id, person_id, person_type')
        .eq('user_id', userId)
        .eq('status', 'active')
        .eq('is_current', true);

      if (!relationships || relationships.length === 0) return [];

      const detections: DriftDetection[] = [];
      for (const rel of relationships) {
        const detection = await this.detectDrift(
          userId, rel.id, rel.person_id, rel.person_type
        );
        if (detection) detections.push(detection);
      }
      return detections;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to detect drift for all relationships');
      return [];
    }
  }

  async detectDrift(
    userId: string,
    relationshipId: string,
    _personId: string,
    _personType: 'character' | 'omega_entity'
  ): Promise<DriftDetection | null> {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo  = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      // Load up to 40 most recent interactions — relationship-scoped, no name dependency
      const { data: raw } = await supabaseAdmin
        .from('romantic_interactions')
        .select('id, interaction_date, sentiment, was_positive, description')
        .eq('relationship_id', relationshipId)
        .order('interaction_date', { ascending: false })
        .limit(40);

      const all      = raw ?? [];
      const recent   = all.filter(i => new Date(i.interaction_date) >= thirtyDaysAgo);
      const previous = all.filter(i => {
        const d = new Date(i.interaction_date);
        return d >= sixtyDaysAgo && d < thirtyDaysAgo;
      });

      // Recency
      const lastDate = all.length > 0 ? new Date(all[0].interaction_date) : null;
      const timeSinceLastMentionDays = lastDate
        ? Math.floor((now.getTime() - lastDate.getTime()) / 86400000)
        : 999;

      // Interaction frequency change
      const recentCount   = recent.length;
      const previousCount = previous.length;
      const mentionFrequencyChange = previousCount > 0
        ? (recentCount - previousCount) / previousCount
        : recentCount > 0 ? 1 : 0;

      // Sentiment change (uses structured field, not keyword heuristic)
      const avgSentiment = (rows: typeof all) =>
        rows.length === 0 ? 0 : rows.reduce((s, r) => s + (r.sentiment ?? 0), 0) / rows.length;

      const recentSentiment   = avgSentiment(recent);
      const previousSentiment = avgSentiment(previous);
      const sentimentChange   = recentSentiment - previousSentiment;

      // Breakup keyword check from interaction descriptions
      const hasBreakupKeywords = recent.some(r =>
        ['broke up', 'breakup', 'it\'s over', 'we\'re done', 'we broke', 'ended things'].some(kw =>
          (r.description ?? '').toLowerCase().includes(kw)
        )
      );

      // Classify drift
      let driftType: DriftType = 'stable';
      let driftStrength = 0.5;

      if (hasBreakupKeywords || (mentionFrequencyChange < -0.8 && timeSinceLastMentionDays > 14)) {
        driftType     = 'breaking_up';
        driftStrength = 0.9;
      } else if (mentionFrequencyChange < -0.5 && sentimentChange < -0.3) {
        driftType     = 'drifting_apart';
        driftStrength = Math.min(1, Math.abs(mentionFrequencyChange) + Math.abs(sentimentChange));
      } else if (mentionFrequencyChange > 0.5 && sentimentChange > 0.3) {
        driftType     = 'growing_closer';
        driftStrength = Math.min(1, mentionFrequencyChange + sentimentChange);
      } else if (timeSinceLastMentionDays > 14 && recentCount === 0) {
        driftType     = 'drifting_apart';
        driftStrength = Math.min(1, timeSinceLastMentionDays / 30);
      } else if (Math.abs(sentimentChange) > 0.5) {
        driftType     = 'volatile';
        driftStrength = Math.abs(sentimentChange);
      } else if (mentionFrequencyChange > 0.2 && sentimentChange > 0.1) {
        driftType     = 'reconnecting';
        driftStrength = Math.min(1, mentionFrequencyChange + sentimentChange);
      }

      if (driftStrength <= 0.4 && driftType !== 'breaking_up') return null;

      const evidence = recentCount > 0
        ? `${recentCount} interactions in last 30 days (avg sentiment: ${recentSentiment.toFixed(2)})`
        : 'No logged interactions in last 30 days';

      await supabaseAdmin.from('relationship_drift').insert({
        user_id:                    userId,
        relationship_id:            relationshipId,
        drift_type:                 driftType,
        drift_strength:             driftStrength,
        mention_frequency_change:   mentionFrequencyChange,
        sentiment_change:           sentimentChange,
        interaction_frequency_change: mentionFrequencyChange,
        time_since_last_mention_days: timeSinceLastMentionDays,
        evidence,
        source_entry_ids:           recent.map(i => i.id),
      });

      return {
        relationshipId,
        driftType,
        driftStrength,
        mentionFrequencyChange,
        sentimentChange,
        interactionFrequencyChange: mentionFrequencyChange,
        timeSinceLastMentionDays,
        evidence,
      };
    } catch (error) {
      logger.error({ error, relationshipId }, 'Failed to detect drift');
      return null;
    }
  }
}

export const relationshipDriftDetector = new RelationshipDriftDetector();
