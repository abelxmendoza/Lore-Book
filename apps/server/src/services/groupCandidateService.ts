// =====================================================
// GROUP CANDIDATE SERVICE
// Purpose: Queue detected group signals for user review.
//
// Pattern: evidence accumulates, user decides.
// Nothing is auto-created. Only accepted candidates become orgs.
// =====================================================

import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';
import { groupDetectionService } from './groupDetectionService';
import { organizationService } from './organizationService';
import type { GroupType, MembershipModel, UserRelationship } from './organizationService';

// ── Public types ─────────────────────────────────────────────────────────────

export interface GroupCandidate {
  id: string;
  user_id: string;
  proposed_name?: string;
  detected_members: string[];
  suggested_group_type: GroupType;
  suggested_user_relationship: UserRelationship;
  suggested_membership_model: MembershipModel;
  is_public_entity: boolean;
  confidence: number;
  occurrence_count: number;
  source_message_ids: string[];
  context?: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_organization_id?: string;
  created_at: string;
  updated_at: string;
}

export interface AcceptCandidateOptions {
  name?: string;
  group_type?: GroupType;
  user_relationship?: UserRelationship;
  membership_model?: MembershipModel;
  description?: string;
  members?: string[];
}

// ── Service ──────────────────────────────────────────────────────────────────

export class GroupCandidateService {
  // Minimum occurrences before a candidate surfaces for review
  private static readonly SURFACE_THRESHOLD = 2;

  /**
   * Called from the ingestion pipeline (non-blocking, fire-and-forget safe).
   * Detects group signals in a message and upserts candidates.
   */
  async processChatMessage(
    userId: string,
    rawText: string,
    messageId: string
  ): Promise<void> {
    try {
      const detected = await groupDetectionService.detectGroupsInMessage(
        userId,
        rawText
      );

      for (const group of detected) {
        // Skip low-confidence noise
        if (group.confidence < 0.60) continue;

        // Skip if group already exists as an organization
        if (group.name) {
          const existing = await this.findMatchingOrganization(userId, group.name, group.members);
          if (existing) continue;
        }

        await this.upsertCandidate(userId, group, messageId);
      }
    } catch (error) {
      logger.error({ error, userId, messageId }, 'GroupCandidateService: failed to process message');
    }
  }

