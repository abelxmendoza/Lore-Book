// =====================================================
// INTEREST TRACKER
// Purpose: Track interests, update levels, manage scope
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import { interestDetector, type DetectedInterest, type InterestMention } from './interestDetector';

export interface Interest {
  id: string;
  user_id: string;
  interest_name: string;
  interest_category?: string;
  interest_level: number; // 0-1
  mention_count: number;
  emotional_intensity_avg: number;
  behavioral_impact_score: number;
  influence_score: number;
  knowledge_depth_score: number;
  time_investment_hours: number;
  trend: 'growing' | 'stable' | 'declining' | 'new';
  trend_confidence: number;
  first_mentioned_at: string;
  last_mentioned_at: string;
  peak_interest_at?: string;
  related_character_ids: string[];
  related_location_ids: string[];
  related_event_ids: string[];
  related_skill_ids: string[];
  evidence_quotes: string[];
  source_entry_ids: string[];
  description?: string;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface InterestScope {
  id: string;
  user_id: string;
  interest_id: string;
  scope: string; // e.g., 'career', 'hobby', 'social', 'learning'
  scope_context?: string; // Additional context
  confidence: number;
  evidence_count: number;
  first_observed_at: string;
  last_observed_at: string;
}

export interface InterestScopeGroup {
  id: string;
  user_id: string;
  scope: string;
  scope_context?: string;
  interest_ids: string[];
  confidence: number;
  evidence_count: number;
}

export class InterestTracker {
  /**
   * Save or update interest
   */
  async saveInterest(
    userId: string,
    detected: DetectedInterest,
    entryId?: string,
    messageId?: string
  ): Promise<string> {
    try {
      const normalizedName = interestDetector.normalizeInterestName(detected.interest_name);
      
      // Check if interest already exists
      const { data: existing } = await supabaseAdmin
        .from('interests')
        .select('*')
        .eq('user_id', userId)
        .eq('interest_name', normalizedName)
        .single();

      if (existing) {
        // Update existing interest
        const updatedMentionCount = existing.mention_count + 1;
        const updatedIntensity = (existing.emotional_intensity_avg * existing.mention_count + detected.emotional_intensity) / updatedMentionCount;
        
        // Update evidence quotes (keep last 10)
        const updatedQuotes = [...(existing.evidence_quotes || []), detected.evidence].slice(-10);
        const updatedSourceIds = [...new Set([...(existing.source_entry_ids || []), entryId].filter(Boolean))];

        const { data: updated, error } = await supabaseAdmin
          .from('interests')
          .update({
            mention_count: updatedMentionCount,
            emotional_intensity_avg: updatedIntensity,
            last_mentioned_at: new Date().toISOString(),
            evidence_quotes: updatedQuotes,
            source_entry_ids: updatedSourceIds,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) {
          logger.error({ error, userId, interestName: normalizedName }, 'Failed to update interest');
          throw error;
        }

        // Record mention
        await this.recordMention(userId, existing.id, {
          interest_id: existing.id,
          source_entry_id: entryId,
          source_message_id: messageId,
          mention_text: detected.evidence,
          emotional_intensity: detected.emotional_intensity,
          sentiment: detected.sentiment,
          word_count: detected.evidence.split(/\s+/).length,
          time_spent_minutes: detected.time_investment_minutes,
          action_taken: detected.action_taken || false,
          action_type: detected.action_type,
          influence_on_decision: detected.influence_on_decision || false,
          metadata: {
            knowledge_depth: detected.knowledge_depth,
            context: detected.context
          }
        });

        // Recalculate interest level
        await this.updateInterestLevel(userId, existing.id);

        return existing.id;
      } else {
        // Create new interest
        const { data: newInterest, error } = await supabaseAdmin
          .from('interests')
          .insert({
            user_id: userId,
            interest_name: normalizedName,
            interest_category: detected.interest_category || 'other',
            interest_level: 0.5, // Will be recalculated
            mention_count: 1,
            emotional_intensity_avg: detected.emotional_intensity,
            behavioral_impact_score: detected.action_taken ? 0.2 : 0.0,
            influence_score: detected.influence_on_decision ? 0.2 : 0.0,
            knowledge_depth_score: this.getKnowledgeDepthScore(detected.knowledge_depth),
            time_investment_hours: (detected.time_investment_minutes || 0) / 60,
            trend: 'new',
            trend_confidence: detected.confidence,
            first_mentioned_at: new Date().toISOString(),
            last_mentioned_at: new Date().toISOString(),
            evidence_quotes: [detected.evidence],
            source_entry_ids: entryId ? [entryId] : [],
            description: detected.context,
            tags: detected.interest_category ? [detected.interest_category] : [],
            metadata: {
              initial_confidence: detected.confidence,
              initial_sentiment: detected.sentiment
            }
          })
          .select()
          .single();

        if (error) {
          logger.error({ error, userId, interestName: normalizedName }, 'Failed to create interest');
          throw error;
        }

        // Record mention
        await this.recordMention(userId, newInterest.id, {
          interest_id: newInterest.id,
          source_entry_id: entryId,
          source_message_id: messageId,
          mention_text: detected.evidence,
          emotional_intensity: detected.emotional_intensity,
          sentiment: detected.sentiment,
          word_count: detected.evidence.split(/\s+/).length,
          time_spent_minutes: detected.time_investment_minutes,
          action_taken: detected.action_taken || false,
          action_type: detected.action_type,
          influence_on_decision: detected.influence_on_decision || false,
          metadata: {
            knowledge_depth: detected.knowledge_depth,
            context: detected.context
          }
        });

        // Calculate initial interest level
        await this.updateInterestLevel(userId, newInterest.id);

        return newInterest.id;
      }
    } catch (error) {
      logger.error({ error, userId, detected }, 'Error saving interest');
      throw error;
    }
  }

  /**
   * Record a mention of an interest
   */
  async recordMention(
    userId: string,
    interestId: string,
    mention: InterestMention
  ): Promise<string> {
    try {
      const { data, error } = await supabaseAdmin
        .from('interest_mentions')
        .insert({
          user_id: userId,
          interest_id: interestId,
          source_entry_id: mention.source_entry_id,
          source_message_id: mention.source_message_id,
          mention_text: mention.mention_text,
          emotional_intensity: mention.emotional_intensity,
          sentiment: mention.sentiment,
          word_count: mention.word_count,
          time_spent_minutes: mention.time_spent_minutes,
          mentioned_with_people: mention.mentioned_with_people || [],
          mentioned_at_location: mention.mentioned_at_location,
          related_events: mention.related_events || [],
          action_taken: mention.action_taken,
          action_type: mention.action_type,
          influence_on_decision: mention.influence_on_decision,
          metadata: mention.metadata || {}
        })
        .select('id')
        .single();

      if (error) {
        logger.error({ error, userId, interestId }, 'Failed to record interest mention');
        throw error;
      }

      return data.id;
    } catch (error) {
      logger.error({ error, userId, interestId }, 'Error recording interest mention');
      throw error;
    }
  }

  /**
   * Update interest level (recalculates from all mentions)
   */
  async updateInterestLevel(userId: string, interestId: string): Promise<void> {
    try {
      // Get interest
      const { data: interest, error: interestError } = await supabaseAdmin
        .from('interests')
        .select('*')
        .eq('id', interestId)
        .eq('user_id', userId)
        .single();

      if (interestError || !interest) {
        logger.error({ error: interestError, interestId }, 'Interest not found');
        return;
      }

      // Get all mentions
      const { data: mentions, error: mentionsError } = await supabaseAdmin
        .from('interest_mentions')
        .select('*')
        .eq('user_id', userId)
        .eq('interest_id', interestId)
        .order('created_at', { ascending: false });

      if (mentionsError) {
        logger.error({ error: mentionsError, interestId }, 'Failed to get mentions');
        return;
      }

      const allMentions: InterestMention[] = (mentions || []).map((m: any) => ({
        interest_id: m.interest_id,
        source_entry_id: m.source_entry_id,
        source_message_id: m.source_message_id,
        mention_text: m.mention_text,
        emotional_intensity: m.emotional_intensity,
        sentiment: m.sentiment,
        word_count: m.word_count,
        time_spent_minutes: m.time_spent_minutes,
        mentioned_with_people: m.mentioned_with_people || [],
        mentioned_at_location: m.mentioned_at_location,
        related_events: m.related_events || [],
        action_taken: m.action_taken,
        action_type: m.action_type,
        influence_on_decision: m.influence_on_decision,
        metadata: m.metadata || {}
      }));

      // Calculate metrics
      const emotionalIntensityAvg = allMentions.length > 0
        ? allMentions.reduce((sum, m) => sum + m.emotional_intensity, 0) / allMentions.length
        : 0.5;

      const behavioralImpact = interestDetector.calculateBehavioralImpact(
        { interest_name: interest.interest_name } as DetectedInterest,
        allMentions
      );

      const influenceScore = interestDetector.calculateInfluenceScore(
        { interest_name: interest.interest_name } as DetectedInterest,
        allMentions
      );

      const knowledgeDepthScore = interestDetector.calculateKnowledgeDepthScore(
        { interest_name: interest.interest_name } as DetectedInterest,
        allMentions
      );

      const totalTimeHours = allMentions.reduce((sum, m) => sum + (m.time_spent_minutes || 0), 0) / 60;

      // Calculate interest level
      const interestLevel = this.calculateInterestLevel({
        mention_count: allMentions.length,
        emotional_intensity_avg: emotionalIntensityAvg,
        behavioral_impact_score: behavioralImpact,
        influence_score: influenceScore,
        knowledge_depth_score: knowledgeDepthScore,
        time_investment_hours: totalTimeHours,
        last_mentioned_at: interest.last_mentioned_at
      });

      // Detect trend
      const trend = this.detectTrend(interest, allMentions);

      // Update interest
      await supabaseAdmin
        .from('interests')
        .update({
          interest_level: interestLevel,
          emotional_intensity_avg: emotionalIntensityAvg,
          behavioral_impact_score: behavioralImpact,
          influence_score: influenceScore,
          knowledge_depth_score: knowledgeDepthScore,
          time_investment_hours: totalTimeHours,
          trend: trend.trend,
          trend_confidence: trend.confidence,
          peak_interest_at: interestLevel > (interest.interest_level || 0) ? new Date().toISOString() : interest.peak_interest_at,
          updated_at: new Date().toISOString()
        })
        .eq('id', interestId);
    } catch (error) {
      logger.error({ error, userId, interestId }, 'Error updating interest level');
    }
  }

  /**
   * Calculate overall interest level
   */
  private calculateInterestLevel(metrics: {
    mention_count: number;
    emotional_intensity_avg: number;
    behavioral_impact_score: number;
    influence_score: number;
    knowledge_depth_score: number;
    time_investment_hours: number;
    last_mentioned_at: string;
  }): number {
    let score = 0.0;
    
    // Frequency (0-0.25)
    const frequencyScore = Math.min(0.25, metrics.mention_count / 20);
    score += frequencyScore;
    
    // Emotional intensity (0-0.25)
    score += metrics.emotional_intensity_avg * 0.25;
    
    // Behavioral impact (0-0.20)
    score += Math.min(0.20, metrics.behavioral_impact_score);
    
    // Influence score (0-0.15)
    score += Math.min(0.15, metrics.influence_score);
    
    // Knowledge depth (0-0.10)
    score += Math.min(0.10, metrics.knowledge_depth_score);
    
    // Recency boost (0-0.05)
    const daysSinceLastMention = (Date.now() - new Date(metrics.last_mentioned_at).getTime()) / (1000 * 60 * 60 * 24);
    const recencyBoost = daysSinceLastMention < 7 ? 0.05 : daysSinceLastMention < 30 ? 0.03 : 0.0;
    score += recencyBoost;
    
    return Math.min(1.0, score);
  }

  /**
   * Detect trend (growing, stable, declining, new)
   */
  private detectTrend(interest: Interest, mentions: InterestMention[]): { trend: 'growing' | 'stable' | 'declining' | 'new'; confidence: number } {
    if (mentions.length <= 1) {
      return { trend: 'new', confidence: 0.8 };
    }

    // Split mentions into recent (last 30 days) and older
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    
    const recentMentions = mentions.filter(m => {
      const mentionDate = new Date((m as any).created_at || interest.last_mentioned_at).getTime();
      return mentionDate >= thirtyDaysAgo;
    });
    
    const olderMentions = mentions.filter(m => {
      const mentionDate = new Date((m as any).created_at || interest.last_mentioned_at).getTime();
      return mentionDate < thirtyDaysAgo;
    });

    if (recentMentions.length === 0) {
      return { trend: 'declining', confidence: 0.7 };
    }

    // Compare recent vs older activity
    const recentRate = recentMentions.length / 30; // Mentions per day
    const olderRate = olderMentions.length > 0 ? olderMentions.length / 60 : 0; // Average over 60 days

    if (recentRate > olderRate * 1.5) {
      return { trend: 'growing', confidence: 0.8 };
    } else if (recentRate < olderRate * 0.5) {
      return { trend: 'declining', confidence: 0.7 };
    } else {
      return { trend: 'stable', confidence: 0.6 };
    }
  }

  /**
   * Get top interests by level
   */
  async getTopInterests(userId: string, limit: number = 20): Promise<Interest[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('interests')
        .select('*')
        .eq('user_id', userId)
        .order('interest_level', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error({ error, userId }, 'Failed to get top interests');
        throw error;
      }

      return (data || []).map(this.mapInterestFromDb);
    } catch (error) {
      logger.error({ error, userId }, 'Error getting top interests');
      throw error;
    }
  }

