// =====================================================
// ROMANTIC RELATIONSHIP ANALYTICS ENGINE
// Purpose: Generate strengths, weaknesses, pros, cons, and insights
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { affectionCalculator } from './affectionCalculator';

export interface RelationshipAnalytics {
  relationshipId: string;
  personId: string;
  personName: string;
  
  // Scores
  affectionScore: number;
  compatibilityScore: number;
  healthScore: number;
  intensityScore: number;
  
  // Analysis
  strengths: string[];
  weaknesses: string[];
  pros: string[];
  cons: string[];
  redFlags: string[];
  greenFlags: string[];
  
  // Insights
  insights: string[];
  recommendations: string[];
  
  // Trends
  affectionTrend: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  healthTrend: 'improving' | 'declining' | 'stable' | 'volatile';
  
  // Calculated at
  calculatedAt: string;
}

export class RomanticRelationshipAnalytics {
  /**
   * Generate analytics for a relationship
   */
  async generateAnalytics(
    userId: string,
    relationshipId: string
  ): Promise<RelationshipAnalytics | null> {
    try {
      // Get relationship
      const { data: relationship } = await supabaseAdmin
        .from('romantic_relationships')
        .select('*')
        .eq('id', relationshipId)
        .eq('user_id', userId)
        .single();

      if (!relationship) {
        return null;
      }

      // Get person name
      let personName = 'Unknown';
      if (relationship.person_type === 'character') {
        const { data: character } = await supabaseAdmin
          .from('characters')
          .select('name')
          .eq('id', relationship.person_id)
          .single();
        personName = character?.name || 'Unknown';
      } else {
        const { data: entity } = await supabaseAdmin
          .from('omega_entities')
          .select('primary_name')
          .eq('id', relationship.person_id)
          .single();
        personName = entity?.primary_name || 'Unknown';
      }

      // Get all mentions and interactions
      const mentions = await this.getMentions(userId, personName);
      const dates = await this.getDates(userId, relationshipId);
      const interactions = await this.getInteractions(userId, relationshipId);

      // Use LLM to generate analysis
      const analysis = await this.generateLLMAnalysis(
        userId,
        relationship,
        personName,
        mentions,
        dates,
        interactions
      );

      // Calculate scores
      const affectionScore = relationship.affection_score || 0.5;
      const compatibilityScore = relationship.compatibility_score || 0.5;
      const healthScore = relationship.relationship_health || 0.5;
      const intensityScore = relationship.emotional_intensity || 0.5;

      // Calculate trends
      const affectionTrend = await this.calculateAffectionTrend(userId, relationshipId);
      const healthTrend = await this.calculateHealthTrend(userId, relationshipId);

      const analytics: RelationshipAnalytics = {
        relationshipId,
        personId: relationship.person_id,
        personName,
        affectionScore,
        compatibilityScore,
        healthScore,
        intensityScore,
        strengths: analysis.strengths || [],
        weaknesses: analysis.weaknesses || [],
        pros: analysis.pros || [],
        cons: analysis.cons || [],
        redFlags: analysis.redFlags || [],
        greenFlags: analysis.greenFlags || [],
        insights: analysis.insights || [],
        recommendations: analysis.recommendations || [],
        affectionTrend,
        healthTrend,
        calculatedAt: new Date().toISOString(),
      };

      // Save analytics snapshot
      await this.saveAnalytics(userId, relationshipId, analytics);

      // Update relationship with analytics
      await supabaseAdmin
        .from('romantic_relationships')
        .update({
          strengths: analytics.strengths,
          weaknesses: analytics.weaknesses,
          pros: analytics.pros,
          cons: analytics.cons,
          red_flags: analytics.redFlags,
          green_flags: analytics.greenFlags,
          compatibility_score: compatibilityScore,
          relationship_health: healthScore,
          updated_at: new Date().toISOString(),
        })
        .eq('id', relationshipId);

      return analytics;
    } catch (error) {
      logger.error({ error, relationshipId }, 'Failed to generate relationship analytics');
      return null;
    }
  }

  /**
   * Generate LLM analysis
   */
  private async generateLLMAnalysis(
    userId: string,
    relationship: any,
    personName: string,
    mentions: Array<{ content: string; created_at: string }>,
    dates: any[],
    interactions: any[]
  ): Promise<{
    strengths: string[];
    weaknesses: string[];
    pros: string[];
    cons: string[];
    redFlags: string[];
    greenFlags: string[];
    insights: string[];
    recommendations: string[];
  }> {
    try {
      const { config } = await import('../../config');
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: config.openAiKey });

