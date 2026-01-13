// =====================================================
// AFFECTION CALCULATOR
// Purpose: Calculate who you like most and rank romantic interests
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export interface AffectionScore {
  personId: string;
  personName: string;
  personType: 'character' | 'omega_entity';
  relationshipId: string;
  relationshipType: string;
  
  // Scores (0-1)
  affectionScore: number; // Overall how much you like them
  emotionalIntensity: number; // Obsession/infatuation level
  physicalAttraction: number; // Physical attraction
  emotionalConnection: number; // Emotional bond
  
  // Metrics
  mentionFrequency: number; // How often you mention them
  sentimentAverage: number; // Average sentiment (-1 to 1)
  timeInvestment: number; // How much time you spend on them
  recencyScore: number; // How recently mentioned (0-1)
  
  // Ranking
  rankAmongAll: number; // Rank among all romantic interests
  rankAmongActive: number; // Rank among active relationships
  
  // Trends
  affectionTrend: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  
  // Calculated at
  calculatedAt: string;
}

export class AffectionCalculator {
  /**
   * Calculate affection scores for all romantic relationships
   */
  async calculateAffectionScores(userId: string): Promise<AffectionScore[]> {
    try {
      // Get all romantic relationships
      const { data: relationships } = await supabaseAdmin
        .from('romantic_relationships')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!relationships || relationships.length === 0) {
        return [];
      }

      const scores: AffectionScore[] = [];

      for (const rel of relationships) {
        const score = await this.calculateForRelationship(userId, rel);
        if (score) {
          scores.push(score);
        }
      }

      // Rank relationships
      scores.sort((a, b) => b.affectionScore - a.affectionScore);
      scores.forEach((score, index) => {
        score.rankAmongAll = index + 1;
      });

      // Rank active relationships separately
      const activeScores = scores.filter(s => {
        const rel = relationships.find(r => r.id === s.relationshipId);
        return rel?.status === 'active' && rel?.is_current;
      });
      activeScores.sort((a, b) => b.affectionScore - a.affectionScore);
      activeScores.forEach((score, index) => {
        score.rankAmongActive = index + 1;
      });

      // Update relationship records with scores
      for (const score of scores) {
        await supabaseAdmin
          .from('romantic_relationships')
          .update({
            affection_score: score.affectionScore,
            emotional_intensity: score.emotionalIntensity,
            physical_attraction: score.physicalAttraction,
            emotional_connection: score.emotionalConnection,
            updated_at: new Date().toISOString(),
          })
          .eq('id', score.relationshipId);
      }

      return scores;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to calculate affection scores');
      return [];
    }
  }

  /**
   * Calculate affection score for a single relationship
   */
  private async calculateForRelationship(
    userId: string,
    relationship: any
  ): Promise<AffectionScore | null> {
    try {
      // Get person name
      let personName = 'Unknown';
      if (relationship.person_type === 'character') {
        const { data: character } = await supabaseAdmin
          .from('characters')
          .select('name')
          .eq('id', relationship.person_id)
          .eq('user_id', userId)
          .single();
        personName = character?.name || 'Unknown';
      } else {
        const { data: entity } = await supabaseAdmin
          .from('omega_entities')
          .select('primary_name')
          .eq('id', relationship.person_id)
          .eq('user_id', userId)
          .single();
        personName = entity?.primary_name || 'Unknown';
      }

      // Get mentions in journal entries and messages
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Count mentions in journal entries
      const { data: journalMentions } = await supabaseAdmin
        .from('journal_entries')
        .select('id, created_at, content')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .or(`content.ilike.%${personName}%`);

      // Count mentions in messages
      const { data: messageMentions } = await supabaseAdmin
        .from('omega_messages')
        .select('id, created_at, content')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .or(`content.ilike.%${personName}%`);

      const allMentions = [
        ...(journalMentions || []),
        ...(messageMentions || []),
      ];

      // Calculate metrics
      const mentionFrequency = allMentions.length;
      const recencyScore = this.calculateRecencyScore(allMentions);
      
      // Calculate sentiment (simple keyword-based for now)
      const sentimentAverage = this.calculateSentiment(allMentions);
      
      // Time investment (based on mention frequency and recency)
      const timeInvestment = Math.min(1, (mentionFrequency / 30) * 0.5 + recencyScore * 0.5);

      // Calculate affection score (weighted combination)
      const affectionScore =
        sentimentAverage * 0.4 + // Sentiment is most important
        timeInvestment * 0.3 + // Time investment matters
        recencyScore * 0.2 + // Recency matters
        (relationship.emotional_intensity || 0.5) * 0.1; // Existing intensity

      // Calculate trends
      const affectionTrend = this.calculateTrend(allMentions, sentimentAverage);

      // Get existing scores or use defaults
      const emotionalIntensity = relationship.emotional_intensity || 0.5;
      const physicalAttraction = relationship.physical_attraction || 0.5;
      const emotionalConnection = relationship.emotional_connection || 0.5;

      return {
        personId: relationship.person_id,
        personName,
        personType: relationship.person_type,
        relationshipId: relationship.id,
        relationshipType: relationship.relationship_type,
        affectionScore: Math.max(0, Math.min(1, affectionScore)),
        emotionalIntensity,
        physicalAttraction,
        emotionalConnection,
        mentionFrequency,
        sentimentAverage,
        timeInvestment,
        recencyScore,
        rankAmongAll: 0, // Will be set after sorting
        rankAmongActive: 0, // Will be set after sorting
        affectionTrend,
        calculatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ error, relationshipId: relationship.id }, 'Failed to calculate score for relationship');
      return null;
    }
  }

  /**
   * Calculate recency score (0-1)
   */
  private calculateRecencyScore(mentions: Array<{ created_at: string }>): number {
    if (mentions.length === 0) {
      return 0;
    }

    const now = new Date();
    const mostRecent = new Date(
      Math.max(...mentions.map(m => new Date(m.created_at).getTime()))
    );

    const daysAgo = (now.getTime() - mostRecent.getTime()) / (1000 * 60 * 60 * 24);
    
    // Score decreases over time: 1.0 if mentioned today, 0.0 if mentioned 30+ days ago
    return Math.max(0, 1 - daysAgo / 30);
  }

  /**
   * Calculate average sentiment (-1 to 1)
   */
  private calculateSentiment(mentions: Array<{ content: string }>): number {
    if (mentions.length === 0) {
      return 0;
    }

    const positiveWords = ['love', 'amazing', 'great', 'wonderful', 'beautiful', 'perfect', 'happy', 'excited'];
    const negativeWords = ['hate', 'terrible', 'awful', 'bad', 'sad', 'angry', 'frustrated', 'disappointed'];

    let sentimentSum = 0;
    for (const mention of mentions) {
      const content = mention.content.toLowerCase();
      let sentiment = 0;

      // Count positive words
      const positiveCount = positiveWords.filter(word => content.includes(word)).length;
      // Count negative words
      const negativeCount = negativeWords.filter(word => content.includes(word)).length;

      if (positiveCount > negativeCount) {
        sentiment = 0.5;
      } else if (negativeCount > positiveCount) {
        sentiment = -0.5;
      }

      sentimentSum += sentiment;
    }

    return sentimentSum / mentions.length;
  }

  /**
   * Calculate trend
   */
  private calculateTrend(
    mentions: Array<{ created_at: string; content: string }>,
    currentSentiment: number
  ): 'increasing' | 'decreasing' | 'stable' | 'volatile' {
    if (mentions.length < 2) {
      return 'stable';
    }

    // Split into two halves
    const sorted = [...mentions].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const midpoint = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, midpoint);
    const secondHalf = sorted.slice(midpoint);

    const firstSentiment = this.calculateSentiment(firstHalf);
    const secondSentiment = this.calculateSentiment(secondHalf);

    const diff = secondSentiment - firstSentiment;

    if (Math.abs(diff) < 0.1) {
      return 'stable';
    } else if (Math.abs(diff) > 0.3) {
      return 'volatile';
    } else if (diff > 0) {
      return 'increasing';
    } else {
      return 'decreasing';
    }
  }

  /**
   * Get who you like most
   */
  async getTopAffections(
    userId: string,
    limit: number = 5
  ): Promise<AffectionScore[]> {
    const scores = await this.calculateAffectionScores(userId);
    return scores.slice(0, limit);
  }
}

export const affectionCalculator = new AffectionCalculator();
