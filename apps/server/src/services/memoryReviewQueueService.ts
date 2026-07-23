/**
 * LOREBOOK MEMORY REVIEW QUEUE (MRQ)
 * Service for managing memory proposals and review queue
 */


import { config } from '../config';
import { openai } from '../lib/openai';
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
import type { Claim } from '../types/omegaMemory';
import { extractTags } from '../utils/keywordDetector';

import { continuityService } from './continuityService';
import { embeddingService } from './embeddingService';
import { essenceProfileService } from './essenceProfileService';
import { memoirService } from './memoirService';
import { canAutoApproveProposal, evaluateProposalIntegrity } from './memoryProposalPolicy';
import { memoryService } from './memoryService';
import { omegaMemoryService } from './omegaMemoryService';
import { peoplePlacesService } from './peoplePlacesService';
import { supabaseAdmin } from './supabaseClient';

export class MemoryReviewQueueService {
  /**
   * Classify risk level for a memory proposal
   */
  async classifyRisk(proposal: MemoryProposalInput, userId: string): Promise<RiskLevel> {
    return evaluateProposalIntegrity({
      userId,
      entityId: proposal.entity_id,
      proposal,
      sourceText: proposal.source_excerpt ?? proposal.claim_text,
    }).riskLevel;
  }

  /**
   * Check if claim affects identity
   */
  private async affectsIdentity(claimText: string): Promise<boolean> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-5.4-mini',
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
  ): Promise<{ proposal: MemoryProposal; auto_approved: boolean; claim?: Claim }> {
    try {
      const claimMetadata = (claim.metadata ?? {}) as Record<string, unknown>;
      const integrity = evaluateProposalIntegrity({
        userId,
        entityId: entity.id,
        entityName: entity.primary_name,
        proposal: {
          entity_id: entity.id,
          claim_text: claim.text,
          confidence: claim.confidence,
          temporal_context: claim.metadata?.temporal_context,
        },
        sourceText,
        metadata: { ...claimMetadata, entity_name: entity.primary_name },
      });

      // Find only claims the proposed mutation can actually affect. The old
      // implementation returned every active claim for the entity.
      const mutatesExistingClaims = integrity.proposalKind === 'correction' || integrity.proposalKind === 'retraction';
      const affectedClaimIds = integrity.valid && mutatesExistingClaims
        ? await this.findAffectedClaims(
            entity.id,
            claim,
            userId,
            integrity.fingerprintInputs.subjectScope === 'self'
          )
        : [];

      // Generate reasoning
      const reasoning = await this.generateReasoning(claim, entity, sourceText);

      // Create proposal
      const proposalInput: MemoryProposalInput = {
        entity_id: entity.id,
        claim_text: integrity.normalizedSummary,
        perspective_id: perspectiveId || undefined,
        confidence: claim.confidence || 0.6,
        temporal_context: claim.metadata?.temporal_context || {},
        source_excerpt: sourceText.length > 200 ? sourceText.substring(0, 200) + '...' : sourceText,
        reasoning,
        affected_claim_ids: affectedClaimIds,
      };

      const evidenceId = [claimMetadata.extracted_unit_id, claimMetadata.message_id, claimMetadata.utterance_id]
        .find((value): value is string => typeof value === 'string' && value.length > 0);

      // Stage contract: atomic memory_proposal / correction / retraction before insert.
      const { validateMemoryProposalBeforePersist, validateCorrectionBeforeApply, validateRetractionBeforeApply, recordPersisted } =
        await import('./ingestion/stageContractGate');
      const evidenceIds = evidenceId ? [evidenceId] : ['mrq'];
      let contractOk = integrity.valid;
      let contractReason: string | null = integrity.rejectionReason ?? null;
      if (integrity.proposalKind === 'retraction') {
        const ret = validateRetractionBeforeApply({
          targetClaimIds: affectedClaimIds,
          reason: integrity.proposedMutation || integrity.normalizedSummary,
          authority: 'user_explicit',
          note: sourceText.slice(0, 500),
        });
        contractOk = ret.accepted && integrity.valid;
        if (!ret.accepted) contractReason = ret.reason;
      } else if (integrity.proposalKind === 'correction') {
        const corr = validateCorrectionBeforeApply({
          targetClaimIds: affectedClaimIds,
          replacementClaim: integrity.normalizedSummary,
          correctionAuthority: 'user_explicit',
          evidenceIds,
          note: sourceText.slice(0, 500),
          supersessionBehavior: affectedClaimIds.length ? 'replace_claims' : 'annotate_only',
        });
        contractOk = corr.accepted && integrity.valid;
        if (!corr.accepted) contractReason = corr.reason;
      } else {
        const mem = validateMemoryProposalBeforePersist({
          proposalKind: integrity.proposalKind,
          subjectEntityId: entity.id,
          predicate: integrity.predicate,
          objectEntityId: typeof claimMetadata.object_entity_id === 'string'
            ? claimMetadata.object_entity_id
            : undefined,
          typedValue: integrity.typedValue,
          confidence: integrity.confidence,
          risk: integrity.riskLevel,
          sensitivity: integrity.sensitivity,
          evidenceIds,
          temporalScope: { kind: 'UNKNOWN' },
          proposedMutation: integrity.proposedMutation,
          claimText: integrity.normalizedSummary,
        });
        contractOk = mem.accepted && integrity.valid;
        if (!mem.accepted) contractReason = mem.reason;
      }

      const proposalMetadata = {
        ...claimMetadata,
        proposal_kind: integrity.proposalKind,
        normalized_summary: integrity.normalizedSummary,
        proposed_mutation: integrity.proposedMutation,
        normalized_predicate: integrity.predicate,
        typed_value: integrity.typedValue,
        proposal_fingerprint: integrity.fingerprint,
        fingerprint_inputs: integrity.fingerprintInputs,
        group_key: integrity.groupKey,
        group_label: integrity.groupLabel,
        risk_reason: integrity.riskReason,
        sensitivity: integrity.sensitivity,
        source_evidence_ids: evidenceId ? [evidenceId] : [],
        evidence_count: evidenceId ? 1 : 0,
        proposal_integrity: {
          valid: integrity.valid && contractOk,
          rejection_reason: contractReason ?? integrity.rejectionReason ?? null,
          policy_version: 'v1',
          stage_contract: contractOk ? 'accepted' : 'rejected',
        },
      };

      // Contract/policy failure → REJECTED row (no auto-approve, no additive memory).
      if (!contractOk) {
        const { data: rejectedProposal, error: rejErr } = await supabaseAdmin
          .from('memory_proposals')
          .insert({
            user_id: userId,
            ...proposalInput,
            risk_level: integrity.riskLevel,
            status: 'REJECTED',
            resolved_at: new Date().toISOString(),
            metadata: proposalMetadata,
          })
          .select()
          .single();
        if (rejErr) {
          logger.warn({ err: rejErr, userId }, 'MRQ: failed to insert rejected proposal');
          throw rejErr;
        }
        return { proposal: rejectedProposal as MemoryProposal, auto_approved: false };
      }
      recordPersisted('memory_proposal');

      // Replay-safe semantic collapse. Evidence accumulates on the canonical
      // pending proposal instead of creating another Approve button.
      if (integrity.valid) {
        const existing = await this.findPendingByFingerprint(userId, integrity.fingerprint);
        if (existing) {
          const existingMetadata = (existing.metadata ?? {}) as Record<string, any>;
          const evidenceIds = [...new Set([
            ...((existingMetadata.source_evidence_ids as string[] | undefined) ?? []),
            ...(evidenceId ? [evidenceId] : []),
          ])];
          const excerpts = [...new Set([
            ...((existingMetadata.source_excerpts as string[] | undefined) ?? []),
            sourceText.slice(0, 500),
          ])].slice(-12);
          const { data: updated } = await supabaseAdmin
            .from('memory_proposals')
            .update({
              confidence: Math.max(existing.confidence, integrity.confidence),
              metadata: {
                ...existingMetadata,
                source_evidence_ids: evidenceIds,
                source_excerpts: excerpts,
                evidence_count: Math.max(evidenceIds.length, Number(existingMetadata.evidence_count ?? 0) + 1),
                last_supported_at: new Date().toISOString(),
              },
            })
            .eq('id', existing.id)
            .eq('user_id', userId)
            .select('*')
            .single();
          return { proposal: (updated ?? existing) as MemoryProposal, auto_approved: false };
        }
      }

      // Create proposal
      const { data: proposal, error } = await supabaseAdmin
        .from('memory_proposals')
        .insert({
          user_id: userId,
          ...proposalInput,
          risk_level: integrity.riskLevel,
          status: integrity.valid ? 'PENDING' : 'REJECTED',
          resolved_at: integrity.valid ? null : new Date().toISOString(),
          metadata: proposalMetadata,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505' && integrity.valid) {
          const canonical = await this.findPendingByFingerprint(userId, integrity.fingerprint);
          if (canonical) return { proposal: canonical, auto_approved: false };
        }
        logger.error({ err: error, userId }, 'Failed to create memory proposal');
        throw error;
      }

      // Auto-approve if low risk — claim is persisted inside autoApprove
      if (!claimMetadata.force_review && canAutoApproveProposal(integrity)) {
        const storedClaim = await this.autoApprove(proposal);
        return { proposal, auto_approved: true, claim: storedClaim };
      }

      // Otherwise, enqueue for review (no omega_claim write yet)
      return { proposal, auto_approved: false };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to ingest memory with MRQ');
      throw error;
    }
  }

  /**
   * Auto-approve a proposal
   */
  async autoApprove(proposal: MemoryProposal): Promise<Claim> {
    try {
      const storedClaim = await this.commitClaim(proposal);

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

      return storedClaim;
    } catch (error) {
      logger.error({ err: error, proposalId: proposal.id }, 'Failed to auto-approve proposal');
      throw error;
    }
  }

  /**
   * Commit a claim from a proposal — the only MRQ-approved write path to omega_claims.
   */
  private async commitClaim(proposal: MemoryProposal): Promise<Claim> {
    try {
      // Create base claim
      const claim = await omegaMemoryService.storeClaim({
        user_id: proposal.user_id,
        entity_id: proposal.entity_id,
        text: String(proposal.metadata?.normalized_summary ?? proposal.claim_text),
        source: proposal.metadata?.authority === 'user_authored' ? 'USER' : 'AI',
        confidence: proposal.confidence,
        start_time: proposal.temporal_context?.start_time || new Date().toISOString(),
        end_time: proposal.temporal_context?.end_time || null,
        is_active: true,
        metadata: {
          temporal_context: proposal.temporal_context ?? {},
          source: proposal.metadata?.source ?? null,
          source_file_id: proposal.metadata?.source_file_id ?? null,
          source_conversation_id: proposal.metadata?.source_conversation_id ?? null,
          source_message_id: proposal.metadata?.source_message_id ?? null,
          authority: proposal.metadata?.authority ?? null,
        },
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

      return claim;
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

      const integrity = (proposal.metadata?.proposal_integrity ?? {}) as { valid?: boolean; rejection_reason?: string };
      if (integrity.valid === false) {
        throw new Error(`Invalid proposal cannot be approved: ${integrity.rejection_reason ?? 'failed integrity policy'}`);
      }

      const proposalKind = proposal.metadata?.proposal_kind;
      if (proposalKind === 'retraction' || proposalKind === 'correction') {
        const affected = proposal.affected_claim_ids ?? [];
        if (affected.length === 0) throw new Error('Correction has no specific conflicting claim to supersede');
        await supabaseAdmin
          .from('omega_claims')
          .update({ is_active: false, metadata: { superseded_by_proposal_id: proposal.id } })
          .eq('user_id', userId)
          .in('id', affected);
      }
      if (proposalKind !== 'retraction') await this.commitClaim(proposal);

      // Run comprehensive ingestion to parse and categorize into all LoreBook systems
      if (proposalKind !== 'retraction') await this.comprehensiveIngestion(userId, proposal);

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
      omegaMemoryService.ingestText(userId, sourceText)
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
        model: config.defaultModel || 'gpt-5.4-mini',
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
          source: 'system',
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
   * Get pending MRQ items.
   * Returns [] if the MRQ RPC/table is missing or fails (e.g. migration not run) so the UI can show "No pending proposals" instead of an error.
   */
  async getPendingMRQ(userId: string): Promise<PendingMRQItem[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('memory_proposals')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: true })
        .limit(500);

      if (error) {
        logger.warn({ err: error, userId }, 'get_pending_mrq failed, returning empty list');
        return [];
      }

      const rows = (data ?? []) as MemoryProposal[];
      const entityIds = [...new Set(rows.map(row => row.entity_id).filter(Boolean))];
      const { data: entities } = entityIds.length > 0
        ? await supabaseAdmin.from('omega_entities').select('id, primary_name').eq('user_id', userId).in('id', entityIds)
        : { data: [] as Array<{ id: string; primary_name: string }> };
      const names = new Map((entities ?? []).map(entity => [entity.id as string, entity.primary_name as string]));
      const canonical = new Map<string, PendingMRQItem>();
      for (const row of rows) {
        const metadata = (row.metadata ?? {}) as Record<string, any>;
        const decision = evaluateProposalIntegrity({
          userId,
          entityId: row.entity_id,
          entityName: names.get(row.entity_id),
          proposal: {
            entity_id: row.entity_id,
            claim_text: row.claim_text,
            perspective_id: row.perspective_id ?? undefined,
            confidence: row.confidence,
            temporal_context: row.temporal_context,
            source_excerpt: row.source_excerpt,
            reasoning: row.reasoning,
            affected_claim_ids: row.affected_claim_ids,
          },
          sourceText: row.source_excerpt ?? row.claim_text,
          metadata,
        });
        if (!decision.valid) continue;
        const fingerprint = String(metadata.proposal_fingerprint ?? decision.fingerprint);
        const current = canonical.get(fingerprint);
        const enriched = {
          ...row,
          claim_text: String(metadata.normalized_summary ?? decision.normalizedSummary),
          metadata: {
            ...metadata,
            proposal_kind: metadata.proposal_kind ?? decision.proposalKind,
            normalized_summary: metadata.normalized_summary ?? decision.normalizedSummary,
            proposed_mutation: metadata.proposed_mutation ?? decision.proposedMutation,
            proposal_fingerprint: fingerprint,
            group_key: metadata.group_key ?? decision.groupKey,
            group_label: metadata.group_label ?? decision.groupLabel,
            risk_reason: metadata.risk_reason ?? decision.riskReason,
            sensitivity: metadata.sensitivity ?? decision.sensitivity,
            evidence_count: Number(metadata.evidence_count ?? 1),
          },
        } as PendingMRQItem;
        if (!current) canonical.set(fingerprint, enriched);
        else {
          const currentCount = Number(current.metadata?.evidence_count ?? 1);
          const nextCount = Number(enriched.metadata?.evidence_count ?? 1);
          current.metadata = { ...current.metadata, evidence_count: currentCount + nextCount };
        }
      }
      return [...canonical.values()].sort((a, b) => {
        const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
        return rank[a.risk_level] - rank[b.risk_level] || a.created_at.localeCompare(b.created_at);
      });
    } catch (error) {
      logger.warn({ err: error, userId }, 'get_pending_mrq threw, returning empty list');
      return [];
    }
  }

  /** Dry-run cleanup plan for legacy pending proposals. Never mutates evidence. */
  async auditPendingMRQ(userId: string): Promise<{
    dryRun: true;
    summary: Record<'keep' | 'merge_into' | 'auto_reject' | 'correction' | 'requires_review', number>;
    items: Array<{ proposalId: string; action: 'keep' | 'merge_into' | 'auto_reject' | 'correction' | 'requires_review'; reason: string; destinationProposalId?: string }>;
  }> {
    const { data, error } = await supabaseAdmin
      .from('memory_proposals')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true })
      .limit(1000);
    if (error) throw error;

    const rows = (data ?? []) as MemoryProposal[];
    const entityIds = [...new Set(rows.map(row => row.entity_id).filter(Boolean))];
    const { data: entities } = entityIds.length > 0
      ? await supabaseAdmin.from('omega_entities').select('id, primary_name').eq('user_id', userId).in('id', entityIds)
      : { data: [] as Array<{ id: string; primary_name: string }> };
    const entityNames = new Map((entities ?? []).map(entity => [entity.id as string, entity.primary_name as string]));
    const summary = { keep: 0, merge_into: 0, auto_reject: 0, correction: 0, requires_review: 0 };
    const canonical = new Map<string, string>();
    const items = rows.map(row => {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      const decision = evaluateProposalIntegrity({
        userId,
        entityId: row.entity_id,
        entityName: entityNames.get(row.entity_id),
        proposal: {
          entity_id: row.entity_id,
          claim_text: row.claim_text,
          perspective_id: row.perspective_id ?? undefined,
          confidence: row.confidence,
          temporal_context: row.temporal_context,
          source_excerpt: row.source_excerpt,
          reasoning: row.reasoning,
          affected_claim_ids: row.affected_claim_ids,
        },
        sourceText: row.source_excerpt ?? row.claim_text,
        metadata: { ...metadata, entity_name: metadata.entity_name ?? entityNames.get(row.entity_id) },
      });
      let action: 'keep' | 'merge_into' | 'auto_reject' | 'correction' | 'requires_review';
      let reason: string;
      let destinationProposalId: string | undefined;
      if (!decision.valid) {
        action = 'auto_reject';
        reason = decision.rejectionReason ?? 'failed_integrity_policy';
      } else if (canonical.has(decision.fingerprint)) {
        action = 'merge_into';
        destinationProposalId = canonical.get(decision.fingerprint);
        reason = 'duplicate_normalized_belief';
      } else {
        canonical.set(decision.fingerprint, row.id);
        if (decision.proposalKind === 'correction' || decision.proposalKind === 'retraction') {
          action = 'correction';
          reason = 'must_supersede_a_specific_existing_claim';
        } else if (decision.riskLevel === 'LOW' && decision.confidence >= 0.85) {
          action = 'keep';
          reason = 'valid_atomic_low_impact_belief';
        } else {
          action = 'requires_review';
          reason = decision.riskReason;
        }
      }
      summary[action]++;
      return { proposalId: row.id, action, reason, ...(destinationProposalId ? { destinationProposalId } : {}) };
    });
    return { dryRun: true, summary, items };
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
    userId: string,
    searchAcrossUser = false
  ): Promise<string[]> {
    try {
      // Self-corrections may arrive attached to an extracted object entity
      // (for example Amazon) rather than the user's identity entity. Search the
      // user's active beliefs in that case, then retain only lexical matches.
      let query = supabaseAdmin
        .from('omega_claims')
        .select('id, text')
        .eq('user_id', userId)
        .eq('is_active', true);
      if (!searchAcrossUser) query = query.eq('entity_id', entityId);
      const { data: similarClaims } = await query;

      const normalized = String(claim.text ?? '').toLowerCase();
      const negatedObject = normalized.match(/\bnot\s+(?:a|an|the)?\s*([a-z][a-z0-9_-]{2,})/)?.[1];
      const tokens = new Set(normalized.match(/[a-z0-9]{3,}/g) ?? []);
      return (similarClaims ?? [])
        .filter(existing => {
          const existingText = String(existing.text ?? '').toLowerCase();
          if (negatedObject && existingText.includes(negatedObject)) return true;
          const existingTokens = existingText.match(/[a-z0-9]{3,}/g) ?? [];
          return existingTokens.filter(token => tokens.has(token)).length >= 2;
        })
        .map(existing => existing.id);
    } catch (error) {
      logger.error({ err: error, entityId }, 'Failed to find affected claims');
      return [];
    }
  }

  private async findPendingByFingerprint(userId: string, fingerprint: string): Promise<MemoryProposal | null> {
    try {
      const { data } = await supabaseAdmin
        .from('memory_proposals')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'PENDING')
        .eq('metadata->>proposal_fingerprint', fingerprint)
        .limit(1)
        .maybeSingle();
      return (data as MemoryProposal | null) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Helper: Generate reasoning for proposal
   */
  private async generateReasoning(claim: any, entity: any, sourceText: string): Promise<string> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-5.4-mini',
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
        model: config.defaultModel || 'gpt-5.4-mini',
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
