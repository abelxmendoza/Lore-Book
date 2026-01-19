/**
 * LORE-KEEPER MEMORY REVIEW QUEUE (MRQ)
 * Service for managing memory proposals and review queue
 */

import OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';
import type {
  MemoryProposal,
  MemoryDecision,
  MemoryProposalInput,
  ProposalDecisionInput,
  PendingMRQItem,
  RiskLevel,
  ProposalStatus,
  DecisionType,
} from '../types/memoryReviewQueue';
import { extractTags } from '../utils/keywordDetector';

import { continuityService } from './continuityService';
import { embeddingService } from './embeddingService';
import { essenceProfileService } from './essenceProfileService';
import { memoirService } from './memoirService';
import { memoryService } from './memoryService';
import { omegaMemoryService } from './omegaMemoryService';
import { peoplePlacesService } from './peoplePlacesService';
import { supabaseAdmin } from './supabaseClient';

const openai = new OpenAI({ apiKey: config.openAiKey });

export class MemoryReviewQueueService {
  /**
   * Classify risk level for a memory proposal
   */
  async classifyRisk(proposal: MemoryProposalInput, userId: string): Promise<RiskLevel> {
    try {
      // High confidence (>= 0.6) is medium risk
      if ((proposal.confidence || 0.6) >= 0.6) {
        return 'MEDIUM';
      }

      // Check if affects identity
      if (await this.affectsIdentity(proposal.claim_text)) {
        return 'HIGH';
      }

      // Check if contradicts existing claims
      if (proposal.entity_id) {
        const contradictions = await this.contradictsExistingClaims(
          proposal.entity_id,
          proposal.claim_text,
          userId
        );
        if (contradictions) {
          return 'HIGH';
        }
      }

      // System perspective is medium risk
      if (proposal.perspective_id) {
        const { data: perspective } = await supabaseAdmin
          .from('perspectives')
          .select('type')
          .eq('id', proposal.perspective_id)
          .single();

        if (perspective?.type === 'SYSTEM') {
          return 'MEDIUM';
        }
      }

      return 'LOW';
    } catch (error) {
      logger.error({ err: error, proposal }, 'Failed to classify risk');
      // Default to medium risk on error
      return 'MEDIUM';
    }
  }

