/**
 * LORE-KEEPER INSIGHT & REFLECTION ENGINE (IRE)
 * Service for generating insights from existing memory
 */

import OpenAI from 'openai';
import { supabaseAdmin } from './supabaseClient';
import { logger } from '../logger';
import { config } from '../config';
import { embeddingService } from './embeddingService';
import { omegaMemoryService } from './omegaMemoryService';
import { perspectiveService } from './perspectiveService';
import type {
  Insight,
  InsightEvidence,
  InsightWithEvidence,
  PatternGroup,
  TemporalShift,
  PerspectiveDivergence,
  RecurringTheme,
  InsightType,
  InsightScope,
} from '../types/insightReflection';

const openai = new OpenAI({ apiKey: config.openAiKey });

const THEME_THRESHOLD = 3; // Minimum frequency for recurring themes

export class InsightReflectionService {
  /**
   * Generate insights for a user
   */
  async generateInsights(userId: string): Promise<Insight[]> {
    try {
      const insights: Insight[] = [];

      // Get active entities
      const entities = await omegaMemoryService.getEntities(userId);

      // Generate insights per entity
      for (const entity of entities) {
        const entityInsights = await this.generateEntityInsights(userId, entity.id);
        insights.push(...entityInsights);
      }

      // Generate global insights
      const globalInsights = await this.detectRecurringThemes(userId);
      insights.push(...globalInsights);

      // Save insights
      if (insights.length > 0) {
        await this.saveInsights(userId, insights);
      }

      return insights;
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to generate insights');
      throw error;
    }
  }

  /**
   * Generate insights for a specific entity
   */
  async generateEntityInsights(userId: string, entityId: string): Promise<Insight[]> {
    const insights: Insight[] = [];

    // Detect patterns
    const patterns = await this.detectPatterns(userId, entityId);
    insights.push(...patterns);

    // Detect shifts
    const shifts = await this.detectShifts(userId, entityId);
    insights.push(...shifts);

    // Detect perspective divergence
    const divergences = await this.detectPerspectiveDivergence(userId, entityId);
    insights.push(...divergences);

    return insights;
  }

  /**
   * Detect patterns in entity claims
   */
  async detectPatterns(userId: string, entityId: string): Promise<Insight[]> {
    try {
      const rankedClaims = await omegaMemoryService.rankClaims(entityId);
      if (rankedClaims.length < 3) {
        return []; // Need at least 3 claims for patterns
      }

      // Group claims by attributes
      const sentimentGroups = this.groupClaimsByAttribute(rankedClaims, 'sentiment');
      const relationshipGroups = this.groupClaimsByAttribute(rankedClaims, 'relationship');
      const topicGroups = await this.groupClaimsByTopic(rankedClaims);

      const patterns: Insight[] = [];

      // Check sentiment patterns
      for (const group of sentimentGroups) {
        if (this.occursRepeatedly(group, rankedClaims.length)) {
          const insight = await this.createPatternInsight(
            userId,
            entityId,
            'sentiment',
            group,
            rankedClaims
          );
          if (insight) patterns.push(insight);
        }
      }

      // Check topic patterns
      for (const group of topicGroups) {
        if (this.occursRepeatedly(group, rankedClaims.length)) {
          const insight = await this.createPatternInsight(
            userId,
            entityId,
            'topic',
            group,
            rankedClaims
          );
          if (insight) patterns.push(insight);
        }
      }

      return patterns;
    } catch (error) {
      logger.error({ err: error, userId, entityId }, 'Failed to detect patterns');
      return [];
    }
  }

