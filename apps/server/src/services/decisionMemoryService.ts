/**
 * LORE-KEEPER DECISION MEMORY ENGINE (DME)
 * Service for capturing and retrieving decision memory
 */

import OpenAI from 'openai';
import { supabaseAdmin } from './supabaseClient';
import { logger } from '../logger';
import { config } from '../config';
import { embeddingService } from './embeddingService';
import { omegaMemoryService } from './omegaMemoryService';
import { insightReflectionService } from './insightReflectionService';
import { perspectiveService } from './perspectiveService';
import { continuityService } from './continuityService';
import type {
  Decision,
  DecisionOption,
  DecisionRationale,
  DecisionOutcome,
  DecisionSummary,
  DecisionInput,
  DecisionOptionInput,
  DecisionRationaleInput,
  DecisionOutcomeInput,
  DecisionType,
} from '../types/decisionMemory';

const openai = new OpenAI({ apiKey: config.openAiKey });

export class DecisionMemoryService {
  /**
   * Propose decision capture (for chatbot integration)
   */
  async proposeDecisionCapture(
    userId: string,
    context: {
      message?: string;
      entity_ids?: string[];
      claim_ids?: string[];
      insight_ids?: string[];
    }
  ): Promise<Decision | null> {
    try {
      const title = await this.generateTitle(context);
      const description = await this.summarizeContext(context);
      const decisionType = await this.inferDecisionType(context);
      const entityIds = context.entity_ids || await this.extractRelevantEntities(context, userId);
      const claimIds = context.claim_ids || await this.extractRelevantClaims(context, userId);
      const insightIds = context.insight_ids || await this.extractRelevantInsights(context, userId);
      const confidence = await this.inferConfidence(context, userId);

      // Get default SELF perspective
      const perspectives = await perspectiveService.getOrCreateDefaultPerspectives(userId);
      const selfPerspective = perspectives.find(p => p.type === 'SELF');

      const decision: Partial<Decision> = {
        user_id: userId,
        title,
        description,
        decision_type: decisionType,
        entity_ids: entityIds,
        related_claim_ids: claimIds,
        related_insight_ids: insightIds,
        perspective_id: selfPerspective?.id || null,
        confidence,
      };

      const { data, error } = await supabaseAdmin
        .from('decisions')
        .insert(decision)
        .select()
        .single();

      if (error) {
        logger.error({ err: error, userId }, 'Failed to propose decision capture');
        return null;
      }

      return data;
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to propose decision capture');
      return null;
    }
  }

  /**
   * Record decision with options and rationale
   */
  async recordDecision(
    userId: string,
    decisionInput: DecisionInput,
    options: DecisionOptionInput[],
    rationale: DecisionRationaleInput
  ): Promise<DecisionSummary> {
    try {
      // Get default SELF perspective if not provided
      let perspectiveId = decisionInput.perspective_id;
      if (!perspectiveId) {
        const perspectives = await perspectiveService.getOrCreateDefaultPerspectives(userId);
        const selfPerspective = perspectives.find(p => p.type === 'SELF');
        perspectiveId = selfPerspective?.id || null;
      }

      // Create decision
      const { data: decision, error: decisionError } = await supabaseAdmin
        .from('decisions')
        .insert({
          user_id: userId,
          title: decisionInput.title,
          description: decisionInput.description,
          decision_type: decisionInput.decision_type,
          entity_ids: decisionInput.entity_ids || [],
          related_claim_ids: decisionInput.related_claim_ids || [],
          related_insight_ids: decisionInput.related_insight_ids || [],
          perspective_id: perspectiveId,
          confidence: decisionInput.confidence || 0.6,
          uncertainty_notes: decisionInput.uncertainty_notes,
        })
        .select()
        .single();

      if (decisionError || !decision) {
        throw decisionError || new Error('Failed to create decision');
      }

      // Create options
      const createdOptions: DecisionOption[] = [];
      for (const option of options) {
        const { data: optionData, error: optionError } = await supabaseAdmin
          .from('decision_options')
          .insert({
            user_id: userId,
            decision_id: decision.id,
            option_text: option.option_text,
            perceived_risks: option.perceived_risks,
            perceived_rewards: option.perceived_rewards,
            confidence: option.confidence,
          })
          .select()
          .single();

        if (!optionError && optionData) {
          createdOptions.push(optionData);
        }
      }

      // Create rationale
      const { data: rationaleData, error: rationaleError } = await supabaseAdmin
        .from('decision_rationales')
        .insert({
          user_id: userId,
          decision_id: decision.id,
          reasoning: rationale.reasoning,
          values_considered: rationale.values_considered || [],
          emotions_present: rationale.emotions_present || [],
          constraints: rationale.constraints || [],
          known_unknowns: rationale.known_unknowns,
        })
        .select()
        .single();

      if (rationaleError) {
        logger.error({ err: rationaleError, decisionId: decision.id }, 'Failed to create rationale');
      }

      // Record continuity event
      await continuityService.emitEvent(userId, {
        type: 'DECISION_RECORDED',
        context: {
          decision_id: decision.id,
          decision_type: decision.decision_type,
        },
        explanation: `Decision recorded: ${decision.title}`,
        related_entity_ids: decision.entity_ids,
        related_claim_ids: decision.related_claim_ids,
        initiated_by: 'USER',
        severity: 'INFO',
        reversible: false,
      });

      return {
        decision,
        options: createdOptions,
        rationale: rationaleData || undefined,
        outcomes: [],
      };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to record decision');
      throw error;
    }
  }