  /**
   * Add interest to scope
   */
  async addInterestToScope(
    userId: string,
    interestId: string,
    scope: string,
    scopeContext?: string
  ): Promise<InterestScope | null> {
    try {
      // Check if scope already exists
      const { data: existing } = await supabaseAdmin
        .from('interest_scopes')
        .select('*')
        .eq('user_id', userId)
        .eq('interest_id', interestId)
        .eq('scope', scope)
        .eq('scope_context', scopeContext || '')
        .single();

      if (existing) {
        // Update existing scope
        const { data: updated, error } = await supabaseAdmin
          .from('interest_scopes')
          .update({
            evidence_count: (existing.evidence_count || 1) + 1,
            last_observed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) {
          logger.error({ error, userId, interestId, scope }, 'Failed to update interest scope');
          return null;
        }

        return this.mapScopeFromDb(updated);
      } else {
        // Create new scope
        const { data: newScope, error } = await supabaseAdmin
          .from('interest_scopes')
          .insert({
            user_id: userId,
            interest_id: interestId,
            scope,
            scope_context: scopeContext,
            confidence: 0.7,
            evidence_count: 1,
            first_observed_at: new Date().toISOString(),
            last_observed_at: new Date().toISOString()
          })
          .select()
          .single();

        if (error) {
          logger.error({ error, userId, interestId, scope }, 'Failed to create interest scope');
          return null;
        }

        // Add to scope group
        await this.addInterestToScopeGroup(userId, interestId, scope, scopeContext);

        return this.mapScopeFromDb(newScope);
      }
    } catch (error) {
      logger.error({ error, userId, interestId, scope }, 'Error adding interest to scope');
      return null;
    }
  }

  /**
   * Add interest to scope group
   */
  async addInterestToScopeGroup(
    userId: string,
    interestId: string,
    scope: string,
    scopeContext?: string
  ): Promise<InterestScopeGroup | null> {
    try {
      // Find existing scope group
      const { data: existingGroup } = await supabaseAdmin
        .from('interest_scope_groups')
        .select('*')
        .eq('user_id', userId)
        .eq('scope', scope)
        .eq('scope_context', scopeContext || '')
        .single();

      if (existingGroup) {
        // Add interest to existing group if not already present
        const interestIds = existingGroup.interest_ids || [];
        if (!interestIds.includes(interestId)) {
          interestIds.push(interestId);

          const { data: updated, error } = await supabaseAdmin
            .from('interest_scope_groups')
            .update({
              interest_ids: interestIds,
              evidence_count: (existingGroup.evidence_count || 1) + 1,
              last_observed_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', existingGroup.id)
            .select()
            .single();

          if (error) {
            logger.error({ error, userId, scope }, 'Failed to update interest scope group');
            return null;
          }

          return this.mapScopeGroupFromDb(updated);
        } else {
          // Already in group, just update evidence count
          await supabaseAdmin
            .from('interest_scope_groups')
            .update({
              evidence_count: (existingGroup.evidence_count || 1) + 1,
              last_observed_at: new Date().toISOString()
            })
            .eq('id', existingGroup.id);

          return this.mapScopeGroupFromDb(existingGroup);
        }
      } else {
        // Create new scope group
        const { data: newGroup, error } = await supabaseAdmin
          .from('interest_scope_groups')
          .insert({
            user_id: userId,
            scope,
            scope_context: scopeContext,
            interest_ids: [interestId],
            confidence: 0.7,
            evidence_count: 1,
            first_observed_at: new Date().toISOString(),
            last_observed_at: new Date().toISOString()
          })
          .select()
          .single();

        if (error) {
          logger.error({ error, userId, scope }, 'Failed to create interest scope group');
          return null;
        }

        return this.mapScopeGroupFromDb(newGroup);
      }
    } catch (error) {
      logger.error({ error, userId, interestId, scope }, 'Error adding interest to scope group');
      return null;
    }
  }

  /**
   * Get interest trends
   */
  async getInterestTrends(userId: string, interestId: string): Promise<{
    trend: 'growing' | 'stable' | 'declining' | 'new';
    confidence: number;
    recentMentions: number;
    olderMentions: number;
  }> {
    try {
      const { data: interest } = await supabaseAdmin
        .from('interests')
        .select('*')
        .eq('id', interestId)
        .eq('user_id', userId)
        .single();

      if (!interest) {
        throw new Error('Interest not found');
      }

      const { data: mentions } = await supabaseAdmin
        .from('interest_mentions')
        .select('created_at')
        .eq('user_id', userId)
        .eq('interest_id', interestId)
        .order('created_at', { ascending: false });

      const allMentions: InterestMention[] = (mentions || []).map((m: any) => ({
        interest_id: interestId,
        mention_text: '',
        emotional_intensity: 0.5,
        sentiment: 0,
        word_count: 0,
        action_taken: false,
        influence_on_decision: false,
        metadata: { created_at: m.created_at }
      }));

      const trend = this.detectTrend(this.mapInterestFromDb(interest), allMentions);

      const now = Date.now();
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
      
      const recentMentions = mentions?.filter(m => 
        new Date(m.created_at).getTime() >= thirtyDaysAgo
      ).length || 0;
      
      const olderMentions = (mentions?.length || 0) - recentMentions;

      return {
        ...trend,
        recentMentions,
        olderMentions
      };
    } catch (error) {
      logger.error({ error, userId, interestId }, 'Error getting interest trends');
      throw error;
    }
  }

  /**
   * Helper: Map database row to Interest
   */
  private mapInterestFromDb(row: any): Interest {
    return {
      id: row.id,
      user_id: row.user_id,
      interest_name: row.interest_name,
      interest_category: row.interest_category,
      interest_level: row.interest_level,
      mention_count: row.mention_count,
      emotional_intensity_avg: row.emotional_intensity_avg,
      behavioral_impact_score: row.behavioral_impact_score,
      influence_score: row.influence_score,
      knowledge_depth_score: row.knowledge_depth_score,
      time_investment_hours: row.time_investment_hours,
      trend: row.trend,
      trend_confidence: row.trend_confidence,
      first_mentioned_at: row.first_mentioned_at,
      last_mentioned_at: row.last_mentioned_at,
      peak_interest_at: row.peak_interest_at,
      related_character_ids: row.related_character_ids || [],
      related_location_ids: row.related_location_ids || [],
      related_event_ids: row.related_event_ids || [],
      related_skill_ids: row.related_skill_ids || [],
      evidence_quotes: row.evidence_quotes || [],
      source_entry_ids: row.source_entry_ids || [],
      description: row.description,
      tags: row.tags || [],
      metadata: row.metadata || {},
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  /**
   * Helper: Map database row to InterestScope
   */
  private mapScopeFromDb(row: any): InterestScope {
    return {
      id: row.id,
      user_id: row.user_id,
      interest_id: row.interest_id,
      scope: row.scope,
      scope_context: row.scope_context,
      confidence: row.confidence,
      evidence_count: row.evidence_count,
      first_observed_at: row.first_observed_at,
      last_observed_at: row.last_observed_at
    };
  }

  /**
   * Helper: Map database row to InterestScopeGroup
   */
  private mapScopeGroupFromDb(row: any): InterestScopeGroup {
    return {
      id: row.id,
      user_id: row.user_id,
      scope: row.scope,
      scope_context: row.scope_context,
      interest_ids: row.interest_ids || [],
      confidence: row.confidence,
      evidence_count: row.evidence_count
    };
  }

  /**
   * Helper: Get knowledge depth score
   */
  private getKnowledgeDepthScore(depth?: string): number {
    const scores: Record<string, number> = {
      'surface': 0.2,
      'moderate': 0.5,
      'deep': 0.8,
      'expert': 1.0
    };
    return scores[depth || 'surface'] || 0.2;
  }
}

export const interestTracker = new InterestTracker();
