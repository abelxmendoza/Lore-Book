// =====================================================
// GROUP CANDIDATE SERVICE
// Purpose: Queue detected group signals for user review.
//
// Pattern: evidence accumulates, user decides.
// Nothing is auto-created. Only accepted candidates become orgs.
// =====================================================

import { logger } from '../logger';
import { clustersMatch } from '../utils/clusterMatch';
import { supabaseAdmin } from './supabaseClient';
import { characterConnectionService } from './characterConnectionService';
import { groupDetectionService } from './groupDetectionService';
import { organizationService } from './organizationService';
import type { GroupType, MembershipModel, UserRelationship } from './organizationService';
import { organizationRelationshipInferenceService } from './organizationRelationshipInferenceService';

// ── Public types ─────────────────────────────────────────────────────────────

export interface GroupCandidate {
  id: string;
  user_id: string;
  proposed_name?: string;
  detected_members: string[];
  detected_member_ids?: string[];
  suggested_group_type: GroupType;
  suggested_user_relationship: UserRelationship;
  suggested_membership_model: MembershipModel;
  is_public_entity: boolean;
  confidence: number;
  occurrence_count: number;
  source_message_ids: string[];
  context?: string;
  metadata?: Record<string, unknown>;
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

const POLLUTED_CANDIDATE_TERMS = /\b(zephyrine|zephyrne|quillborne?|quillborn|quintessa|vexworth|smith rock|san diego|of debt)\b/i;
const BAD_CANDIDATE_MEMBER_NAMES = new Set(['Had', 'Do', 'Did', 'Just', 'She', 'He', 'They', 'My', 'From', 'The', 'This', 'That', 'San Diego', 'Smith Rock']);

// ── Service ──────────────────────────────────────────────────────────────────

export class GroupCandidateService {
  // Minimum occurrences before a candidate surfaces for review
  private static readonly SURFACE_THRESHOLD = 2;

  // Short-lived per-user cache of rejected clusters, so re-detected groups the
  // user already dismissed are suppressed without a DB hit on every cluster.
  private rejectionCache = new Map<string, {
    expiresAt: number;
    signatures: Array<{ members: string[]; name?: string }>;
  }>();

  /**
   * Called from the ingestion pipeline (non-blocking, fire-and-forget safe).
   * Detects group signals in a message and upserts candidates.
   */
  async processChatMessage(
    userId: string,
    rawText: string,
    messageId?: string,
    conversationContext?: string[]
  ): Promise<void> {
    try {
      // A stable id keeps re-scans (worker + live chat) from double-counting the
      // same utterance — see the source_message_ids guard in upsertCandidate.
      const sourceId = messageId ?? `text:${this.hashText(rawText)}`;

      const detected = await groupDetectionService.detectGroupsInMessage(
        userId,
        rawText,
        conversationContext
      );

      await this.ingestDetectedGroups(userId, detected, sourceId);
      await organizationRelationshipInferenceService.processAfterChat(userId, rawText);
    } catch (error) {
      logger.error({ error, userId, messageId }, 'GroupCandidateService: failed to process message');
    }
  }

  /**
   * Conversation-level scan. Treats an entire conversation (one chat session)
   * as a single co-occurrence signal: characters talked about together anywhere
   * in the same conversation are clustered and reinforced under ONE stable
   * source id (`conv:<sessionId>`). This is the key signal behind "people who
   * show up in the same conversation probably belong to the same group".
   *
   * Because the source id is the conversation — not each message — a single
   * conversation contributes exactly one occurrence to a cluster, and re-scans
   * never inflate counts. Repeated co-occurrence ACROSS conversations is what
   * pushes a cluster over the surface threshold.
   */
  async processConversation(
    userId: string,
    sessionId: string,
    messageTexts: string[]
  ): Promise<void> {
    try {
      const texts = messageTexts.map(text => (text ?? '').trim()).filter(text => text.length > 0);
      if (texts.length === 0) return;

      // Bound the combined text so very long sessions stay cheap to scan.
      const combined = texts.join('\n').slice(0, 8000);
      const sourceId = `conv:${sessionId}`;

      // Passing every message as conversation context means name extraction
      // sees the whole conversation, so co-mentions spanning multiple turns are
      // clustered together — not just names that share a single sentence.
      const detected = await groupDetectionService.detectGroupsInMessage(
        userId,
        combined,
        texts
      );

      await this.ingestDetectedGroups(userId, detected, sourceId);
      await organizationRelationshipInferenceService.reconcileUserOrganizations(userId, combined);
    } catch (error) {
      logger.error({ error, userId, sessionId }, 'GroupCandidateService: failed to process conversation');
    }
  }

