// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.
// Romantic Relationship Ranking Service
// Calculates and updates rankings for romantic relationships

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export class RomanticRelationshipRanking {
  /**
   * Calculate and update rankings for all relationships
   */
  async calculateRankings(userId: string): Promise<void> {
    try {
      // Get all relationships
      const { data: relationships } = await supabaseAdmin
        .from('romantic_relationships')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!relationships || relationships.length === 0) {
        return;
      }

      // Calculate composite score for each relationship
      const relationshipsWithScores = relationships.map(rel => {
        const compositeScore = this.calculateCompositeScore(rel);
        return {
          ...rel,
          compositeScore
        };
      });

      // Sort by composite score (descending)
      relationshipsWithScores.sort((a, b) => b.compositeScore - a.compositeScore);

      // Assign rankings
      const rankings = relationshipsWithScores.map((rel, index) => ({
        relationshipId: rel.id,
        rankAmongAll: index + 1,
        compositeScore: rel.compositeScore
      }));

      // Get active relationships and rank them separately
      const activeRelationships = relationshipsWithScores.filter(r => r.is_current && r.status === 'active');
      activeRelationships.sort((a, b) => b.compositeScore - a.compositeScore);
      
      const activeRankings = new Map<string, number>();
      activeRelationships.forEach((rel, index) => {
        activeRankings.set(rel.id, index + 1);
      });

      // Update rankings in relationship_analytics table
      for (const ranking of rankings) {
        const activeRank = activeRankings.get(ranking.relationshipId) || null;

        // Check if analytics record exists
        const { data: existing } = await supabaseAdmin
          .from('relationship_analytics')
          .select('id')
          .eq('user_id', userId)
          .eq('relationship_id', ranking.relationshipId)
          .order('calculated_at', { ascending: false })
          .limit(1)
          .single();

        if (existing) {
          // Update existing record
          await supabaseAdmin
            .from('relationship_analytics')
            .update({
              rank_among_all: ranking.rankAmongAll,
              rank_among_active: activeRank,
              calculated_at: new Date().toISOString()
            })
            .eq('id', existing.id);
        } else {
          // Create new analytics record
          const { data: relationship } = await supabaseAdmin
            .from('romantic_relationships')
            .select('*')
            .eq('id', ranking.relationshipId)
            .single();

          if (relationship) {
            await supabaseAdmin
              .from('relationship_analytics')
              .insert({
                user_id: userId,
                relationship_id: ranking.relationshipId,
                affection_score: relationship.affection_score || 0.5,
                compatibility_score: relationship.compatibility_score || 0.5,
                health_score: relationship.relationship_health || 0.5,
                intensity_score: relationship.emotional_intensity || 0.5,
                rank_among_all: ranking.rankAmongAll,
                rank_among_active: activeRank,
                calculated_at: new Date().toISOString()
              });
          }
        }
      }

      logger.debug({ userId, totalRelationships: relationships.length }, 'Rankings calculated and updated');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to calculate rankings');
      throw error;
    }
  }

  /**
   * Calculate composite score for ranking
   */
  private calculateCompositeScore(relationship: any): number {
    const weights = {
      affection: 0.25,
      compatibility: 0.30,
      health: 0.25,
      intensity: 0.10,
      duration: 0.10
    };

    const affection = relationship.affection_score || 0.5;
    const compatibility = relationship.compatibility_score || 0.5;
    const health = relationship.relationship_health || 0.5;
    const intensity = relationship.emotional_intensity || 0.5;

    // Calculate duration score (normalized to 0-1)
    let durationScore = 0.5;
    if (relationship.start_date) {
      const start = new Date(relationship.start_date);
      const end = relationship.end_date ? new Date(relationship.end_date) : new Date();
      const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      // Normalize: 0 days = 0, 365 days = 0.5, 730+ days = 1.0
      durationScore = Math.min(1.0, days / 730);
    }

    // Bonus for active relationships
    const activeBonus = (relationship.is_current && relationship.status === 'active') ? 0.1 : 0;

    const compositeScore = 
      (affection * weights.affection) +
      (compatibility * weights.compatibility) +
      (health * weights.health) +
      (intensity * weights.intensity) +
      (durationScore * weights.duration) +
      activeBonus;

    return Math.min(1.0, compositeScore);
  }

  /**
   * Get rankings for a specific relationship
   */
  async getRanking(userId: string, relationshipId: string): Promise<{
    rankAmongAll: number | null;
    rankAmongActive: number | null;
    totalRelationships: number;
    totalActive: number;
  } | null> {
    try {
      // Get latest analytics
      const { data: analytics } = await supabaseAdmin
        .from('relationship_analytics')
        .select('rank_among_all, rank_among_active')
        .eq('user_id', userId)
        .eq('relationship_id', relationshipId)
        .order('calculated_at', { ascending: false })
        .limit(1)
        .single();

      // Get counts
      const { count: totalCount } = await supabaseAdmin
        .from('romantic_relationships')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      const { count: activeCount } = await supabaseAdmin
        .from('romantic_relationships')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_current', true)
        .eq('status', 'active');

      return {
        rankAmongAll: analytics?.rank_among_all || null,
        rankAmongActive: analytics?.rank_among_active || null,
        totalRelationships: totalCount || 0,
        totalActive: activeCount || 0
      };
    } catch (error) {
      logger.debug({ error }, 'Failed to get ranking');
      return null;
    }
  }
}

export const romanticRelationshipRanking = new RomanticRelationshipRanking();