  /**
   * Upsert a candidate: reinforce if matching member cluster exists,
   * else create new candidate.
   */
  private async upsertCandidate(
    userId: string,
    group: Awaited<ReturnType<typeof groupDetectionService.detectGroupsInMessage>>[number],
    messageId: string
  ): Promise<void> {
    if (group.members.length < 2 && !group.name) return;

    const existing = await this.findMatchingCandidate(userId, group.members, group.name);

    if (existing) {
      // Reinforce existing candidate
      const newOccurrences = existing.occurrence_count + 1;
      const newConfidence = this.calculateConfidence(newOccurrences, group.confidence);
      const messageIds = [...new Set([...existing.source_message_ids, messageId])];

      await supabaseAdmin
        .from('group_candidates')
        .update({
          occurrence_count: newOccurrences,
          confidence: newConfidence,
          source_message_ids: messageIds,
          context: existing.context ?? group.context,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .eq('user_id', userId);

      logger.debug(
        { userId, candidateId: existing.id, occurrences: newOccurrences },
        'Reinforced group candidate'
      );
    } else {
      // New candidate
      const { error } = await supabaseAdmin
        .from('group_candidates')
        .insert({
          user_id: userId,
          proposed_name: group.name,
          detected_members: group.members,
          suggested_group_type: group.group_type,
          suggested_user_relationship: group.user_relationship,
          suggested_membership_model: group.membership_model,
          is_public_entity: group.is_public_entity,
          confidence: group.confidence,
          occurrence_count: 1,
          source_message_ids: [messageId],
          context: group.context,
          status: 'pending',
        });

      if (error) throw error;

      logger.debug(
        { userId, name: group.name, members: group.members, type: group.group_type },
        'Created new group candidate'
      );
    }
  }

  /**
   * Logistic confidence curve: grows with occurrences, decays toward 1.0 asymptote.
   * 1 → 0.65, 2 → 0.78, 3 → 0.88, 4+ → ≥ 0.93
   */
  private calculateConfidence(occurrences: number, baseConfidence: number): number {
    const curve = 1 - Math.exp(-0.5 * occurrences);
    return Math.min(0.97, baseConfidence * 0.3 + curve * 0.7);
  }

  /**
   * Find an existing pending candidate that matches by member overlap or name.
   */
  private async findMatchingCandidate(
    userId: string,
    members: string[],
    name?: string
  ): Promise<GroupCandidate | null> {
    try {
      let query = supabaseAdmin
        .from('group_candidates')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'pending');

      if (name) {
        query = query.ilike('proposed_name', `%${name}%`);
      }

      const { data } = await query.order('created_at', { ascending: false }).limit(50);

      if (!data || data.length === 0) return null;

      // Check member overlap if no name match
      for (const candidate of data) {
        const overlap = members.filter(m =>
          candidate.detected_members.some(
            (cm: string) => cm.toLowerCase() === m.toLowerCase()
          )
        );
        if (overlap.length >= 2 || (name && candidate.proposed_name?.toLowerCase() === name.toLowerCase())) {
          return candidate as GroupCandidate;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Check if this group already exists as an organization.
   * Skip detection for groups we already track.
   */
  private async findMatchingOrganization(
    userId: string,
    name: string,
    members: string[]
  ): Promise<boolean> {
    try {
      const { data } = await supabaseAdmin
        .from('organizations')
        .select('id')
        .eq('user_id', userId)
        .ilike('name', `%${name}%`)
        .limit(1);

      if (data && data.length > 0) return true;

      // Also check by member overlap
      const { data: orgs } = await supabaseAdmin
        .from('organizations')
        .select('id')
        .eq('user_id', userId)
        .limit(20);

      if (!orgs || orgs.length === 0) return false;

      for (const org of orgs) {
        const memberRows = await organizationService.getMembers(org.id);
        const orgNames = memberRows.map(m => m.character_name.toLowerCase());
        const overlap = members.filter(m => orgNames.includes(m.toLowerCase()));
        if (overlap.length >= Math.ceil(members.length * 0.7)) return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Get candidates for review. Only returns those that have met
   * the surface threshold (occurrence_count >= 2).
   */
  async getCandidates(
    userId: string,
    status: 'pending' | 'accepted' | 'rejected' | 'all' = 'pending'
  ): Promise<GroupCandidate[]> {
    try {
      let query = supabaseAdmin
        .from('group_candidates')
        .select('*')
        .eq('user_id', userId)
        .gte('occurrence_count', GroupCandidateService.SURFACE_THRESHOLD)
        .order('confidence', { ascending: false });

      if (status !== 'all') {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as GroupCandidate[];
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get group candidates');
      return [];
    }
  }

  /**
   * Accept a candidate: create an organization and link it.
   * User can override any suggested field.
   */
  async acceptCandidate(
    userId: string,
    candidateId: string,
    overrides: AcceptCandidateOptions = {}
  ): Promise<{ organization_id: string }> {
    const { data: candidate, error: fetchErr } = await supabaseAdmin
      .from('group_candidates')
      .select('*')
      .eq('id', candidateId)
      .eq('user_id', userId)
      .single();

    if (fetchErr || !candidate) throw new Error('Candidate not found');

    const orgName = overrides.name ?? candidate.proposed_name ?? this.buildFallbackName(candidate.detected_members);
    const groupType = overrides.group_type ?? candidate.suggested_group_type;
    const userRelationship = overrides.user_relationship ?? candidate.suggested_user_relationship;
    const membershipModel = overrides.membership_model ?? candidate.suggested_membership_model;
    const members: string[] = overrides.members ?? candidate.detected_members ?? [];

    // Create the organization
    const org = await organizationService.createOrganization(userId, {
      name: orgName,
      group_type: groupType,
      type: 'other', // legacy field
      membership_model: membershipModel,
      user_relationship: userRelationship,
      is_public_entity: candidate.is_public_entity,
      description: overrides.description,
      status: 'active',
    });

    // Add detected members
    for (const memberName of members) {
      try {
        await organizationService.addMember(userId, org.id, {
          character_name: memberName,
          status: 'active',
        });
      } catch {
        // Non-fatal: member may already exist or be invalid
      }
    }

    // Mark candidate as accepted
    await supabaseAdmin
      .from('group_candidates')
      .update({
        status: 'accepted',
        created_organization_id: org.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', candidateId)
      .eq('user_id', userId);

    return { organization_id: org.id };
  }

  /**
   * Reject a candidate — won't surface again unless re-detected.
   */
  async rejectCandidate(userId: string, candidateId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('group_candidates')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', candidateId)
      .eq('user_id', userId);

    if (error) throw error;
  }

  /**
   * Count pending candidates awaiting review (that have met threshold).
   */
  async getPendingCount(userId: string): Promise<number> {
    try {
      const { count } = await supabaseAdmin
        .from('group_candidates')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'pending')
        .gte('occurrence_count', GroupCandidateService.SURFACE_THRESHOLD);

      return count ?? 0;
    } catch {
      return 0;
    }
  }

  private buildFallbackName(members: string[]): string {
    if (members.length === 0) return `New Group`;
    if (members.length === 1) return `${members[0]}'s Group`;
    const first = members.slice(0, 2).map(m => m.split(' ')[0]);
    return `${first.join(' & ')} Crew`;
  }
}

export const groupCandidateService = new GroupCandidateService();