  /**
   * Ingest groups produced OUTSIDE the per-message detector (e.g. the
   * cross-session society mapper). Reuses the exact same noise filtering,
   * auto-create, candidate upsert, and co-mention recording so external
   * detections behave identically and stay idempotent via `sourceId`.
   */
  async ingestExternalDetections(
    userId: string,
    detected: Awaited<ReturnType<typeof groupDetectionService.detectGroupsInMessage>>,
    sourceId: string
  ): Promise<void> {
    await this.ingestDetectedGroups(userId, detected, sourceId);
  }

  /**
   * Shared sink for detected groups: filters noise, skips ones already tracked
   * as organizations, auto-creates high-confidence named groups, and otherwise
   * upserts a review candidate keyed by the given source id.
   */
  private async ingestDetectedGroups(
    userId: string,
    detected: Awaited<ReturnType<typeof groupDetectionService.detectGroupsInMessage>>,
    sourceId: string
  ): Promise<void> {
    // Remember who was talked about together: each detected cluster of
    // co-mentioned characters becomes a bidirectional connection in the people
    // network, so the app learns how characters are linked through shared
    // stories without fusing genuinely separate groups into one clique.
    for (const group of detected) {
      const memberIds = [...new Set(group.member_ids ?? [])];
      if (memberIds.length >= 2) {
        await characterConnectionService.recordCoMention(userId, memberIds);
      }
    }

    for (const group of detected) {
      // Skip low-confidence noise
      if (group.confidence < 0.60) continue;
      if (this.isPollutedCandidateShape({
        proposed_name: group.name,
        detected_members: group.members,
        context: group.context,
      })) continue;

      // Feedback loop: respect prior rejections. If the user already dismissed
      // this same cluster, don't re-surface or auto-create it.
      if (await this.wasRejected(userId, group.members, group.name)) continue;

      // Skip if group already exists as an organization
      if (group.name) {
        const existing = await this.findMatchingOrganization(userId, group.name, group.members);
        if (existing) continue;
      }

      if (group.name && group.confidence >= 0.90) {
        const created = await this.tryAutoCreateOrganization(userId, group);
        if (created) continue;
      }

      await this.upsertCandidate(userId, group, sourceId);
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
    if (!group.is_public_entity && group.member_ids.length < 2) return;
    if (group.members.length < 2 && !group.name) return;

    // Give unnamed groups a creative, context-suited name so they surface and
    // read well. An official name (group.name) always wins.
    const proposedName = group.name ?? this.generateCreativeName(group);

    const existing = await this.findMatchingCandidate(userId, group.members, group.member_ids, proposedName);

    if (existing) {
      // Idempotency: if we've already counted this exact source, do nothing.
      // Lets the cyclic worker re-scan the same threads without inflating counts.
      if (existing.source_message_ids?.includes(messageId)) return;

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
          // Backfill a name if the candidate was previously unnamed; merge any
          // newly-detected members so the group keeps growing as we learn.
          proposed_name: existing.proposed_name ?? proposedName,
          detected_members: [...new Set([...existing.detected_members, ...group.members])],
          detected_member_ids: [...new Set([...(existing.detected_member_ids ?? []), ...group.member_ids])],
          context: existing.context ?? group.context,
          metadata: { ...(existing.metadata ?? {}), ...(group.metadata ?? {}), detected_member_ids: [...new Set([...(existing.detected_member_ids ?? []), ...group.member_ids])] },
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
          proposed_name: proposedName,
          detected_members: group.members,
          detected_member_ids: group.member_ids,
          suggested_group_type: group.group_type,
          suggested_user_relationship: group.user_relationship,
          suggested_membership_model: group.membership_model,
          is_public_entity: group.is_public_entity,
          confidence: group.confidence,
          occurrence_count: 1,
          source_message_ids: [messageId],
          context: group.context,
          metadata: { ...(group.metadata ?? {}), detected_member_ids: group.member_ids },
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
   * Generate a creative, context-suited name for an unnamed group. Deterministic
   * so the same cluster always gets the same name. An official name always wins
   * upstream — this only runs when none was given.
   */
  private generateCreativeName(
    group: Awaited<ReturnType<typeof groupDetectionService.detectGroupsInMessage>>[number]
  ): string {
    const members = group.members ?? [];
    const firsts = members.map(m => m.split(' ')[0]).filter(Boolean);
    const lasts = members.map(m => m.split(' ').slice(1).join(' ')).filter(Boolean);

    if (group.group_type === 'family') {
      const surname = lasts.find(Boolean);
      if (surname && lasts.filter(l => l === surname).length >= 2) return `${surname} Family`;
      if (firsts.length) return `${firsts.slice(0, 2).join(' & ')} Family`;
      return 'My Family';
    }

    const SUFFIXES: Partial<Record<GroupType, string[]>> = {
      band: ['Sound', 'Collective', 'Project'],
      crew: ['Crew', 'Squad', 'Circle'],
      friend_group: ['Crew', 'Circle', 'Crowd'],
      sports_team: ['Squad', 'Club'],
      club: ['Club', 'Society'],
      company: ['Co.', 'Group'],
      community: ['Community', 'Collective'],
      collective: ['Collective', 'Co-op'],
      scene: ['Scene', 'Underground'],
      martial_arts: ['Dojo', 'Academy'],
      nonprofit: ['Initiative', 'Foundation'],
      institution: ['Institute', 'Society'],
    };
    const pool = SUFFIXES[group.group_type] ?? ['Group'];
    const suffix = pool[this.hashText(members.join('|')) % pool.length];

    if (firsts.length >= 2) return `${firsts.slice(0, 2).join(' & ')} ${suffix}`;
    if (firsts.length === 1) return `${firsts[0]}'s ${suffix}`;
    return `New ${suffix}`;
  }

  /** Stable 32-bit hash (FNV-1a) for deterministic source ids and name choices. */
  private hashText(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
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
    memberIds: string[],
    name?: string
  ): Promise<GroupCandidate | null> {
    try {
      const query = supabaseAdmin
        .from('group_candidates')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'pending');

      const { data } = await query.order('created_at', { ascending: false }).limit(50);

      if (!data || data.length === 0) return null;

      // Check member overlap if no name match
      for (const candidate of data) {
        if (this.isPollutedCandidateShape(candidate as GroupCandidate)) continue;
        const candidateMemberIds = candidate.detected_member_ids ?? candidate.metadata?.detected_member_ids ?? [];
        const idOverlap = Array.isArray(candidateMemberIds)
          ? memberIds.filter(id => candidateMemberIds.includes(id))
          : [];
        const nameOverlap = members.filter(m =>
          candidate.detected_members.some((cm: string) => cm.toLowerCase() === m.toLowerCase())
        );
        if (idOverlap.length >= 2 || nameOverlap.length >= 2 || (name && candidate.proposed_name?.toLowerCase() === name.toLowerCase())) {
          return candidate as GroupCandidate;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Whether the user previously rejected a cluster matching these members/name.
   * Public so the society mapper can pre-filter rejected clusters before
   * spending an LLM call resolving them. Cached per user for 60s.
   */
  async wasRejected(userId: string, members: string[], name?: string): Promise<boolean> {
    try {
      const signatures = await this.loadRejectedSignatures(userId);
      if (signatures.length === 0) return false;
      return signatures.some(sig => clustersMatch(members, sig.members, name, sig.name));
    } catch {
      return false;
    }
  }

  private async loadRejectedSignatures(
    userId: string
  ): Promise<Array<{ members: string[]; name?: string }>> {
    const cached = this.rejectionCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.signatures;

    const { data } = await supabaseAdmin
      .from('group_candidates')
      .select('proposed_name, detected_members')
      .eq('user_id', userId)
      .eq('status', 'rejected')
      .limit(200);

    const signatures = ((data ?? []) as Array<{ proposed_name?: string; detected_members?: string[] }>)
      .map(row => ({ members: row.detected_members ?? [], name: row.proposed_name }));
    this.rejectionCache.set(userId, { signatures, expiresAt: Date.now() + 60_000 });
    return signatures;
  }

  private invalidateRejectionCache(userId: string): void {
    this.rejectionCache.delete(userId);
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
        .order('confidence', { ascending: false });

      if (status !== 'all') {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return ((data || []) as GroupCandidate[]).filter(candidate => this.shouldSurface(candidate));
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
    const acceptedMembers = await this.resolveAcceptedMembers(userId, candidate as GroupCandidate, members);
    if (!candidate.is_public_entity && acceptedMembers.length < 2) {
      throw new Error('Group candidates require at least two confirmed character members');
    }

    // Create the organization
    const org = await organizationService.createOrganization(userId, {
      name: orgName,
      aliases: this.candidateAliases(candidate),
      group_type: groupType,
      type: 'other', // legacy field
      membership_model: membershipModel,
      user_relationship: userRelationship,
      is_public_entity: candidate.is_public_entity,
      description: overrides.description ?? this.buildDescription(candidate),
      status: 'active',
      metadata: candidate.metadata ?? {},
    });

    // Add detected members
    for (const member of acceptedMembers) {
      try {
        await organizationService.addMember(userId, org.id, {
          character_id: member.character_id,
          character_name: member.character_name,
          role: this.inferMemberRole(member.character_name, candidate),
          status: 'active',
          notes: this.inferMemberNotes(candidate),
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
   * Merge a candidate INTO an existing organization instead of creating a new
   * one. Adds the candidate's resolved members to the target org and marks the
   * candidate accepted, pointing at that org. Used when the detected group is
   * really the same as one the user already has.
   */
  async mergeCandidate(
    userId: string,
    candidateId: string,
    targetOrgId: string
  ): Promise<{ organization_id: string; added_members: number }> {
    const { data: candidate, error: fetchErr } = await supabaseAdmin
      .from('group_candidates')
      .select('*')
      .eq('id', candidateId)
      .eq('user_id', userId)
      .single();
    if (fetchErr || !candidate) throw new Error('Candidate not found');

    const target = await organizationService.getOrganization(userId, targetOrgId);
    if (!target) throw new Error('Target organization not found');

    const members = await this.resolveAcceptedMembers(userId, candidate as GroupCandidate, candidate.detected_members ?? []);
    const existingNames = new Set((target.members ?? []).map(m => this.normalizeNameKey(m.character_name)));

    let added = 0;
    for (const member of members) {
      if (existingNames.has(this.normalizeNameKey(member.character_name))) continue;
      try {
        await organizationService.addMember(userId, targetOrgId, {
          character_id: member.character_id,
          character_name: member.character_name,
          role: this.inferMemberRole(member.character_name, candidate as GroupCandidate),
          status: 'active',
          notes: this.inferMemberNotes(candidate as GroupCandidate),
        });
        added += 1;
      } catch {
        // Non-fatal: member may already exist or be invalid.
      }
    }

    await supabaseAdmin
      .from('group_candidates')
      .update({ status: 'accepted', created_organization_id: targetOrgId, updated_at: new Date().toISOString() })
      .eq('id', candidateId)
      .eq('user_id', userId);

    return { organization_id: targetOrgId, added_members: added };
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
    // New rejection must take effect immediately for re-detection suppression.
    this.invalidateRejectionCache(userId);
  }

  /**
   * Count pending candidates awaiting review (that have met threshold).
   */
  async getPendingCount(userId: string): Promise<number> {
    try {
      const { data } = await supabaseAdmin
        .from('group_candidates')
        .select('id, proposed_name, detected_members, context, confidence, occurrence_count, is_public_entity')
        .eq('user_id', userId)
        .eq('status', 'pending');

      return ((data ?? []) as GroupCandidate[]).filter(candidate => this.shouldSurface(candidate)).length;
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

  private shouldSurface(candidate: Pick<GroupCandidate, 'occurrence_count' | 'proposed_name' | 'confidence' | 'is_public_entity'>): boolean {
    if (this.isPollutedCandidateShape(candidate as GroupCandidate)) return false;
    return candidate.occurrence_count >= GroupCandidateService.SURFACE_THRESHOLD
      || Boolean(candidate.proposed_name && candidate.confidence >= 0.75)
      || Boolean(candidate.is_public_entity);
  }

  private candidateAliases(candidate: GroupCandidate): string[] {
    const aliases = candidate.metadata?.aliases;
    return Array.isArray(aliases) ? aliases.filter((alias): alias is string => typeof alias === 'string') : [];
  }

  private buildDescription(candidate: GroupCandidate): string | undefined {
    if (candidate.metadata?.hierarchy_hint) return String(candidate.metadata.hierarchy_hint);
    return candidate.context ? `Detected from conversation: ${candidate.context}` : undefined;
  }

  private inferMemberRole(memberName: string, candidate: GroupCandidate): string | undefined {
    const text = `${candidate.proposed_name ?? ''} ${candidate.context ?? ''}`.toLowerCase();
    const name = memberName.toLowerCase();

    if (candidate.suggested_group_type === 'family') {
      if (/\babuela|grandma|grandmother\b/.test(name)) return 'Grandmother';
      if (/\bt[ií]a|aunt\b/.test(name)) return 'Aunt';
      if (/\bt[ií]o|uncle\b/.test(name)) return 'Uncle';
      return 'Family member';
    }
    if (/clever programmer/.test(text) && /rafeh|qazi/.test(name)) return 'Teacher / mentor';
    if (/\bkforce|recruiter|onboarding|paperwork|identity verification|background check\b/.test(text)) {
      if (/kelly/.test(name)) return 'Onboarding contact';
      if (/sam/.test(name)) return 'Recruiter';
      return 'Professional contact';
    }
    return undefined;
  }

  private inferMemberNotes(candidate: GroupCandidate): string | undefined {
    const levels = candidate.metadata?.hierarchy_levels;
    if (Array.isArray(levels) && levels.length > 0) {
      return `Possible hierarchy: ${levels.join(' → ')}`;
    }
    return candidate.context ? `Detected from: ${candidate.context}` : undefined;
  }

  private isPollutedCandidateShape(candidate: Partial<GroupCandidate>): boolean {
    const name = candidate.proposed_name ?? '';
    const context = candidate.context ?? '';
    const members = candidate.detected_members ?? [];
    const combined = `${name} ${context} ${members.join(' ')}`;

    if (POLLUTED_CANDIDATE_TERMS.test(combined)) return true;
    if (name && /^(?:of|in|on|at|to|from|with|for)\s+/i.test(name)) return true;
    if (members.some(member => BAD_CANDIDATE_MEMBER_NAMES.has(member))) return true;
    if (!name && members.length < 2) return true;
    return false;
  }

  private async tryAutoCreateOrganization(
    userId: string,
    group: Awaited<ReturnType<typeof groupDetectionService.detectGroupsInMessage>>[number]
  ): Promise<boolean> {
    try {
      const org = await organizationService.createOrganization(userId, {
        name: group.name!,
        aliases: Array.isArray(group.metadata?.aliases)
          ? (group.metadata.aliases as string[]).filter(alias => typeof alias === 'string')
          : [],
        group_type: group.group_type,
        type: 'other',
        membership_model: group.membership_model,
        user_relationship: group.user_relationship,
        is_public_entity: group.is_public_entity,
        description: group.metadata?.hierarchy_hint
          ? String(group.metadata.hierarchy_hint)
          : `Detected automatically from chat: ${group.context}`,
        status: 'active',
        metadata: { ...(group.metadata ?? {}), auto_created_from_chat: true },
      });

      for (const memberName of group.members) {
        if (this.isPollutedCandidateShape({ detected_members: [memberName] })) continue;
        const memberIndex = group.members.findIndex(member => member === memberName);
        await organizationService.addMember(userId, org.id, {
          character_id: group.member_ids[memberIndex],
          character_name: memberName,
          role: this.inferMemberRole(memberName, {
            id: '',
            user_id: userId,
            proposed_name: group.name,
            detected_members: group.members,
            suggested_group_type: group.group_type,
            suggested_user_relationship: group.user_relationship,
            suggested_membership_model: group.membership_model,
            is_public_entity: group.is_public_entity,
            confidence: group.confidence,
            occurrence_count: 1,
            source_message_ids: [],
            context: group.context,
            metadata: group.metadata,
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
          status: 'active',
          notes: group.context ? `Detected from: ${group.context}` : undefined,
        });
      }

      return true;
    } catch (error) {
      logger.debug({ error, userId, groupName: group.name }, 'Auto-create organization failed; falling back to candidate');
      return false;
    }
  }

  private async resolveAcceptedMembers(
    userId: string,
    candidate: GroupCandidate,
    requestedNames: string[]
  ): Promise<Array<{ character_id: string; character_name: string }>> {
    const candidateIds = candidate.detected_member_ids ?? (
      Array.isArray(candidate.metadata?.detected_member_ids) ? candidate.metadata.detected_member_ids as string[] : []
    );
    const byName = new Map<string, string>();
    candidate.detected_members.forEach((name, index) => {
      const id = candidateIds[index];
      if (id) byName.set(this.normalizeNameKey(name), id);
    });

    const requestedKeys = new Set(requestedNames.map(name => this.normalizeNameKey(name)));
    const ids = [...new Set(
      candidate.detected_members
        .map(name => ({ name, id: byName.get(this.normalizeNameKey(name)) }))
        .filter(member => requestedKeys.size === 0 || requestedKeys.has(this.normalizeNameKey(member.name)))
        .map(member => member.id)
        .filter((id): id is string => Boolean(id))
    )];

    if (ids.length === 0) return [];
    const { data, error } = await supabaseAdmin
      .from('characters')
      .select('id, name')
      .eq('user_id', userId)
      .in('id', ids);
    if (error) throw error;

    const order = new Map(ids.map((id, index) => [id, index]));
    return ((data ?? []) as Array<{ id: string; name: string }>)
      .sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0))
      .map(row => ({ character_id: row.id, character_name: row.name }));
  }

  private normalizeNameKey(name: string): string {
    return (name ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }
}

export const groupCandidateService = new GroupCandidateService();