      const recentMentions = mentions.slice(-20).map(m => `[${m.created_at}] ${m.content}`).join('\n');
      const dateSummary = dates.map(d => `${d.date_type}: ${d.date_time}`).join('\n');

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Analyze this romantic relationship and provide comprehensive insights.

Relationship: ${relationship.relationship_type} (${relationship.status})
Person: ${personName}

Recent mentions:
${recentMentions}

Dates/milestones:
${dateSummary}

Provide analysis in JSON format:
{
  "strengths": ["what works well", "positive aspects"],
  "weaknesses": ["areas of concern", "challenges"],
  "pros": ["positive things about this relationship"],
  "cons": ["negative aspects or concerns"],
  "redFlags": ["warning signs", "potential issues"],
  "greenFlags": ["positive indicators", "good signs"],
  "insights": ["key observations", "patterns noticed"],
  "recommendations": ["suggestions for improvement", "things to consider"]
}

Be honest, constructive, and specific. Focus on actionable insights.`,
          },
          {
            role: 'user',
            content: `Analyze the relationship with ${personName}:`,
          },
        ],
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        return {
          strengths: [],
          weaknesses: [],
          pros: [],
          cons: [],
          redFlags: [],
          greenFlags: [],
          insights: [],
          recommendations: [],
        };
      }

      const parsed = JSON.parse(response);
      return {
        strengths: parsed.strengths || [],
        weaknesses: parsed.weaknesses || [],
        pros: parsed.pros || [],
        cons: parsed.cons || [],
        redFlags: parsed.redFlags || [],
        greenFlags: parsed.greenFlags || [],
        insights: parsed.insights || [],
        recommendations: parsed.recommendations || [],
      };
    } catch (error) {
      logger.debug({ error }, 'LLM analysis failed, using defaults');
      return {
        strengths: [],
        weaknesses: [],
        pros: [],
        cons: [],
        redFlags: [],
        greenFlags: [],
        insights: [],
        recommendations: [],
      };
    }
  }

  /**
   * Get mentions
   */
  private async getMentions(
    userId: string,
    personName: string
  ): Promise<Array<{ content: string; created_at: string }>> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: journalMentions } = await supabaseAdmin
      .from('journal_entries')
      .select('content, created_at')
      .eq('user_id', userId)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .ilike('content', `%${personName}%`)
      .limit(50);

    const { data: messageMentions } = await supabaseAdmin
      .from('omega_messages')
      .select('content, created_at')
      .eq('user_id', userId)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .ilike('content', `%${personName}%`)
      .limit(50);

    return [
      ...(journalMentions || []),
      ...(messageMentions || []),
    ];
  }

  /**
   * Get dates
   */
  private async getDates(userId: string, relationshipId: string): Promise<any[]> {
    const { data } = await supabaseAdmin
      .from('romantic_dates')
      .select('*')
      .eq('relationship_id', relationshipId)
      .order('date_time', { ascending: false })
      .limit(20);

    return data || [];
  }

  /**
   * Get interactions
   */
  private async getInteractions(userId: string, relationshipId: string): Promise<any[]> {
    const { data } = await supabaseAdmin
      .from('romantic_interactions')
      .select('*')
      .eq('relationship_id', relationshipId)
      .order('interaction_date', { ascending: false })
      .limit(20);

    return data || [];
  }

  /**
   * Calculate affection trend
   */
  private async calculateAffectionTrend(
    userId: string,
    relationshipId: string
  ): Promise<'increasing' | 'decreasing' | 'stable' | 'volatile'> {
    const { data: analytics } = await supabaseAdmin
      .from('relationship_analytics')
      .select('affection_score, calculated_at')
      .eq('relationship_id', relationshipId)
      .order('calculated_at', { ascending: false })
      .limit(5);

    if (!analytics || analytics.length < 2) {
      return 'stable';
    }

    const scores = analytics.map(a => a.affection_score).reverse();
    const trend = scores[scores.length - 1] - scores[0];

    if (Math.abs(trend) < 0.05) {
      return 'stable';
    }

    const variance = this.calculateVariance(scores);
    if (variance > 0.1) {
      return 'volatile';
    }

    return trend > 0 ? 'increasing' : 'decreasing';
  }

  /**
   * Calculate health trend
   */
  private async calculateHealthTrend(
    userId: string,
    relationshipId: string
  ): Promise<'improving' | 'declining' | 'stable' | 'volatile'> {
    const { data: analytics } = await supabaseAdmin
      .from('relationship_analytics')
      .select('health_score, calculated_at')
      .eq('relationship_id', relationshipId)
      .order('calculated_at', { ascending: false })
      .limit(5);

    if (!analytics || analytics.length < 2) {
      return 'stable';
    }

    const scores = analytics.map(a => a.health_score).reverse();
    const trend = scores[scores.length - 1] - scores[0];

    if (Math.abs(trend) < 0.05) {
      return 'stable';
    }

    const variance = this.calculateVariance(scores);
    if (variance > 0.1) {
      return 'volatile';
    }

    return trend > 0 ? 'improving' : 'declining';
  }

  /**
   * Calculate variance
   */
  private calculateVariance(numbers: number[]): number {
    const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    const variance = numbers.reduce((sum, num) => sum + Math.pow(num - mean, 2), 0) / numbers.length;
    return variance;
  }

  /**
   * Save analytics snapshot
   */
  private async saveAnalytics(
    userId: string,
    relationshipId: string,
    analytics: RelationshipAnalytics
  ): Promise<void> {
    await supabaseAdmin.from('relationship_analytics').insert({
      user_id: userId,
      relationship_id: relationshipId,
      affection_score: analytics.affectionScore,
      compatibility_score: analytics.compatibilityScore,
      health_score: analytics.healthScore,
      intensity_score: analytics.intensityScore,
      affection_trend: analytics.affectionTrend,
      health_trend: analytics.healthTrend,
      strengths: analytics.strengths,
      weaknesses: analytics.weaknesses,
      pros: analytics.pros,
      cons: analytics.cons,
      red_flags: analytics.redFlags,
      green_flags: analytics.greenFlags,
      insights: analytics.insights,
      recommendations: analytics.recommendations,
      calculated_at: analytics.calculatedAt,
    });
  }
}

export const romanticRelationshipAnalytics = new RomanticRelationshipAnalytics();
