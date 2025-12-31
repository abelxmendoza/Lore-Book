import { supabaseAdmin } from '../supabaseClient';
import { logger } from '../../logger';
import { randomUUID } from 'crypto';

export type ClaimType = 'role' | 'skill' | 'experience' | 'achievement' | 'education' | 'certification' | 'project';
export type ClaimSource = 'resume' | 'chat' | 'linkedin' | 'manual' | 'work_summary' | 'journal_entry';
export type VerifiedStatus = 'unverified' | 'supported' | 'verified' | 'contradicted' | 'downgraded';

export interface ProfileClaim {
  id: string;
  user_id: string;
  claim_type: ClaimType;
  claim_text: string;
  source: ClaimSource;
  source_id: string | null;
  source_detail: string | null;
  verified_status: VerifiedStatus;
  confidence: number;
  evidence: Record<string, unknown>;
  user_confirmed: boolean;
  user_confirmed_at: string | null;
  user_notes: string | null;
  metadata: Record<string, unknown>;
  first_seen_at: string;
  last_updated_at: string;
}

export interface CreateClaimInput {
  claim_type: ClaimType;
  claim_text: string;
  source: ClaimSource;
  source_id?: string | null;
  source_detail?: string | null;
  confidence?: number;
  evidence?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpdateClaimInput {
  verified_status?: VerifiedStatus;
  confidence?: number;
  evidence?: Record<string, unknown>;
  user_confirmed?: boolean;
  user_notes?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ClaimEvidence {
  id: string;
  claim_id: string;
  user_id: string;
  evidence_type: 'journal_entry' | 'work_summary' | 'skill_progress' | 'external_verification' | 'time_pattern';
  evidence_id: string | null;
  evidence_text: string | null;
  strength: number;
  relevance: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Profile Claims Service
 * Manages user identity claims from resumes, chat, and other sources
 * Claims are probabilistic, not facts - verified over time
 */
class ProfileClaimsService {
  /**
   * Create a new profile claim
   */
  async createClaim(userId: string, input: CreateClaimInput): Promise<ProfileClaim> {
    try {
      // Check for duplicate (exact match)
      const { data: existing } = await supabaseAdmin
        .from('profile_claims')
        .select('id')
        .eq('user_id', userId)
        .eq('claim_type', input.claim_type)
        .eq('claim_text', input.claim_text)
        .eq('source', input.source)
        .single();

      if (existing) {
        // Update existing claim instead of creating duplicate
        logger.info({ userId, claimId: existing.id }, 'Claim already exists, updating');
        return this.updateClaim(userId, existing.id, {
          confidence: input.confidence,
          evidence: input.evidence,
          metadata: input.metadata
        });
      }

      const claim: ProfileClaim = {
        id: randomUUID(),
        user_id: userId,
        claim_type: input.claim_type,
        claim_text: input.claim_text,
        source: input.source,
        source_id: input.source_id ?? null,
        source_detail: input.source_detail ?? null,
        verified_status: 'unverified',
        confidence: input.confidence ?? 0.6,
        evidence: input.evidence ?? {},
        user_confirmed: false,
        user_confirmed_at: null,
        user_notes: null,
        metadata: input.metadata ?? {},
        first_seen_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString()
      };

      const { error } = await supabaseAdmin
        .from('profile_claims')
        .insert(claim);

      if (error) {
        logger.error({ error, userId }, 'Failed to create profile claim');
        throw error;
      }

      logger.info({ userId, claimId: claim.id, claimType: input.claim_type }, 'Profile claim created');
      return claim;
    } catch (error) {
      logger.error({ error, userId }, 'Error creating profile claim');
      throw error;
    }
  }

  /**
   * Get all claims for a user
   */
  async getClaims(
    userId: string,
    filters?: {
      claim_type?: ClaimType;
      source?: ClaimSource;
      verified_status?: VerifiedStatus;
      min_confidence?: number;
    }
  ): Promise<ProfileClaim[]> {
    try {
      let query = supabaseAdmin
        .from('profile_claims')
        .select('*')
        .eq('user_id', userId)
        .order('last_updated_at', { ascending: false });

      if (filters?.claim_type) {
        query = query.eq('claim_type', filters.claim_type);
      }
      if (filters?.source) {
        query = query.eq('source', filters.source);
      }
      if (filters?.verified_status) {
        query = query.eq('verified_status', filters.verified_status);
      }
      if (filters?.min_confidence !== undefined) {
        query = query.gte('confidence', filters.min_confidence);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error, userId }, 'Failed to get profile claims');
        throw error;
      }

      return (data ?? []) as ProfileClaim[];
    } catch (error) {
      logger.error({ error, userId }, 'Error getting profile claims');
      throw error;
    }
  }

  /**
   * Get a single claim by ID
   */
  async getClaim(userId: string, claimId: string): Promise<ProfileClaim | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('profile_claims')
        .select('*')
        .eq('user_id', userId)
        .eq('id', claimId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Not found
        }
        logger.error({ error, userId, claimId }, 'Failed to get profile claim');
        throw error;
      }