  /**
   * Record decision outcome (post-hoc, never overwrites)
   */
  async recordDecisionOutcome(
    userId: string,
    decisionId: string,
    outcomeInput: DecisionOutcomeInput
  ): Promise<DecisionOutcome> {
    try {
      // Verify decision exists and belongs to user
      const { data: decision } = await supabaseAdmin
        .from('decisions')
        .select('*')
        .eq('id', decisionId)
        .eq('user_id', userId)
        .single();

      if (!decision) {
        throw new Error('Decision not found');
      }

      // Create outcome (can have multiple outcomes per decision)
      const { data: outcome, error } = await supabaseAdmin
        .from('decision_outcomes')
        .insert({
          user_id: userId,
          decision_id: decisionId,
          outcome_text: outcomeInput.outcome_text,
          sentiment: outcomeInput.sentiment,
          linked_claim_ids: outcomeInput.linked_claim_ids || [],
        })
        .select()
        .single();

      if (error) {
        logger.error({ err: error, decisionId, userId }, 'Failed to record outcome');
        throw error;
      }

      // Record continuity event
      await continuityService.emitEvent(userId, {
        type: 'DECISION_OUTCOME_RECORDED',
        context: {
          decision_id: decisionId,
          outcome_id: outcome.id,
          sentiment: outcomeInput.sentiment,
        },
        explanation: `Outcome recorded for decision: ${decision.title}`,
        related_entity_ids: decision.entity_ids,
        related_claim_ids: outcomeInput.linked_claim_ids || [],
        initiated_by: 'USER',
        severity: 'INFO',
        reversible: false,
      });

      return outcome;
    } catch (error) {
      logger.error({ err: error, decisionId, userId }, 'Failed to record decision outcome');
      throw error;
    }
  }

  /**
   * Get similar past decisions
   */
  async getSimilarPastDecisions(
    userId: string,
    context: {
      decision_type?: DecisionType;
      entity_ids?: string[];
      message?: string;
    },
    threshold: number = 0.6
  ): Promise<Decision[]> {
    try {
      let query = supabaseAdmin
        .from('decisions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (context.decision_type) {
        query = query.eq('decision_type', context.decision_type);
      }

      const { data: decisions } = await query;

      if (!decisions || decisions.length === 0) {
        return [];
      }

      // If message provided, use semantic similarity
      if (context.message) {
        const messageEmbedding = await embeddingService.embedText(context.message);
        const similarities: Array<{ decision: Decision; similarity: number }> = [];

        for (const decision of decisions) {
          const decisionText = `${decision.title} ${decision.description}`;
          const decisionEmbedding = await embeddingService.embedText(decisionText);
          const similarity = this.cosineSimilarity(messageEmbedding, decisionEmbedding);

          if (similarity >= threshold) {
            similarities.push({ decision, similarity });
          }
        }

        return similarities
          .sort((a, b) => b.similarity - a.similarity)
          .map(s => s.decision)
          .slice(0, 10);
      }

      // Otherwise, filter by entity overlap
      if (context.entity_ids && context.entity_ids.length > 0) {
        return decisions.filter(d =>
          d.entity_ids.some(id => context.entity_ids!.includes(id))
        ).slice(0, 10);
      }

      return decisions.slice(0, 10);
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to get similar past decisions');
      return [];
    }
  }

  /**
   * Get decision summary with all related data
   */
  async summarizeDecision(decisionId: string, userId: string): Promise<DecisionSummary | null> {
    try {
      // Get decision
      const { data: decision, error: decisionError } = await supabaseAdmin
        .from('decisions')
        .select('*')
        .eq('id', decisionId)
        .eq('user_id', userId)
        .single();

      if (decisionError || !decision) {
        return null;
      }

      // Get options
      const { data: options } = await supabaseAdmin
        .from('decision_options')
        .select('*')
        .eq('decision_id', decisionId)
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      // Get rationale
      const { data: rationale } = await supabaseAdmin
        .from('decision_rationales')
        .select('*')
        .eq('decision_id', decisionId)
        .eq('user_id', userId)
        .single();

      // Get outcomes
      const { data: outcomes } = await supabaseAdmin
        .from('decision_outcomes')
        .select('*')
        .eq('decision_id', decisionId)
        .eq('user_id', userId)
        .order('recorded_at', { ascending: false });

      return {
        decision,
        options: options || [],
        rationale: rationale || undefined,
        outcomes: outcomes || [],
      };
    } catch (error) {
      logger.error({ err: error, decisionId, userId }, 'Failed to summarize decision');
      return null;
    }
  }