  /**
   * Detect temporal shifts
   */
  async detectShifts(userId: string, entityId: string): Promise<Insight[]> {
    try {
      const claims = await omegaMemoryService.getClaimsForEntity(userId, entityId, true);
      if (claims.length < 4) {
        return []; // Need multiple claims over time
      }

      // Sort by time
      const sortedClaims = claims.sort((a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );

      const shifts: Insight[] = [];

      // Detect sentiment shift
      const sentimentShift = await this.detectSentimentShift(sortedClaims);
      if (sentimentShift) {
        const insight = await this.createShiftInsight(
          userId,
          entityId,
          sentimentShift,
          sortedClaims
        );
        if (insight) shifts.push(insight);
      }

      // Detect confidence shift
      const confidenceShift = this.detectConfidenceShift(sortedClaims);
      if (confidenceShift) {
        const insight = await this.createShiftInsight(
          userId,
          entityId,
          confidenceShift,
          sortedClaims
        );
        if (insight) shifts.push(insight);
      }

      return shifts;
    } catch (error) {
      logger.error({ err: error, userId, entityId }, 'Failed to detect shifts');
      return [];
    }
  }

  /**
   * Detect perspective divergence
   */
  async detectPerspectiveDivergence(userId: string, entityId: string): Promise<Insight[]> {
    try {
      const baseClaims = await omegaMemoryService.getClaimsForEntity(userId, entityId, true);
      const divergences: Insight[] = [];

      for (const claim of baseClaims) {
        const perspectiveClaims = await perspectiveService.getPerspectiveClaims(claim.id, userId);

        if (perspectiveClaims.length < 2) continue;

        // Check for strong disagreement
        const divergenceStrength = await this.calculateDivergenceStrength(perspectiveClaims);
        if (divergenceStrength > 0.5) {
          const insight = await this.createDivergenceInsight(
            userId,
            entityId,
            claim,
            perspectiveClaims,
            divergenceStrength
          );
          if (insight) divergences.push(insight);
        }
      }

      return divergences;
    } catch (error) {
      logger.error({ err: error, userId, entityId }, 'Failed to detect perspective divergence');
      return [];
    }
  }

  /**
   * Detect recurring themes (global)
   */
  async detectRecurringThemes(userId: string): Promise<Insight[]> {
    try {
      // Get all entities and their claims
      const entities = await omegaMemoryService.getEntities(userId);
      const allClaims: any[] = [];

      for (const entity of entities) {
        const claims = await omegaMemoryService.getClaimsForEntity(userId, entity.id, true);
        allClaims.push(...claims);
      }

      if (allClaims.length < THEME_THRESHOLD) {
        return [];
      }

      // Cluster by semantic topic
      const themes = await this.clusterBySemanticTopic(allClaims);

      const insights: Insight[] = [];

      for (const theme of themes) {
        if (theme.frequency >= THEME_THRESHOLD) {
          const insight = await this.createThemeInsight(userId, theme);
          if (insight) insights.push(insight);
        }
      }

      return insights;
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to detect recurring themes');
      return [];
    }
  }

  /**
   * Group claims by attribute
   */
  private groupClaimsByAttribute(claims: any[], attribute: string): PatternGroup[] {
    const groups = new Map<string, PatternGroup>();

    for (const claim of claims) {
      const value = (claim as any)[attribute] || 'UNKNOWN';
      const key = String(value);

      if (!groups.has(key)) {
        groups.set(key, {
          attribute,
          value: key,
          claim_ids: [],
          frequency: 0,
          claims: [],
        });
      }

      const group = groups.get(key)!;
      group.claim_ids.push(claim.id);
      group.frequency++;
      group.claims.push(claim);
    }

    return Array.from(groups.values());
  }

  /**
   * Group claims by topic using embeddings
   */
  private async groupClaimsByTopic(claims: any[]): Promise<PatternGroup[]> {
    try {
      // Generate embeddings for all claims
      const embeddings = await Promise.all(
        claims.map(c => embeddingService.embedText(c.text || ''))
      );

      // Simple clustering: group by similarity
      const groups = new Map<number, PatternGroup>();
      const threshold = 0.7;

      for (let i = 0; i < claims.length; i++) {
        let assigned = false;

        for (const [groupId, group] of groups.entries()) {
          const groupEmbedding = embeddings[parseInt(group.claim_ids[0])];
          const similarity = this.cosineSimilarity(embeddings[i], groupEmbedding);

          if (similarity > threshold) {
            group.claim_ids.push(claims[i].id);
            group.frequency++;
            group.claims.push(claims[i]);
            assigned = true;
            break;
          }
        }

        if (!assigned) {
          groups.set(i, {
            attribute: 'topic',
            value: `topic_${i}`,
            claim_ids: [claims[i].id],
            frequency: 1,
            claims: [claims[i]],
          });
        }
      }

      return Array.from(groups.values());
    } catch (error) {
      logger.error({ err: error }, 'Failed to group claims by topic');
      return [];
    }
  }

  /**
   * Check if pattern occurs repeatedly
   */
  private occursRepeatedly(group: PatternGroup, totalClaims: number): boolean {
    const frequencyRatio = group.frequency / totalClaims;
    return group.frequency >= 3 && frequencyRatio >= 0.3; // At least 3 occurrences and 30% frequency
  }

  /**
   * Detect sentiment shift
   */
  private async detectSentimentShift(claims: any[]): Promise<TemporalShift | null> {
    if (claims.length < 4) return null;

    // Split into early and late periods
    const midPoint = Math.floor(claims.length / 2);
    const earlyClaims = claims.slice(0, midPoint);
    const lateClaims = claims.slice(midPoint);

    const earlySentiment = this.calculateAverageSentiment(earlyClaims);
    const lateSentiment = this.calculateAverageSentiment(lateClaims);

    if (Math.abs(earlySentiment - lateSentiment) > 0.3) {
      return {
        from: earlySentiment > 0 ? 'positive' : 'negative',
        to: lateSentiment > 0 ? 'positive' : 'negative',
        claim_ids: claims.map(c => c.id),
        strength: Math.abs(earlySentiment - lateSentiment),
      };
    }

    return null;
  }

  /**
   * Detect confidence shift
   */
  private detectConfidenceShift(claims: any[]): TemporalShift | null {
    if (claims.length < 4) return null;

    const midPoint = Math.floor(claims.length / 2);
    const earlyClaims = claims.slice(0, midPoint);
    const lateClaims = claims.slice(midPoint);

    const earlyConfidence = earlyClaims.reduce((sum, c) => sum + (c.confidence || 0.6), 0) / earlyClaims.length;
    const lateConfidence = lateClaims.reduce((sum, c) => sum + (c.confidence || 0.6), 0) / lateClaims.length;

    if (Math.abs(earlyConfidence - lateConfidence) > 0.2) {
      return {
        from: earlyConfidence > lateConfidence ? 'high' : 'low',
        to: lateConfidence > earlyConfidence ? 'high' : 'low',
        claim_ids: claims.map(c => c.id),
        strength: Math.abs(earlyConfidence - lateConfidence),
      };
    }

    return null;
  }

  /**
   * Calculate average sentiment
   */
  private calculateAverageSentiment(claims: any[]): number {
    const sentimentMap: Record<string, number> = {
      POSITIVE: 1,
      NEGATIVE: -1,
      NEUTRAL: 0,
      MIXED: 0,
    };

    const sentiments = claims
      .map(c => c.sentiment || 'NEUTRAL')
      .map(s => sentimentMap[s] || 0);

    return sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length;
  }

  /**
   * Calculate divergence strength between perspectives
   */
  private async calculateDivergenceStrength(perspectiveClaims: any[]): Promise<number> {
    if (perspectiveClaims.length < 2) return 0;

    // Calculate semantic similarity between all pairs
    const similarities: number[] = [];

    for (let i = 0; i < perspectiveClaims.length; i++) {
      for (let j = i + 1; j < perspectiveClaims.length; j++) {
        const similarity = await this.semanticSimilarity(
          perspectiveClaims[i].text,
          perspectiveClaims[j].text
        );
        similarities.push(similarity);
      }
    }

    // Low average similarity = high divergence
    const avgSimilarity = similarities.reduce((sum, s) => sum + s, 0) / similarities.length;
    return 1 - avgSimilarity; // Convert similarity to divergence
  }

  /**
   * Cluster claims by semantic topic
   */
  private async clusterBySemanticTopic(claims: any[]): Promise<RecurringTheme[]> {
    try {
      // Use LLM to identify topics
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a topic clustering system. Analyze claims and identify recurring themes.

Return JSON:
{
  "themes": [
    {
      "topic": "theme name",
      "claim_ids": ["id1", "id2"],
      "frequency": number
    }
  ]
}`
          },
          {
            role: 'user',
            content: `Analyze these claims and identify recurring themes:\n\n${JSON.stringify(claims.slice(0, 50).map(c => ({ id: c.id, text: c.text })), null, 2)}`
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      const themes = (response.themes || []).map((t: any) => ({
        ...t,
        claims: claims.filter(c => t.claim_ids.includes(c.id)),
      }));

      return themes;
    } catch (error) {
      logger.error({ err: error }, 'Failed to cluster by topic');
      return [];
    }
  }

  /**
   * Create pattern insight
   */
  private async createPatternInsight(
    userId: string,
    entityId: string,
    attribute: string,
    group: PatternGroup,
    allClaims: any[]
  ): Promise<Insight | null> {
    try {
      const description = await this.summarizePattern(group, attribute);
      const confidence = this.calculatePatternConfidence(group, allClaims.length);

      return {
        id: '', // Will be set by saveInsights
        user_id: userId,
        type: 'PATTERN',
        title: `Recurring ${attribute} pattern detected`,
        description,
        confidence,
        scope: 'ENTITY',
        related_entity_ids: [entityId],
        related_claim_ids: group.claim_ids,
        related_perspective_ids: [],
        time_window: this.deriveTimeWindow(group.claims),
        generated_at: new Date().toISOString(),
        dismissed: false,
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to create pattern insight');
      return null;
    }
  }

  /**
   * Create shift insight
   */
  private async createShiftInsight(
    userId: string,
    entityId: string,
    shift: TemporalShift,
    claims: any[]
  ): Promise<Insight | null> {
    try {
      const description = await this.describeShift(shift, claims);
      const confidence = this.calculateTemporalConfidence(claims);

      return {
        id: '',
        user_id: userId,
        type: 'SHIFT',
        title: 'Temporal shift detected',
        description,
        confidence,
        scope: 'TIME',
        related_entity_ids: [entityId],
        related_claim_ids: shift.claim_ids,
        related_perspective_ids: [],
        time_window: this.deriveTimeWindow(claims),
        generated_at: new Date().toISOString(),
        dismissed: false,
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to create shift insight');
      return null;
    }
  }

  /**
   * Create divergence insight
   */
  private async createDivergenceInsight(
    userId: string,
    entityId: string,
    claim: any,
    perspectiveClaims: any[],
    divergenceStrength: number
  ): Promise<Insight | null> {
    try {
      const description = await this.describeDivergence(perspectiveClaims);
      const perspectiveIds = perspectiveClaims.map(pc => pc.perspective_id);

      return {
        id: '',
        user_id: userId,
        type: 'DIVERGENCE',
        title: 'Perspective divergence detected',
        description,
        confidence: divergenceStrength,
        scope: 'RELATIONSHIP',
        related_entity_ids: [entityId],
        related_claim_ids: [claim.id],
        related_perspective_ids: perspectiveIds,
        time_window: {},
        generated_at: new Date().toISOString(),
        dismissed: false,
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to create divergence insight');
      return null;
    }
  }

  /**
   * Create theme insight
   */
  private async createThemeInsight(userId: string, theme: RecurringTheme): Promise<Insight | null> {
    try {
      const description = await this.summarizeTheme(theme);
      const confidence = this.themeStrength(theme);

      return {
        id: '',
        user_id: userId,
        type: 'RECURRING_THEME',
        title: 'Recurring theme in your history',
        description,
        confidence,
        scope: 'SELF',
        related_entity_ids: [],
        related_claim_ids: theme.claim_ids,
        related_perspective_ids: [],
        time_window: this.deriveTimeWindow(theme.claims),
        generated_at: new Date().toISOString(),
        dismissed: false,
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to create theme insight');
      return null;
    }
  }

  /**
   * Save insights to database
   */
  private async saveInsights(userId: string, insights: Insight[]): Promise<void> {
    for (const insight of insights) {
      if (!insight.id) {
        const { data, error } = await supabaseAdmin
          .from('insights')
          .insert({
            user_id: userId,
            type: insight.type,
            title: insight.title,
            description: insight.description,
            confidence: insight.confidence,
            scope: insight.scope,
            related_entity_ids: insight.related_entity_ids,
            related_claim_ids: insight.related_claim_ids,
            related_perspective_ids: insight.related_perspective_ids,
            time_window: insight.time_window || {},
            dismissed: false,
          })
          .select()
          .single();

        if (data && !error) {
          // Create evidence for each related claim
          for (const claimId of insight.related_claim_ids) {
            await this.createEvidence(userId, data.id, claimId, insight);
          }
        }
      }
    }
  }

  /**
   * Create evidence for an insight
   */
  private async createEvidence(
    userId: string,
    insightId: string,
    claimId: string,
    insight: Insight
  ): Promise<void> {
    try {
      const explanation = `This claim supports the insight: ${insight.title}`;

      await supabaseAdmin
        .from('insight_evidence')
        .insert({
          user_id: userId,
          insight_id: insightId,
          claim_id: claimId,
          explanation,
        });
    } catch (error) {
      logger.error({ err: error, insightId, claimId }, 'Failed to create evidence');
    }
  }

  /**
   * Get insights for user
   */
  async getInsights(userId: string, filters?: {
    type?: InsightType;
    scope?: InsightScope;
    dismissed?: boolean;
    limit?: number;
  }): Promise<Insight[]> {
    try {
      let query = supabaseAdmin
        .from('insights')
        .select('*')
        .eq('user_id', userId)
        .order('generated_at', { ascending: false });

      if (filters?.type) {
        query = query.eq('type', filters.type);
      }

      if (filters?.scope) {
        query = query.eq('scope', filters.scope);
      }

      if (filters?.dismissed !== undefined) {
        query = query.eq('dismissed', filters.dismissed);
      } else {
        query = query.eq('dismissed', false); // Default to non-dismissed
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ err: error, userId }, 'Failed to get insights');
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to get insights');
      throw error;
    }
  }

  /**
   * Explain an insight with evidence
   */
  async explainInsight(insightId: string, userId: string): Promise<InsightWithEvidence | null> {
    try {
      const { data: insight, error: insightError } = await supabaseAdmin
        .from('insights')
        .select('*')
        .eq('id', insightId)
        .eq('user_id', userId)
        .single();

      if (insightError || !insight) {
        return null;
      }

      const { data: evidence } = await supabaseAdmin
        .from('insight_evidence')
        .select('*')
        .eq('insight_id', insightId)
        .eq('user_id', userId);

      return {
        insight,
        evidence: evidence || [],
        disclaimer: 'This is an observation, not a fact.',
      };
    } catch (error) {
      logger.error({ err: error, insightId, userId }, 'Failed to explain insight');
      return null;
    }
  }

  /**
   * Dismiss an insight
   */
  async dismissInsight(insightId: string, userId: string): Promise<void> {
    try {
      await supabaseAdmin
        .from('insights')
        .update({ dismissed: true })
        .eq('id', insightId)
        .eq('user_id', userId);
    } catch (error) {
      logger.error({ err: error, insightId, userId }, 'Failed to dismiss insight');
      throw error;
    }
  }

  /**
   * Helper: Summarize pattern
   */
  private async summarizePattern(group: PatternGroup, attribute: string): Promise<string> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: 'You are a pattern summarization system. Summarize patterns in a clear, concise way.'
          },
          {
            role: 'user',
            content: `Summarize this ${attribute} pattern:\n\n${JSON.stringify(group.claims.slice(0, 5).map(c => c.text), null, 2)}`
          }
        ]
      });

      return completion.choices[0]?.message?.content || `Pattern detected in ${attribute}`;
    } catch (error) {
      return `Pattern detected: ${group.value} appears ${group.frequency} times`;
    }
  }

  /**
   * Helper: Describe shift
   */
  private async describeShift(shift: TemporalShift, claims: any[]): Promise<string> {
    return `Shift detected from ${shift.from} to ${shift.to} over time. Strength: ${shift.strength.toFixed(2)}`;
  }

  /**
   * Helper: Describe divergence
   */
  private async describeDivergence(perspectiveClaims: any[]): Promise<string> {
    const perspectives = perspectiveClaims.map(pc => pc.perspective_id || 'unknown').join(', ');
    return `Different perspectives show disagreement: ${perspectives}`;
  }

  /**
   * Helper: Summarize theme
   */
  private async summarizeTheme(theme: RecurringTheme): Promise<string> {
    return `Theme "${theme.topic}" appears ${theme.frequency} times in your history.`;
  }

  /**
   * Helper: Calculate pattern confidence
   */
  private calculatePatternConfidence(group: PatternGroup, totalClaims: number): number {
    const frequencyRatio = group.frequency / totalClaims;
    return Math.min(0.9, 0.5 + frequencyRatio * 0.4);
  }

  /**
   * Helper: Calculate temporal confidence
   */
  private calculateTemporalConfidence(claims: any[]): number {
    return Math.min(0.9, 0.6 + (claims.length / 10) * 0.3);
  }

  /**
   * Helper: Theme strength
   */
  private themeStrength(theme: RecurringTheme): number {
    return Math.min(0.9, 0.5 + (theme.frequency / 10) * 0.4);
  }

  /**
   * Helper: Derive time window
   */
  private deriveTimeWindow(claims: any[]): { start?: string; end?: string } {
    if (claims.length === 0) return {};

    const times = claims
      .map(c => c.start_time ? new Date(c.start_time).getTime() : 0)
      .filter(t => t > 0)
      .sort((a, b) => a - b);

    if (times.length === 0) return {};

    return {
      start: new Date(times[0]).toISOString(),
      end: new Date(times[times.length - 1]).toISOString(),
    };
  }

  /**
   * Helper: Infer scope
   */
  private inferScope(params: any): InsightScope {
    if (params.related_entity_ids && params.related_entity_ids.length > 0) {
      return 'ENTITY';
    }
    if (params.time_window) {
      return 'TIME';
    }
    if (params.related_perspective_ids && params.related_perspective_ids.length > 0) {
      return 'RELATIONSHIP';
    }
    return 'SELF';
  }

  /**
   * Helper: Semantic similarity
   */
  private async semanticSimilarity(text1: string, text2: string): Promise<number> {
    try {
      const [e1, e2] = await Promise.all([
        embeddingService.embedText(text1),
        embeddingService.embedText(text2),
      ]);
      return this.cosineSimilarity(e1, e2);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Helper: Cosine similarity
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
}

export const insightReflectionService = new InsightReflectionService();