  /**
   * Check if claim affects identity
   */
  private async affectsIdentity(claimText: string): Promise<boolean> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are an identity impact analyzer. Determine if a claim affects personal identity, core values, or fundamental beliefs.

Return JSON:
{
  "affects_identity": boolean,
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}

Identity-affecting claims include:
- Core values and beliefs
- Fundamental personality traits
- Life-defining moments
- Relationship status (spouse, parent, etc.)
- Career-defining achievements
- Religious or philosophical beliefs`
          },
          {
            role: 'user',
            content: `Does this claim affect identity: "${claimText}"`
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      return response.affects_identity === true && (response.confidence || 0) >= 0.7;
    } catch (error) {
      logger.error({ err: error }, 'Failed to check identity impact');
      return false;
    }
  }

  /**
   * Check if claim contradicts existing claims
   */
  private async contradictsExistingClaims(
    entityId: string,
    claimText: string,
    userId: string
  ): Promise<boolean> {
    try {
      // Get existing claims for entity
      const { data: existingClaims } = await supabaseAdmin
        .from('omega_claims')
        .select('*')
        .eq('entity_id', entityId)
        .eq('user_id', userId)
        .eq('is_active', true);

      if (!existingClaims || existingClaims.length === 0) {
        return false;
      }

      // Check semantic similarity with existing claims
      const claimEmbedding = await embeddingService.embedText(claimText);

      for (const existing of existingClaims) {
        if (!existing.text) continue;

        const existingEmbedding = await embeddingService.embedText(existing.text);
        const similarity = this.cosineSimilarity(claimEmbedding, existingEmbedding);

        // Low similarity might indicate contradiction
        if (similarity < 0.3) {
          const isContradiction = await this.llmDetectContradiction(claimText, existing.text);
          if (isContradiction) {
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      logger.error({ err: error, entityId }, 'Failed to check contradictions');
      return false;
    }
  }

  /**
   * Check if proposal should bypass review
   */
  shouldBypassReview(riskLevel: RiskLevel): boolean {
    return riskLevel === 'LOW';
  }

  /**
   * Ingest memory with MRQ awareness
   */
  async ingestMemory(
    userId: string,
    claim: any,
    entity: any,
    perspectiveId: string | null,
    sourceText: string
  ): Promise<{ proposal: MemoryProposal; auto_approved: boolean }> {
    try {
      // Find affected claims
      const affectedClaimIds = await this.findAffectedClaims(entity.id, claim, userId);

      // Generate reasoning
      const reasoning = await this.generateReasoning(claim, entity, sourceText);

      // Create proposal
      const proposalInput: MemoryProposalInput = {
        entity_id: entity.id,
        claim_text: claim.text,
        perspective_id: perspectiveId || null,
        confidence: claim.confidence || 0.6,
        temporal_context: claim.metadata?.temporal_context || {},
        source_excerpt: sourceText.length > 200 ? sourceText.substring(0, 200) + '...' : sourceText,
        reasoning,
        affected_claim_ids: affectedClaimIds,
      };

      // Classify risk
      const riskLevel = await this.classifyRisk(proposalInput, userId);

      // Create proposal
      const { data: proposal, error } = await supabaseAdmin
        .from('memory_proposals')
        .insert({
          user_id: userId,
          ...proposalInput,
          risk_level: riskLevel,
          status: 'PENDING',
        })
        .select()
        .single();

      if (error) {
        logger.error({ err: error, userId }, 'Failed to create memory proposal');
        throw error;
      }

      // Auto-approve if low risk
      if (this.shouldBypassReview(riskLevel)) {
        await this.autoApprove(proposal);
        return { proposal, auto_approved: true };
      }

      // Otherwise, enqueue for review
      return { proposal, auto_approved: false };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to ingest memory with MRQ');
      throw error;
    }
  }

  /**
   * Auto-approve a proposal
   */
  async autoApprove(proposal: MemoryProposal): Promise<void> {
    try {
      // Commit the claim
      await this.commitClaim(proposal);

      // Record decision
      await supabaseAdmin
        .from('memory_decisions')
        .insert({
          user_id: proposal.user_id,
          proposal_id: proposal.id,
          decision: 'APPROVE',
          decided_by: 'SYSTEM',
          reason: 'Auto-approved low-risk memory',
        });

      // Update proposal status
      await supabaseAdmin
        .from('memory_proposals')
        .update({
          status: 'APPROVED',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', proposal.id);

      // Record continuity event
      await continuityService.emitEvent(proposal.user_id, {
        type: 'CLAIM_CREATED',
        context: {
          proposal_id: proposal.id,
          auto_approved: true,
        },
        explanation: 'Auto-approved low-risk memory',
        related_entity_ids: [proposal.entity_id],
        initiated_by: 'SYSTEM',
        severity: 'INFO',
        reversible: true,
      });
    } catch (error) {
      logger.error({ err: error, proposalId: proposal.id }, 'Failed to auto-approve proposal');
      throw error;
    }
  }

  /**
   * Commit a claim from a proposal
   */
  private async commitClaim(proposal: MemoryProposal): Promise<void> {
    try {
      // Create base claim
      const claim = await omegaMemoryService.storeClaim({
        user_id: proposal.user_id,
        entity_id: proposal.entity_id,
        text: proposal.claim_text,
        source: 'AI',
        confidence: proposal.confidence,
        temporal_context: proposal.temporal_context,
        start_time: proposal.temporal_context?.start_time || new Date().toISOString(),
        end_time: proposal.temporal_context?.end_time || null,
        is_active: true,
      });

      // Create perspective claim if perspective_id exists
      if (proposal.perspective_id) {
        const { perspectiveService } = await import('./perspectiveService');
        await perspectiveService.ingestClaimWithPerspective(
          proposal.user_id,
          claim,
          proposal.perspective_id
        );
      }
    } catch (error) {
      logger.error({ err: error, proposalId: proposal.id }, 'Failed to commit claim');
      throw error;
    }
  }

  /**
   * Approve a proposal
   */
  async approveProposal(userId: string, proposalId: string): Promise<MemoryDecision> {
    try {
      const proposal = await this.getProposal(proposalId, userId);
      if (!proposal) {
        throw new Error('Proposal not found');
      }

      // Commit the claim
      await this.commitClaim(proposal);

      // Run comprehensive ingestion to parse and categorize into all LoreBook systems
      await this.comprehensiveIngestion(userId, proposal);

      // Record decision
      const { data: decision, error } = await supabaseAdmin
        .from('memory_decisions')
        .insert({
          user_id: userId,
          proposal_id: proposalId,
          decision: 'APPROVE',
          decided_by: 'USER',
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Finalize proposal
      await this.finalizeProposal(proposalId, 'APPROVED');

      return decision;
    } catch (error) {
      logger.error({ err: error, userId, proposalId }, 'Failed to approve proposal');
      throw error;
    }
  }

  /**
   * Comprehensive ingestion - parse and categorize into all LoreBook systems
   * This ensures approved memories update timeline, characters, locations, essence, memoir, etc.
   */
  private async comprehensiveIngestion(userId: string, proposal: MemoryProposal): Promise<void> {
    const sourceText = proposal.source_excerpt || proposal.claim_text;
    
    // Run all ingestion processes in parallel (fire and forget for non-critical ones)
    const ingestionPromises: Promise<any>[] = [];

    // 1. Omega Memory ingestion (entities, claims, relationships)
    ingestionPromises.push(
      omegaMemoryService.ingestText(userId, sourceText, 'AI')
        .then(result => {
          logger.info({ 
            userId, 
            proposalId: proposal.id,
            entities: result.entities.length,
            claims: result.claims.length,
            relationships: result.relationships.length
          }, 'Omega Memory ingestion completed');
        })
        .catch(err => {
          logger.warn({ err, userId, proposalId: proposal.id }, 'Omega Memory ingestion failed (non-blocking)');
        })
    );

    // 2. Extract dates and create timeline entry if dates present
    ingestionPromises.push(
      this.extractAndSaveTimelineEntry(userId, sourceText, proposal)
        .catch(err => {
          logger.warn({ err, userId, proposalId: proposal.id }, 'Timeline entry creation failed (non-blocking)');
        })
    );

    // 3. Extract essence insights (psychological patterns)
    ingestionPromises.push(
      essenceProfileService.extractEssence(userId, [{ role: 'user', content: sourceText }], [])
        .then(insights => {
          if (Object.keys(insights).length > 0) {
            return essenceProfileService.updateProfile(userId, insights);
          }
        })
        .then(() => {
          logger.info({ userId, proposalId: proposal.id }, 'Essence insights extracted');
        })
        .catch(err => {
          logger.warn({ err, userId, proposalId: proposal.id }, 'Essence extraction failed (non-blocking)');
        })
    );

    // 4. Update memoir if significant
    ingestionPromises.push(
      memoirService.autoUpdateMemoir(userId)
        .then(() => {
          logger.info({ userId, proposalId: proposal.id }, 'Memoir updated');
        })
        .catch(err => {
          logger.warn({ err, userId, proposalId: proposal.id }, 'Memoir update failed (non-blocking)');
        })
    );

    // Wait for all ingestion processes (but don't fail if some fail)
    await Promise.allSettled(ingestionPromises);
  }

  /**
   * Extract dates from text and create timeline entry
   */
  private async extractAndSaveTimelineEntry(
    userId: string,
    text: string,
    proposal: MemoryProposal
  ): Promise<void> {
    try {
      // Use LLM to extract dates from text
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Extract dates and temporal information from the text.

Return JSON:
{
  "has_date": boolean,
  "date": "ISO date string or null",
  "date_precision": "EXACT" | "MONTH" | "YEAR" | "DECADE" | null,
  "date_confidence": 0.0-1.0,
  "temporal_context": "description of when this happened"
}

Only extract if there's a clear date reference. Return has_date: false if uncertain.`
          },
          {
            role: 'user',
            content: text
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');

      if (response.has_date && response.date) {
        // Create timeline entry
        await memoryService.saveEntry({
          userId,
          content: proposal.claim_text,
          date: response.date,
          tags: extractTags(text),
          source: 'memory_suggestion',
          metadata: {
            proposal_id: proposal.id,
            entity_id: proposal.entity_id,
            date_precision: response.date_precision,
            date_confidence: response.date_confidence,
            temporal_context: response.temporal_context,
            auto_captured: true,
          }
        });

        logger.info({ userId, proposalId: proposal.id, date: response.date }, 'Timeline entry created from memory suggestion');
      }
    } catch (error) {
      logger.debug({ err: error, userId, proposalId: proposal.id }, 'Date extraction failed, skipping timeline entry');
    }
  }

  /**
   * Reject a proposal
   */
  async rejectProposal(userId: string, proposalId: string, reason?: string): Promise<MemoryDecision> {
    try {
      const proposal = await this.getProposal(proposalId, userId);
      if (!proposal) {
        throw new Error('Proposal not found');
      }

      // Record decision
      const { data: decision, error } = await supabaseAdmin
        .from('memory_decisions')
        .insert({
          user_id: userId,
          proposal_id: proposalId,
          decision: 'REJECT',
          decided_by: 'USER',
          reason: reason || 'User rejected',
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Finalize proposal
      await this.finalizeProposal(proposalId, 'REJECTED');

      // Record continuity event
      await continuityService.emitEvent(userId, {
        type: 'CLAIM_REJECTED',
        context: {
          proposal_id: proposalId,
          reason,
        },
        explanation: 'User rejected proposed memory',
        related_entity_ids: [proposal.entity_id],
        initiated_by: 'USER',
        severity: 'INFO',
        reversible: false,
      });

      return decision;
    } catch (error) {
      logger.error({ err: error, userId, proposalId }, 'Failed to reject proposal');
      throw error;
    }
  }

  /**
   * Edit a proposal
   */
  async editProposal(
    userId: string,
    proposalId: string,
    newText: string,
    newConfidence?: number
  ): Promise<MemoryDecision> {
    try {
      const proposal = await this.getProposal(proposalId, userId);
      if (!proposal) {
        throw new Error('Proposal not found');
      }

      // Commit the claim with edited text
      const editedProposal = {
        ...proposal,
        claim_text: newText,
        confidence: newConfidence || proposal.confidence,
      };
      await this.commitClaim(editedProposal);

      // Record decision
      const { data: decision, error } = await supabaseAdmin
        .from('memory_decisions')
        .insert({
          user_id: userId,
          proposal_id: proposalId,
          decision: 'EDIT',
          decided_by: 'USER',
          edited_text: newText,
          edited_confidence: newConfidence,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Finalize proposal
      await this.finalizeProposal(proposalId, 'EDITED');

      return decision;
    } catch (error) {
      logger.error({ err: error, userId, proposalId }, 'Failed to edit proposal');
      throw error;
    }
  }

  /**
   * Defer a proposal
   */
  async deferProposal(userId: string, proposalId: string): Promise<MemoryDecision> {
    try {
      // Record decision
      const { data: decision, error } = await supabaseAdmin
        .from('memory_decisions')
        .insert({
          user_id: userId,
          proposal_id: proposalId,
          decision: 'DEFER',
          decided_by: 'USER',
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Update proposal status
      await supabaseAdmin
        .from('memory_proposals')
        .update({
          status: 'DEFERRED',
        })
        .eq('id', proposalId)
        .eq('user_id', userId);

      return decision;
    } catch (error) {
      logger.error({ err: error, userId, proposalId }, 'Failed to defer proposal');
      throw error;
    }
  }

  /**
   * Finalize a proposal
   */
  private async finalizeProposal(proposalId: string, status: ProposalStatus): Promise<void> {
    await supabaseAdmin
      .from('memory_proposals')
      .update({
        status,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', proposalId);
  }

  /**
   * Get pending MRQ items
   */
  async getPendingMRQ(userId: string): Promise<PendingMRQItem[]> {
    try {
      const { data, error } = await supabaseAdmin.rpc('get_pending_mrq', {
        user_id_param: userId,
      });

      if (error) {
        logger.error({ err: error, userId }, 'Failed to get pending MRQ');
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to get pending MRQ');
      throw error;
    }
  }

  /**
   * Get a proposal
   */
  async getProposal(proposalId: string, userId: string): Promise<MemoryProposal | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('memory_proposals')
        .select('*')
        .eq('id', proposalId)
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        return null;
      }

      return data;
    } catch (error) {
      logger.error({ err: error, proposalId, userId }, 'Failed to get proposal');
      return null;
    }
  }

  /**
   * Helper: Find affected claims
   */
  private async findAffectedClaims(
    entityId: string,
    claim: any,
    userId: string
  ): Promise<string[]> {
    try {
      // Get similar claims
      const { data: similarClaims } = await supabaseAdmin
        .from('omega_claims')
        .select('id')
        .eq('entity_id', entityId)
        .eq('user_id', userId)
        .eq('is_active', true);

      // Use semantic similarity to find truly affected claims
      const affected: string[] = [];
      const claimEmbedding = await embeddingService.embedText(claim.text);

      for (const similar of similarClaims || []) {
        // TODO: Get claim text and check similarity
        // For now, return all similar claims
        affected.push(similar.id);
      }

      return affected;
    } catch (error) {
      logger.error({ err: error, entityId }, 'Failed to find affected claims');
      return [];
    }
  }

  /**
   * Helper: Generate reasoning for proposal
   */
  private async generateReasoning(claim: any, entity: any, sourceText: string): Promise<string> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: `You are a memory reasoning generator. Explain why this memory was inferred from the source text.

Be concise and clear.`
          },
          {
            role: 'user',
            content: `Entity: ${entity.primary_name}
Claim: ${claim.text}
Source: ${sourceText.substring(0, 500)}

Why was this memory inferred?`
          }
        ]
      });

      return completion.choices[0]?.message?.content || 'Inferred from source text';
    } catch (error) {
      logger.error({ err: error }, 'Failed to generate reasoning');
      return 'Inferred from source text';
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

  /**
   * Helper: LLM contradiction detection
   */
  private async llmDetectContradiction(text1: string, text2: string): Promise<boolean> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a contradiction detection system. Determine if two claims contradict each other.

Return JSON:
{
  "is_contradiction": boolean,
  "confidence": 0.0-1.0
}`
          },
          {
            role: 'user',
            content: `Claim 1: ${text1}\n\nClaim 2: ${text2}\n\nAre these contradictory?`
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      return response.is_contradiction === true && (response.confidence || 0) >= 0.7;
    } catch (error) {
      logger.error({ err: error }, 'Failed to detect contradiction');
      return false;
    }
  }
}

export const memoryReviewQueueService = new MemoryReviewQueueService();