  /**
   * Get decisions for user with filters
   */
  async getDecisions(
    userId: string,
    filters?: {
      decision_type?: DecisionType;
      entity_id?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<Decision[]> {
    try {
      let query = supabaseAdmin
        .from('decisions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (filters?.decision_type) {
        query = query.eq('decision_type', filters.decision_type);
      }

      if (filters?.entity_id) {
        query = query.contains('entity_ids', [filters.entity_id]);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      if (filters?.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ err: error, userId }, 'Failed to get decisions');
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to get decisions');
      throw error;
    }
  }

  /**
   * Helper: Generate title from context
   */
  private async generateTitle(context: any): Promise<string> {
    if (context.title) {
      return context.title;
    }

    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: 'Generate a concise title for a decision based on context.'
          },
          {
            role: 'user',
            content: `Context: ${JSON.stringify(context)}`
          }
        ]
      });

      return completion.choices[0]?.message?.content || 'Decision';
    } catch (error) {
      return 'Decision';
    }
  }

  /**
   * Helper: Summarize context
   */
  private async summarizeContext(context: any): Promise<string> {
    if (context.description) {
      return context.description;
    }

    if (context.message) {
      return context.message;
    }

    return JSON.stringify(context);
  }

  /**
   * Helper: Infer decision type
   */
  private async inferDecisionType(context: any): Promise<DecisionType> {
    if (context.decision_type) {
      return context.decision_type;
    }

    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Classify the decision type.

Return JSON:
{
  "decision_type": "RELATIONSHIP" | "CAREER" | "HEALTH" | "FINANCIAL" | "CREATIVE" | "SOCIAL" | "PERSONAL" | "OTHER"
}`
          },
          {
            role: 'user',
            content: `Context: ${JSON.stringify(context)}`
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      return (response.decision_type || 'OTHER') as DecisionType;
    } catch (error) {
      return 'OTHER';
    }
  }

  /**
   * Helper: Extract relevant entities
   */
  private async extractRelevantEntities(context: any, userId: string): Promise<string[]> {
    if (context.entity_ids && context.entity_ids.length > 0) {
      return context.entity_ids;
    }

    // Try to extract from message
    if (context.message) {
      const entities = await omegaMemoryService.getEntities(userId);
      const extracted: string[] = [];

      for (const entity of entities) {
        if (context.message.toLowerCase().includes(entity.primary_name.toLowerCase())) {
          extracted.push(entity.id);
        }
      }

      return extracted;
    }

    return [];
  }

  /**
   * Helper: Extract relevant claims
   */
  private async extractRelevantClaims(context: any, userId: string): Promise<string[]> {
    if (context.claim_ids && context.claim_ids.length > 0) {
      return context.claim_ids;
    }

    // Get claims for relevant entities
    const entityIds = await this.extractRelevantEntities(context, userId);
    const claimIds: string[] = [];

    for (const entityId of entityIds) {
      const claims = await omegaMemoryService.getClaimsForEntity(userId, entityId, true);
      claimIds.push(...claims.map(c => c.id));
    }

    return claimIds.slice(0, 10); // Limit to 10
  }

  /**
   * Helper: Extract relevant insights
   */
  private async extractRelevantInsights(context: any, userId: string): Promise<string[]> {
    if (context.insight_ids && context.insight_ids.length > 0) {
      return context.insight_ids;
    }

    // Get insights related to entities
    const entityIds = await this.extractRelevantEntities(context, userId);
    const insights = await insightReflectionService.getInsights(userId, {
      dismissed: false,
      limit: 10,
    });

    return insights
      .filter(i => i.related_entity_ids.some(id => entityIds.includes(id)))
      .map(i => i.id)
      .slice(0, 5);
  }

  /**
   * Helper: Infer confidence
   */
  private async inferConfidence(context: any, userId: string): Promise<number> {
    if (context.confidence !== undefined) {
      return context.confidence;
    }

    // Base confidence on available information
    const entityIds = await this.extractRelevantEntities(context, userId);
    const claimIds = await this.extractRelevantClaims(context, userId);
    const insightIds = await this.extractRelevantInsights(context, userId);

    // More information = higher confidence
    const infoScore = Math.min(1.0, (entityIds.length * 0.1 + claimIds.length * 0.05 + insightIds.length * 0.1));
    return Math.max(0.3, infoScore);
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

export const decisionMemoryService = new DecisionMemoryService();

