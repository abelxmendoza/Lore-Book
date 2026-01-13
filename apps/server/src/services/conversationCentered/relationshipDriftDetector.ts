// =====================================================
// RELATIONSHIP DRIFT DETECTOR
// Purpose: Detect when relationships are drifting apart, breaking up, or reconnecting
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
  driftStrength: number; // 0-1
  mentionFrequencyChange: number;
  sentimentChange: number;
  interactionFrequencyChange: number;
  timeSinceLastMentionDays: number;
  evidence: string;
}

export class RelationshipDriftDetector {
  /**
   * Detect drift for all relationships
   */
  async detectDriftForAll(userId: string): Promise<DriftDetection[]> {
    try {
      // Get all active relationships
      const { data: relationships } = await supabaseAdmin
        .from('romantic_relationships')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .eq('is_current', true);

      if (!relationships || relationships.length === 0) {
        return [];
      }

      const detections: DriftDetection[] = [];

      for (const rel of relationships) {
        const detection = await this.detectDrift(userId, rel.id, rel.person_id, rel.person_type);
        if (detection) {
          detections.push(detection);
        }
      }

      return detections;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to detect drift for all relationships');
      return [];
    }
  }

  /**
   * Detect drift for a specific relationship
   */
  async detectDrift(
    userId: string,
    relationshipId: string,
    personId: string,
    personType: 'character' | 'omega_entity'
  ): Promise<DriftDetection | null> {
    try {
      // Get person name
      let personName = 'Unknown';
      if (personType === 'character') {
        const { data: character } = await supabaseAdmin
          .from('characters')
          .select('name')
          .eq('id', personId)
          .eq('user_id', userId)
          .single();
        personName = character?.name || 'Unknown';
      } else {
        const { data: entity } = await supabaseAdmin
          .from('omega_entities')
          .select('primary_name')
          .eq('id', personId)
          .eq('user_id', userId)
          .single();
        personName = entity?.primary_name || 'Unknown';
      }

      // Get mentions in last 30 days vs previous 30 days
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      // Recent period (last 30 days)
      const { data: recentMentions } = await supabaseAdmin
        .from('journal_entries')
        .select('id, created_at, content')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .ilike('content', `%${personName}%`);

      const { data: recentMessages } = await supabaseAdmin
        .from('omega_messages')
        .select('id, created_at, content')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .ilike('content', `%${personName}%`);

      // Previous period (30-60 days ago)
      const { data: previousMentions } = await supabaseAdmin
        .from('journal_entries')
        .select('id, created_at, content')
        .eq('user_id', userId)
        .gte('created_at', sixtyDaysAgo.toISOString())
        .lt('created_at', thirtyDaysAgo.toISOString())
        .ilike('content', `%${personName}%`);

      const { data: previousMessages } = await supabaseAdmin
        .from('omega_messages')
        .select('id, created_at, content')
        .eq('user_id', userId)
        .gte('created_at', sixtyDaysAgo.toISOString())
        .lt('created_at', thirtyDaysAgo.toISOString())
        .ilike('content', `%${personName}%`);

      const recentCount = (recentMentions?.length || 0) + (recentMessages?.length || 0);
      const previousCount = (previousMentions?.length || 0) + (previousMessages?.length || 0);

      // Calculate changes
      const mentionFrequencyChange = previousCount > 0
        ? (recentCount - previousCount) / previousCount
        : recentCount > 0 ? 1 : 0;

      // Calculate sentiment changes
      const recentSentiment = this.calculateSentiment([
        ...(recentMentions || []),
        ...(recentMessages || []),
      ]);
      const previousSentiment = this.calculateSentiment([
        ...(previousMentions || []),
        ...(previousMessages || []),
      ]);
      const sentimentChange = recentSentiment - previousSentiment;

      // Time since last mention
      const allRecent = [
        ...(recentMentions || []),
        ...(recentMessages || []),
      ];
      const lastMention = allRecent.length > 0
        ? new Date(Math.max(...allRecent.map(m => new Date(m.created_at).getTime())))
        : null;
      const timeSinceLastMentionDays = lastMention
        ? Math.floor((now.getTime() - lastMention.getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      // Determine drift type
      let driftType: DriftType = 'stable';
      let driftStrength = 0.5;

      // Check for breaking up signals
      const hasBreakupKeywords = allRecent.some(m =>
        ['broke up', 'breakup', 'ended', 'over', 'done', 'finished'].some(kw =>
          m.content.toLowerCase().includes(kw)
        )
      );

      if (hasBreakupKeywords || (mentionFrequencyChange < -0.8 && timeSinceLastMentionDays > 14)) {
        driftType = 'breaking_up';
        driftStrength = 0.9;
      } else if (mentionFrequencyChange < -0.5 && sentimentChange < -0.3) {
        driftType = 'drifting_apart';
        driftStrength = Math.min(1, Math.abs(mentionFrequencyChange) + Math.abs(sentimentChange));
      } else if (mentionFrequencyChange > 0.5 && sentimentChange > 0.3) {
        driftType = 'growing_closer';
        driftStrength = Math.min(1, mentionFrequencyChange + sentimentChange);
      } else if (timeSinceLastMentionDays > 7 && recentCount === 0) {
        driftType = 'drifting_apart';
        driftStrength = Math.min(1, timeSinceLastMentionDays / 30);
      } else if (Math.abs(sentimentChange) > 0.5) {
        driftType = 'volatile';
        driftStrength = Math.abs(sentimentChange);
      } else if (mentionFrequencyChange > 0.2 && sentimentChange > 0.1) {
        driftType = 'reconnecting';
        driftStrength = Math.min(1, mentionFrequencyChange + sentimentChange);
      }

      // Only save if drift is significant
      if (driftStrength > 0.4 || driftType === 'breaking_up') {
        const evidence = allRecent.length > 0
          ? allRecent[allRecent.length - 1].content.substring(0, 200)
          : 'No recent mentions';

        await supabaseAdmin.from('relationship_drift').insert({
          user_id: userId,
          relationship_id: relationshipId,
          drift_type: driftType,
          drift_strength: driftStrength,
          mention_frequency_change: mentionFrequencyChange,
          sentiment_change: sentimentChange,
          interaction_frequency_change: mentionFrequencyChange, // Simplified
          time_since_last_mention_days: timeSinceLastMentionDays,
          evidence,
          source_entry_ids: allRecent.map(m => m.id),
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
      }

      return null;
    } catch (error) {
      logger.error({ error, relationshipId }, 'Failed to detect drift');
      return null;
    }
  }

  /**
   * Calculate sentiment (-1 to 1)
   */
  private calculateSentiment(mentions: Array<{ content: string }>): number {
    if (mentions.length === 0) {
      return 0;
    }

    const positiveWords = ['love', 'amazing', 'great', 'wonderful', 'happy', 'excited', 'miss', 'care'];
    const negativeWords = ['hate', 'terrible', 'awful', 'sad', 'angry', 'frustrated', 'disappointed', 'hurt'];

    let sentimentSum = 0;
    for (const mention of mentions) {
      const content = mention.content.toLowerCase();
      const positiveCount = positiveWords.filter(word => content.includes(word)).length;
      const negativeCount = negativeWords.filter(word => content.includes(word)).length;

      if (positiveCount > negativeCount) {
        sentimentSum += 0.5;
      } else if (negativeCount > positiveCount) {
        sentimentSum -= 0.5;
      }
    }

    return sentimentSum / mentions.length;
  }
}

export const relationshipDriftDetector = new RelationshipDriftDetector();