      return data as ProfileClaim;
    } catch (error) {
      logger.error({ error, userId, claimId }, 'Error getting profile claim');
      throw error;
    }
  }

  /**
   * Update a claim
   */
  async updateClaim(userId: string, claimId: string, input: UpdateClaimInput): Promise<ProfileClaim> {
    try {
      const updateData: Partial<ProfileClaim> = {
        last_updated_at: new Date().toISOString()
      };

      if (input.verified_status !== undefined) {
        updateData.verified_status = input.verified_status;
      }
      if (input.confidence !== undefined) {
        updateData.confidence = input.confidence;
      }
      if (input.evidence !== undefined) {
        updateData.evidence = input.evidence;
      }
      if (input.user_confirmed !== undefined) {
        updateData.user_confirmed = input.user_confirmed;
        if (input.user_confirmed) {
          updateData.user_confirmed_at = new Date().toISOString();
        }
      }
      if (input.user_notes !== undefined) {
        updateData.user_notes = input.user_notes;
      }
      if (input.metadata !== undefined) {
        updateData.metadata = input.metadata;
      }

      const { data, error } = await supabaseAdmin
        .from('profile_claims')
        .update(updateData)
        .eq('user_id', userId)
        .eq('id', claimId)
        .select()
        .single();

      if (error) {
        logger.error({ error, userId, claimId }, 'Failed to update profile claim');
        throw error;
      }

      logger.info({ userId, claimId }, 'Profile claim updated');
      return data as ProfileClaim;
    } catch (error) {
      logger.error({ error, userId, claimId }, 'Error updating profile claim');
      throw error;
    }
  }

  /**
   * Confirm a claim (user verification)
   */
  async confirmClaim(userId: string, claimId: string, notes?: string): Promise<ProfileClaim> {
    return this.updateClaim(userId, claimId, {
      user_confirmed: true,
      user_notes: notes ?? null,
      verified_status: 'verified',
      confidence: 0.95 // High confidence after user confirmation
    });
  }

  /**
   * Add evidence to a claim
   */
  async addEvidence(
    userId: string,
    claimId: string,
    evidence: {
      evidence_type: ClaimEvidence['evidence_type'];
      evidence_id?: string | null;
      evidence_text?: string | null;
      strength?: number;
      relevance?: number;
      metadata?: Record<string, unknown>;
    }
  ): Promise<ClaimEvidence> {
    try {
      const evidenceRecord: ClaimEvidence = {
        id: randomUUID(),
        claim_id: claimId,
        user_id: userId,
        evidence_type: evidence.evidence_type,
        evidence_id: evidence.evidence_id ?? null,
        evidence_text: evidence.evidence_text ?? null,
        strength: evidence.strength ?? 0.5,
        relevance: evidence.relevance ?? 0.5,
        metadata: evidence.metadata ?? {},
        created_at: new Date().toISOString()
      };

      const { error } = await supabaseAdmin
        .from('profile_claim_evidence')
        .insert(evidenceRecord);

      if (error) {
        logger.error({ error, userId, claimId }, 'Failed to add claim evidence');
        throw error;
      }

      // Update claim's evidence JSONB field
      const claim = await this.getClaim(userId, claimId);
      if (claim) {
        const evidenceList = (claim.evidence.internal as string[]) ?? [];
        if (evidence.evidence_id && !evidenceList.includes(evidence.evidence_id)) {
          evidenceList.push(evidence.evidence_id);
          await this.updateClaim(userId, claimId, {
            evidence: {
              ...claim.evidence,
              internal: evidenceList
            }
          });
        }
      }

      logger.info({ userId, claimId, evidenceId: evidenceRecord.id }, 'Claim evidence added');
      return evidenceRecord;
    } catch (error) {
      logger.error({ error, userId, claimId }, 'Error adding claim evidence');
      throw error;
    }
  }

  /**
   * Get evidence for a claim
   */
  async getClaimEvidence(userId: string, claimId: string): Promise<ClaimEvidence[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('profile_claim_evidence')
        .select('*')
        .eq('user_id', userId)
        .eq('claim_id', claimId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error({ error, userId, claimId }, 'Failed to get claim evidence');
        throw error;
      }

      return (data ?? []) as ClaimEvidence[];
    } catch (error) {
      logger.error({ error, userId, claimId }, 'Error getting claim evidence');
      throw error;
    }
  }

  /**
   * Delete a claim
   */
  async deleteClaim(userId: string, claimId: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('profile_claims')
        .delete()
        .eq('user_id', userId)
        .eq('id', claimId);

      if (error) {
        logger.error({ error, userId, claimId }, 'Failed to delete profile claim');
        throw error;
      }

      logger.info({ userId, claimId }, 'Profile claim deleted');
    } catch (error) {
      logger.error({ error, userId, claimId }, 'Error deleting profile claim');
      throw error;
    }
  }

  /**
   * Batch create claims (for resume parsing)
   */
  async batchCreateClaims(userId: string, claims: CreateClaimInput[]): Promise<ProfileClaim[]> {
    const results: ProfileClaim[] = [];
    
    for (const claimInput of claims) {
      try {
        const claim = await this.createClaim(userId, claimInput);
        results.push(claim);
      } catch (error) {
        logger.warn({ error, userId, claimInput }, 'Failed to create claim in batch, continuing');
      }
    }

    logger.info({ userId, total: claims.length, created: results.length }, 'Batch claims processed');
    return results;
  }
}

export const profileClaimsService = new ProfileClaimsService();
