// =====================================================
// ORGANIZATION SERVICE
// Purpose: Manage organizations with members, stories, events, locations
// =====================================================

import { logger } from '../logger';

import {
  ORG_COLS,
  ORG_MEMBER_COLS,
  ORG_STORY_COLS,
  ORG_EVENT_COLS,
  ORG_LOCATION_COLS,
} from '../db/organizationColumns';
import { normalizeNameKey, namesOverlapByContainment } from '../utils/nameNormalization';
import { groupAnalyticsService, type GroupAnalytics } from './groupAnalyticsService';
import { supabaseAdmin } from './supabaseClient';

// ── Canonical group type enum ─────────────────────────────────────────
export type GroupType =
  | 'friend_group'
  | 'band'
  | 'sports_team'
  | 'company'
  | 'club'
  | 'nonprofit'
  | 'family'
  | 'household'
  | 'martial_arts'
  | 'scene'
  | 'community'
  | 'crew'
  | 'collective'
  | 'institution'
  | 'public_entity'
  | 'brand'
  | 'vendor'
  | 'team'
  | 'project'
  | 'event_group'
  | 'other';

// ── Membership model ──────────────────────────────────────────────────
// strict = defined roster | fuzzy = participatory | none = reference only
export type MembershipModel = 'strict' | 'fuzzy' | 'none';

// ── listOrganizations egress cache ────────────────────────────────────
// Production pg_stat_statements showed GET /api/organizations dominating
// Supabase egress: listOrganizations fans out to 5 tables (organizations +
// members + stories + events + locations) and was invoked ~2.2M times in 45
// days (a client refetch loop) on a DB with 6 orgs. A short per-user TTL
// collapses that storm to one DB read per window; the service's own mutations
// bust the user's entry so reads stay fresh immediately after a write.
const ORG_LIST_TTL_MS = 30_000;
type OrgListCacheEntry = { at: number; data: unknown[] };
const orgListCache = new Map<string, OrgListCacheEntry>();
/** Collapse concurrent cache misses for the same user into one DB fan-out. */
const orgListInflight = new Map<string, Promise<Organization[]>>();

// ── User relationship to this group ──────────────────────────────────
export type UserRelationship =
  | 'founder'
  | 'leader'
  | 'member'
  | 'former_member'
  | 'collaborator'
  | 'adjacent'
  | 'fan'
  | 'aware_of'
  | 'referenced'
  | 'alumnus';

// ── Backward-compat alias (legacy type column) ────────────────────────
export type OrganizationType =
  | 'friend_group'
  | 'company'
  | 'sports_team'
  | 'club'
  | 'nonprofit'
  | 'affiliation'
  | 'family'
  | 'martial_arts'
  | 'other';

export type OrganizationStatus = 'active' | 'inactive' | 'dissolved';

// ── Relationship between two groups ──────────────────────────────────
export type OrgRelationshipType =
  | 'part_of'
  | 'affiliated_with'
  | 'rival_of'
  | 'spawned_from'
  | 'collaborated_with'
  | 'succeeded_by'
  | 'merged_with';

export interface OrganizationRelationship {
  id: string;
  user_id: string;
  from_org_id: string;
  to_org_id: string;
  relationship_type: OrgRelationshipType;
  notes?: string;
  created_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  character_id?: string;
  character_name: string;
  role?: string;
  joined_date?: string;
  left_at?: string;
  status: 'active' | 'former' | 'honorary';
  notes?: string;
}

export interface OrganizationStory {
  id: string;
  organization_id: string;
  memory_id?: string;
  title: string;
  summary: string;
  date: string;
  related_member_ids?: string[];
}

export interface OrganizationEvent {
  id: string;
  organization_id: string;
  event_id?: string;
  title: string;
  date: string;
  type: 'meeting' | 'game' | 'social' | 'work' | 'other';
}

export interface OrganizationLocation {
  id: string;
  organization_id: string;
  location_id?: string;
  location_name: string;
  visit_count: number;
  last_visited?: string;
}

// ── Conversation-derived context ──────────────────────────────────────
// Events & locations inferred from a group's MEMBERS appearing in the
// user's chat threads / journal entries (character_timeline_events +
// locations.associated_character_ids). Read-only; recomputed on demand so
// they always reflect the latest conversations without manual entry.
export interface DerivedGroupEvent {
  id: string;
  title: string;
  date: string | null;
  type: string;
  summary?: string;
  involved: string[]; // member names tied to this event
  user_was_present?: boolean;
  /** with_user | without_user | group_wide — how the event relates to you & the group */
  audience?: GroupEventAudience;
  /** direct roster vs subgroup-only vs spans hierarchy */
  scope?: 'direct' | 'subgroup' | 'hierarchy';
  subgroup_names?: string[];
  source: 'conversation';
}

export type GroupEventAudience = 'with_user' | 'without_user' | 'group_wide';

export interface DerivedGroupHierarchyNode {
  id: string;
  name: string;
  group_type?: string;
  relationship_type?: OrgRelationshipType;
  member_count?: number;
  inferred?: boolean;
}

export interface DerivedGroupHierarchy {
  parent?: DerivedGroupHierarchyNode;
  subgroups: DerivedGroupHierarchyNode[];
  related: DerivedGroupHierarchyNode[];
}

export interface DerivedGroupLocation {
  id: string;
  name: string;
  type?: string;
  importance_score?: number;
  involved: string[]; // member names tied to this location
  source: 'conversation';
}

export interface DerivedGroupContext {
  events: DerivedGroupEvent[];
  locations: DerivedGroupLocation[];
  hierarchy: DerivedGroupHierarchy;
}

export type OrganizationMentionSource = 'chat_messages' | 'conversation_messages' | 'entity_facts';

export interface OrganizationMentionTrace {
  id: string;
  source: OrganizationMentionSource;
  source_id: string;
  session_id?: string | null;
  thread_title?: string | null;
  role?: string | null;
  matched_label: string;
  occurrence_count: number;
  snippet: string;
  created_at?: string | null;
  metadata?: Record<string, any> | null;
}

export interface OrganizationMentionTraceResult {
  labels: string[];
  total_mentions: number;
  source_counts: Record<OrganizationMentionSource, number>;
  mentions: OrganizationMentionTrace[];
  facts: Array<{
    id: string;
    fact: string;
    category?: string | null;
    confidence?: number | null;
    status?: string | null;
    metadata?: Record<string, any> | null;
    created_at?: string | null;
    updated_at?: string | null;
  }>;
}

export interface Organization {
  id: string;
  user_id: string;
  name: string;
  aliases: string[];

  // ── Legacy type column (kept for backward compat) ──────────────────
  type: OrganizationType;

  // ── G1 canonical group model ───────────────────────────────────────
  group_type: GroupType;
  membership_model: MembershipModel;
  user_relationship: UserRelationship;
  is_public_entity: boolean;
  founded_year?: number;
  dissolved_year?: number;

  description?: string;
  location?: string;
  founded_date?: string;
  status: OrganizationStatus;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;

  // Related data
  members?: OrganizationMember[];
  stories?: OrganizationStory[];
  events?: OrganizationEvent[];
  locations?: OrganizationLocation[];

  // Computed stats
  member_count?: number;
  usage_count?: number;
  confidence?: number;
  last_seen?: string;

  // Analytics
  analytics?: GroupAnalytics;
}

export class OrganizationService {
  /**
   * List all organizations for a user
   */
  /**
   * Drop the cached organization list for a user. Called by every mutation that
   * changes an org or its members/stories/events/locations so reads stay fresh.
   */
  invalidateOrganizations(userId: string): void {
    if (userId) {
      orgListCache.delete(userId);
      orgListInflight.delete(userId);
    }
  }

  async listOrganizations(userId: string): Promise<Organization[]> {
    const cached = orgListCache.get(userId);
    if (cached && Date.now() - cached.at <= ORG_LIST_TTL_MS) {
      return cached.data as Organization[];
    }
    if (cached) orgListCache.delete(userId);

    const inflight = orgListInflight.get(userId);
    if (inflight) return inflight;

    const load = this.loadOrganizationsFromDb(userId).finally(() => {
      orgListInflight.delete(userId);
    });
    orgListInflight.set(userId, load);
    return load;
  }

  async getMentionTrace(
    userId: string,
    organizationId: string,
    options: { limit?: number } = {}
  ): Promise<OrganizationMentionTraceResult> {
    const org = await this.getOrganization(userId, organizationId);
    if (!org) {
      return {
        labels: [],
        total_mentions: 0,
        source_counts: { chat_messages: 0, conversation_messages: 0, entity_facts: 0 },
        mentions: [],
        facts: [],
      };
    }

    const labels = [...new Set([org.name, ...(org.aliases ?? [])].map(label => label?.trim()).filter(Boolean) as string[])];
    const limit = Math.max(1, Math.min(options.limit ?? 80, 200));
    const mentionsByKey = new Map<string, OrganizationMentionTrace>();

    const countOccurrences = (text: string, label: string): number => {
      if (!text || !label) return 0;
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\b`, 'gi');
      return text.match(re)?.length ?? 0;
    };

    const snippetFor = (text: string, label: string): string => {
      const idx = text.toLowerCase().indexOf(label.toLowerCase());
      if (idx < 0) return text.slice(0, 260);
      const start = Math.max(0, idx - 120);
      const end = Math.min(text.length, idx + label.length + 160);
      const prefix = start > 0 ? '...' : '';
      const suffix = end < text.length ? '...' : '';
      return `${prefix}${text.slice(start, end)}${suffix}`;
    };

    const addMention = (mention: OrganizationMentionTrace) => {
      const key = `${mention.source}:${mention.source_id}:${mention.matched_label}`;
      const existing = mentionsByKey.get(key);
      if (existing) {
        existing.occurrence_count += mention.occurrence_count;
        return;
      }
      mentionsByKey.set(key, mention);
    };

    for (const label of labels) {
      const pattern = `%${label}%`;
      const [chatRows, conversationRows] = await Promise.all([
        supabaseAdmin
          .from('chat_messages')
          .select('id, session_id, role, content, created_at, metadata')
          .eq('user_id', userId)
          .ilike('content', pattern)
          .order('created_at', { ascending: false })
          .limit(limit),
        supabaseAdmin
          .from('conversation_messages')
          .select('id, session_id, role, content, created_at, metadata')
          .eq('user_id', userId)
          .ilike('content', pattern)
          .order('created_at', { ascending: false })
          .limit(limit),
      ]);

      if (chatRows.error) logger.debug({ error: chatRows.error, userId, organizationId }, 'chat_messages mention trace unavailable');
      if (conversationRows.error) logger.debug({ error: conversationRows.error, userId, organizationId }, 'conversation_messages mention trace unavailable');

      for (const row of (chatRows.data ?? []) as Array<Record<string, any>>) {
        const content = String(row.content ?? '');
        const count = countOccurrences(content, label);
        if (count <= 0) continue;
        addMention({
          id: `chat-${row.id}-${label}`,
          source: 'chat_messages',
          source_id: String(row.id),
          session_id: row.session_id ? String(row.session_id) : null,
          role: row.role ? String(row.role) : null,
          matched_label: label,
          occurrence_count: count,
          snippet: snippetFor(content, label),
          created_at: row.created_at ? String(row.created_at) : null,
          metadata: (row.metadata as Record<string, any> | null) ?? null,
        });
      }

      for (const row of (conversationRows.data ?? []) as Array<Record<string, any>>) {
        const content = String(row.content ?? '');
        const count = countOccurrences(content, label);
        if (count <= 0) continue;
        addMention({
          id: `conversation-${row.id}-${label}`,
          source: 'conversation_messages',
          source_id: String(row.id),
          session_id: row.session_id ? String(row.session_id) : null,
          role: row.role ? String(row.role) : null,
          matched_label: label,
          occurrence_count: count,
          snippet: snippetFor(content, label),
          created_at: row.created_at ? String(row.created_at) : null,
          metadata: (row.metadata as Record<string, any> | null) ?? null,
        });
      }

    }

    const mentions = [...mentionsByKey.values()]
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
      .slice(0, limit);

    const sessionIds = [...new Set(mentions.map(m => m.session_id).filter(Boolean) as string[])];
    if (sessionIds.length > 0) {
      const { data: sessions, error } = await supabaseAdmin
        .from('conversation_sessions')
        .select('id, title, summary')
        .eq('user_id', userId)
        .in('id', sessionIds);
      if (!error) {
        const titleById = new Map((sessions ?? []).map((row: any) => [String(row.id), String(row.title || row.summary || '')]));
        for (const mention of mentions) {
          if (mention.session_id) mention.thread_title = titleById.get(mention.session_id) || null;
        }
      }
    }

    const { data: factData, error: factError } = await supabaseAdmin
      .from('entity_facts')
      .select('id, fact, category, confidence, status, metadata, created_at, updated_at')
      .eq('user_id', userId)
      .eq('entity_type', 'organization')
      .eq('entity_id', organizationId)
      .is('superseded_at', null)
      .order('updated_at', { ascending: false })
      .limit(80);
    if (factError) logger.debug({ error: factError, userId, organizationId }, 'entity_facts mention trace unavailable');

    for (const row of ((factData ?? []) as Array<Record<string, any>>)) {
      const fact = String(row.fact ?? '');
      const matchedLabel = labels.find(label => countOccurrences(fact, label) > 0) ?? org.name;
      const count = Math.max(1, countOccurrences(fact, matchedLabel));
      addMention({
        id: `fact-${row.id}`,
        source: 'entity_facts',
        source_id: String(row.id),
        matched_label: matchedLabel,
        occurrence_count: count,
        snippet: fact,
        created_at: row.updated_at ? String(row.updated_at) : row.created_at ? String(row.created_at) : null,
        metadata: (row.metadata as Record<string, any> | null) ?? null,
      });
    }

    const finalMentions = [...mentionsByKey.values()]
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
      .slice(0, limit);

    const source_counts: Record<OrganizationMentionSource, number> = {
      chat_messages: 0,
      conversation_messages: 0,
      entity_facts: 0,
    };
    for (const mention of finalMentions) source_counts[mention.source] += mention.occurrence_count;

    return {
      labels,
      total_mentions: finalMentions.reduce((sum, mention) => sum + mention.occurrence_count, 0),
      source_counts,
      mentions: finalMentions,
      facts: ((factData ?? []) as Array<Record<string, any>>).map(row => ({
        id: String(row.id),
        fact: String(row.fact ?? ''),
        category: row.category ? String(row.category) : null,
        confidence: typeof row.confidence === 'number' ? row.confidence : null,
        status: row.status ? String(row.status) : null,
        metadata: (row.metadata as Record<string, any> | null) ?? null,
        created_at: row.created_at ? String(row.created_at) : null,
        updated_at: row.updated_at ? String(row.updated_at) : null,
      })),
    };
  }

  /** One cache-miss fan-out: 1 org read + 4 batched child reads (O(orgs) rows). */
  private async loadOrganizationsFromDb(userId: string): Promise<Organization[]> {
    try {
      const { data: orgs, error } = await supabaseAdmin
        .from('organizations')
        .select(ORG_COLS)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const organizationRows = ((orgs || []) as unknown) as Organization[];
      if (organizationRows.length === 0) {
        orgListCache.set(userId, { at: Date.now(), data: [] });
        return [];
      }

      const organizationIds = organizationRows.map(org => org.id);
      const [membersResult, storiesResult, eventsResult, locationsResult] = await Promise.all([
        supabaseAdmin
          .from('organization_members')
          .select(ORG_MEMBER_COLS)
          .in('organization_id', organizationIds)
          .order('joined_date', { ascending: true }),
        supabaseAdmin
          .from('organization_stories')
          .select(ORG_STORY_COLS)
          .in('organization_id', organizationIds)
          .order('date', { ascending: false }),
        supabaseAdmin
          .from('organization_events')
          .select(ORG_EVENT_COLS)
          .in('organization_id', organizationIds)
          .order('date', { ascending: false }),
        supabaseAdmin
          .from('organization_locations')
          .select(ORG_LOCATION_COLS)
          .in('organization_id', organizationIds)
          .order('last_visited', { ascending: false }),
      ]);

      if (membersResult.error) logger.warn({ error: membersResult.error, userId }, 'Failed to batch load organization members');
      if (storiesResult.error) logger.warn({ error: storiesResult.error, userId }, 'Failed to batch load organization stories');
      if (eventsResult.error) logger.warn({ error: eventsResult.error, userId }, 'Failed to batch load organization events');
      if (locationsResult.error) logger.warn({ error: locationsResult.error, userId }, 'Failed to batch load organization locations');

      const groupByOrganizationId = <T extends { organization_id: string }>(rows: T[] | null | undefined) => {
        const grouped = new Map<string, T[]>();
        for (const row of rows || []) {
          const existing = grouped.get(row.organization_id) || [];
          existing.push(row);
          grouped.set(row.organization_id, existing);
        }
        return grouped;
      };

      const membersByOrg = groupByOrganizationId<OrganizationMember>(membersResult.error ? [] : membersResult.data);
      const storiesByOrg = groupByOrganizationId<OrganizationStory>(storiesResult.error ? [] : storiesResult.data);
      const eventsByOrg = groupByOrganizationId<OrganizationEvent>(eventsResult.error ? [] : eventsResult.data);
      const locationsByOrg = groupByOrganizationId<OrganizationLocation>(locationsResult.error ? [] : locationsResult.data);

      const result = organizationRows.map((org) => {
        const members = membersByOrg.get(org.id) || [];
        const stories = storiesByOrg.get(org.id) || [];
        const events = eventsByOrg.get(org.id) || [];
        const locations = locationsByOrg.get(org.id) || [];

        return {
          ...org,
          members,
          stories,
          events,
          locations,
          member_count: members.length,
          usage_count: events.length + stories.length,
          confidence: 1.0,
          last_seen: org.updated_at,
        };
      });

      orgListCache.set(userId, { at: Date.now(), data: result });
      return result;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to list organizations');
      throw error;
    }
  }

  /**
   * Get organization by ID with all related data
   */
  async getOrganization(userId: string, organizationId: string): Promise<Organization | null> {
    try {
      const { data: orgData, error } = await supabaseAdmin
        .from('organizations')
        .select(ORG_COLS)
        .eq('id', organizationId)
        .eq('user_id', userId)
        .single();

      if (error) throw error;
      const org = (orgData as unknown) as Organization | null;
      if (!org) return null;

      const [members, stories, events, locations] = await Promise.all([
        this.getMembers(org.id),
        this.getStories(org.id),
        this.getEvents(org.id),
        this.getLocations(org.id),
      ]);

      // Calculate analytics
      let analytics: GroupAnalytics | undefined;
      try {
        analytics = await groupAnalyticsService.calculateAnalytics(userId, org.id, {
          ...org,
          members,
          stories,
          events,
          locations,
        });
      } catch (error) {
        logger.debug({ error, organizationId: org.id }, 'Failed to calculate analytics, continuing without');
      }

      return {
        ...org,
        members,
        stories,
        events,
        locations,
        member_count: members.length,
        usage_count: 0,
        confidence: 1.0,
        last_seen: org.updated_at,
        analytics,
      };
    } catch (error) {
      logger.error({ error, userId, organizationId }, 'Failed to get organization');
      throw error;
    }
  }

  /**
   * Find an existing organization by name or alias (normalized comparison).
   */
  async findByName(userId: string, name: string): Promise<Organization | null> {
    const target = normalizeNameKey(name);
    if (!target) return null;

    const { data, error } = await supabaseAdmin
      .from('organizations')
      .select('*')
      .eq('user_id', userId)
      .limit(500);

    if (error || !data?.length) return null;

    for (const row of data) {
      const labels = [row.name, ...((row.aliases as string[] | null) ?? [])];
      for (const label of labels) {
        const norm = normalizeNameKey(label);
        if (norm === target || namesOverlapByContainment(norm, target)) {
          return {
            ...row,
            members: [],
            stories: [],
            events: [],
            locations: [],
            member_count: 0,
            usage_count: 0,
            confidence: 1.0,
            last_seen: row.updated_at,
          };
        }
      }
    }
    return null;
  }

  /**
   * Flat list of every organization label (name + aliases) for the user. Used by
   * romantic-relationship guards to avoid romancing the members of a band/org
   * whose name doubles as a relationship word (e.g. the band "Ex Lover").
   */
  async listOrganizationLabels(userId: string): Promise<string[]> {
    const { data, error } = await supabaseAdmin
      .from('organizations')
      .select('name, aliases')
      .eq('user_id', userId)
      .limit(500);
    if (error || !data?.length) return [];
    const labels = new Set<string>();
    for (const row of data) {
      if (row.name) labels.add(String(row.name));
      for (const alias of ((row.aliases as string[] | null) ?? [])) {
        if (alias) labels.add(String(alias));
      }
    }
    return [...labels];
  }

  /**
   * Create a new organization
   */
  async createOrganization(userId: string, data: Partial<Organization>): Promise<Organization> {
    this.invalidateOrganizations(userId);
    try {
      if (data.name) {
        const existing = await this.findByName(userId, data.name);
        if (existing) {
          logger.info({ userId, orgId: existing.id, name: data.name }, 'Dedup: returning existing organization');
          return existing;
        }
      }

      const { data: org, error } = await supabaseAdmin
        .from('organizations')
        .insert({
          user_id: userId,
          name: data.name!,
          aliases: data.aliases || [],
          type: data.type || 'other',
          group_type: data.group_type || data.type || 'other',
          membership_model: data.membership_model || 'strict',
          user_relationship: data.user_relationship || 'member',
          is_public_entity: data.is_public_entity ?? false,
          founded_year: data.founded_year,
          dissolved_year: data.dissolved_year,
          description: data.description,
          location: data.location,
          founded_date: data.founded_date,
          status: data.status || 'active',
          metadata: data.metadata || {},
        })
        .select()
        .single();

      if (error) throw error;

      return {
        ...org,
        members: [],
        stories: [],
        events: [],
        locations: [],
        member_count: 0,
        usage_count: 0,
        confidence: 1.0,
        last_seen: org.updated_at,
      };
    } catch (error) {
      logger.error({ error, userId, data }, 'Failed to create organization');
      throw error;
    }
  }

  /**
   * Update an organization
   */
  async updateOrganization(
    userId: string,
    organizationId: string,
    updates: Partial<Organization>
  ): Promise<Organization> {
    this.invalidateOrganizations(userId);
    try {
      const { data: org, error } = await supabaseAdmin
        .from('organizations')
        .update({
          name: updates.name,
          aliases: updates.aliases,
          type: updates.type,
          group_type: updates.group_type,
          membership_model: updates.membership_model,
          user_relationship: updates.user_relationship,
          is_public_entity: updates.is_public_entity,
          founded_year: updates.founded_year,
          dissolved_year: updates.dissolved_year,
          description: updates.description,
          location: updates.location,
          founded_date: updates.founded_date,
          status: updates.status,
          metadata: updates.metadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', organizationId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;

      return await this.getOrganization(userId, organizationId) || org;
    } catch (error) {
      logger.error({ error, userId, organizationId, updates }, 'Failed to update organization');
      throw error;
    }
  }

  /**
   * Get members for an organization
   */
  async getMembers(organizationId: string): Promise<OrganizationMember[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('organization_members')
        .select(ORG_MEMBER_COLS)
        .eq('organization_id', organizationId)
        .order('joined_date', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error({ error, organizationId }, 'Failed to get members');
      return [];
    }
  }

  /**
   * Add a member to an organization
   */
  async addMember(userId: string, organizationId: string, member: Omit<OrganizationMember, 'id' | 'organization_id'>): Promise<OrganizationMember> {
    this.invalidateOrganizations(userId);
    try {
      const { data, error } = await supabaseAdmin
        .from('organization_members')
        .insert({
          user_id: userId,
          organization_id: organizationId,
          character_name: member.character_name,
          character_id: member.character_id,
          role: member.role,
          joined_date: member.joined_date,
          status: member.status || 'active',
          notes: member.notes,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error({ error, userId, organizationId, member }, 'Failed to add member');
      throw error;
    }
  }

  /**
   * Remove a member from an organization
   */
  async removeMember(userId: string, organizationId: string, memberId: string): Promise<void> {
    this.invalidateOrganizations(userId);
    try {
      const { error } = await supabaseAdmin
        .from('organization_members')
        .delete()
        .eq('id', memberId)
        .eq('organization_id', organizationId)
        .eq('user_id', userId);

      if (error) throw error;
    } catch (error) {
      logger.error({ error, userId, organizationId, memberId }, 'Failed to remove member');
      throw error;
    }
  }

  /**
   * Get stories for an organization
   */
  async getStories(organizationId: string): Promise<OrganizationStory[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('organization_stories')
        .select(ORG_STORY_COLS)
        .eq('organization_id', organizationId)
        .order('date', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error({ error, organizationId }, 'Failed to get stories');
      return [];
    }
  }

  /**
   * Get events for an organization
   */
  async getEvents(organizationId: string): Promise<OrganizationEvent[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('organization_events')
        .select(ORG_EVENT_COLS)
        .eq('organization_id', organizationId)
        .order('date', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error({ error, organizationId }, 'Failed to get events');
      return [];
    }
  }

  /**
   * Get locations for an organization
   */
  async getLocations(organizationId: string): Promise<OrganizationLocation[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('organization_locations')
        .select(ORG_LOCATION_COLS)
        .eq('organization_id', organizationId)
        .order('last_visited', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error({ error, organizationId }, 'Failed to get locations');
      return [];
    }
  }

  /**
   * Derive a group's events & locations from its MEMBERS' appearances across
   * the user's chat threads / journal entries. Unlike organization_events /
   * organization_locations (manual overlays), this reads the auto-extracted
   * character timelines + canonical locations so the modal always reflects
   * what was actually discussed. Read-only and recomputed per request.
   */
  async getDerivedContext(userId: string, organizationId: string): Promise<DerivedGroupContext> {
    try {
      const hierarchy = await this.getGroupHierarchy(userId, organizationId);
      const members = await this.getMembers(organizationId);
      const idToName = new Map<string, string>();
      const directCharIds = new Set<string>();
      for (const m of members) {
        if (m.character_id) {
          idToName.set(m.character_id, m.character_name);
          directCharIds.add(m.character_id);
        }
      }

      // Include subgroup rosters so parent groups inherit their events.
      const charToSubgroups = new Map<string, Array<{ id: string; name: string }>>();
      const subgroupMemberSets = new Map<string, Set<string>>();
      for (const sg of hierarchy.subgroups) {
        const sgMembers = await this.getMembers(sg.id);
        const sgSet = new Set<string>();
        for (const m of sgMembers) {
          if (!m.character_id) continue;
          sgSet.add(m.character_id);
          idToName.set(m.character_id, m.character_name);
          const list = charToSubgroups.get(m.character_id) ?? [];
          if (!list.some(x => x.id === sg.id)) list.push({ id: sg.id, name: sg.name });
          charToSubgroups.set(m.character_id, list);
        }
        subgroupMemberSets.set(sg.id, sgSet);
      }

      const characterIds = [...idToName.keys()];
      if (characterIds.length === 0) {
        return { events: [], locations: [], hierarchy };
      }

      const [rawEvents, locations] = await Promise.all([
        this.deriveEvents(userId, characterIds, idToName),
        this.deriveLocations(userId, characterIds, idToName),
      ]);

      const events = rawEvents.map(ev => {
        const involvedIds = ev.involved
          .map(name => {
            for (const [id, n] of idToName) if (n === name) return id;
            return null;
          })
          .filter((id): id is string => Boolean(id));

        const subgroupNames = new Set<string>();
        let fromDirect = false;
        let fromSubgroup = false;
        for (const id of involvedIds) {
          if (directCharIds.has(id)) fromDirect = true;
          for (const sg of charToSubgroups.get(id) ?? []) subgroupNames.add(sg.name);
          for (const [sgId, sgSet] of subgroupMemberSets) {
            if (sgSet.has(id)) {
              fromSubgroup = true;
              const sgNode = hierarchy.subgroups.find(s => s.id === sgId);
              if (sgNode) subgroupNames.add(sgNode.name);
            }
          }
        }

        let scope: DerivedGroupEvent['scope'] = 'direct';
        if (fromDirect && fromSubgroup) scope = 'hierarchy';
        else if (fromSubgroup && !fromDirect) scope = 'subgroup';

        return {
          ...ev,
          audience: this.classifyGroupEventAudience(ev),
          scope,
          subgroup_names: subgroupNames.size > 0 ? [...subgroupNames] : undefined,
        };
      });

      return { events, locations, hierarchy };
    } catch (error) {
      logger.error({ error, userId, organizationId }, 'Failed to derive group context');
      return {
        events: [],
        locations: [],
        hierarchy: { subgroups: [], related: [] },
      };
    }
  }

  /** Parent / subgroups / affiliated groups for an organization. */
  async getGroupHierarchy(userId: string, organizationId: string): Promise<DerivedGroupHierarchy> {
    const orgs = await this.listOrganizations(userId);
    const orgById = new Map(orgs.map(o => [o.id, o]));
    const rels = await this.getRelationships(userId, organizationId);
    const inferred = (notes?: string) => Boolean(notes?.startsWith('[auto-inferred]'));

    let parent: DerivedGroupHierarchyNode | undefined;
    const subgroups: DerivedGroupHierarchyNode[] = [];
    const related: DerivedGroupHierarchyNode[] = [];

    for (const rel of rels) {
      const otherId = rel.from_org_id === organizationId ? rel.to_org_id : rel.from_org_id;
      const other = orgById.get(otherId);
      if (!other) continue;
      const node: DerivedGroupHierarchyNode = {
        id: other.id,
        name: other.name,
        group_type: other.group_type ?? other.type,
        relationship_type: rel.relationship_type,
        inferred: inferred(rel.notes),
      };

      if (rel.relationship_type === 'part_of' || rel.relationship_type === 'spawned_from') {
        if (rel.from_org_id === organizationId) {
          // this org is part of other → parent
          parent = { ...node, relationship_type: rel.relationship_type };
        } else {
          // other is part of this org → subgroup
          const sgMembers = await this.getMembers(other.id);
          subgroups.push({ ...node, member_count: sgMembers.length });
        }
      } else {
        related.push(node);
      }
    }

    subgroups.sort((a, b) => a.name.localeCompare(b.name));
    related.sort((a, b) => a.name.localeCompare(b.name));
    return { parent, subgroups, related };
  }

  classifyGroupEventAudience(event: Pick<DerivedGroupEvent, 'user_was_present' | 'involved' | 'type' | 'title' | 'summary'>): GroupEventAudience {
    if (event.user_was_present) return 'with_user';

    const GROUP_WIDE_TYPES = /\b(meeting|gathering|show|game|party|concert|tournament|match|launch|festival|protest|strike|scandal|election|reunion|trip|tour|retreat|summit|assembly|rally)\b/i;
    const GROUP_WIDE_TEXT = /\b(the group|everyone|whole team|all of us|the band|the scene|the community|the crew|the family|group-wide|entire group)\b/i;

    if (event.involved.length >= 2) return 'group_wide';
    if (GROUP_WIDE_TYPES.test(event.type) || GROUP_WIDE_TYPES.test(event.title)) return 'group_wide';
    if (event.summary && GROUP_WIDE_TEXT.test(event.summary)) return 'group_wide';
    return 'without_user';
  }

  /** Events members took part in, from character_timeline_events. */
  private async deriveEvents(
    userId: string,
    characterIds: string[],
    idToName: Map<string, string>
  ): Promise<DerivedGroupEvent[]> {
    const { data, error } = await supabaseAdmin
      .from('character_timeline_events')
      .select('event_id, character_id, event_title, event_date, event_summary, event_type, user_was_present')
      .eq('user_id', userId)
      .in('character_id', characterIds)
      .order('event_date', { ascending: false })
      .limit(400);
    if (error || !data) return [];

    // Collapse rows that describe the SAME event (multiple members → one card).
    const byEvent = new Map<string, DerivedGroupEvent>();
    for (const row of data as Array<{
      event_id: string | null;
      character_id: string;
      event_title: string | null;
      event_date: string | null;
      event_summary: string | null;
      event_type: string | null;
      user_was_present: boolean | null;
    }>) {
      const title = (row.event_title ?? '').trim();
      if (!title) continue;
      const key = row.event_id ?? `${title.toLowerCase()}|${row.event_date ?? ''}`;
      const memberName = idToName.get(row.character_id);
      const existing = byEvent.get(key);
      if (existing) {
        if (memberName && !existing.involved.includes(memberName)) existing.involved.push(memberName);
        if (row.user_was_present) existing.user_was_present = true;
      } else {
        byEvent.set(key, {
          id: key,
          title,
          date: row.event_date ?? null,
          type: row.event_type ?? 'other',
          summary: row.event_summary ?? undefined,
          involved: memberName ? [memberName] : [],
          user_was_present: row.user_was_present ?? undefined,
          source: 'conversation',
        });
      }
    }

    return [...byEvent.values()]
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      .slice(0, 50);
  }

  /** Locations tied to members, from locations.associated_character_ids. */
  private async deriveLocations(
    userId: string,
    characterIds: string[],
    idToName: Map<string, string>
  ): Promise<DerivedGroupLocation[]> {
    const { data, error } = await supabaseAdmin
      .from('locations')
      .select('id, name, type, importance_score, associated_character_ids')
      .eq('user_id', userId)
      .overlaps('associated_character_ids', characterIds)
      .order('importance_score', { ascending: false })
      .limit(50);
    if (error || !data) return [];

    return (data as Array<{
      id: string;
      name: string | null;
      type: string | null;
      importance_score: number | null;
      associated_character_ids: string[] | null;
    }>)
      .filter(row => (row.name ?? '').trim().length > 0)
      .map(row => ({
        id: row.id,
        name: (row.name ?? '').trim(),
        type: row.type ?? undefined,
        importance_score: row.importance_score ?? undefined,
        involved: (row.associated_character_ids ?? [])
          .map(id => idToName.get(id))
          .filter((n): n is string => Boolean(n)),
        source: 'conversation' as const,
      }));
  }

  /**
   * Delete an organization (cascades to members, stories, events, locations via FK)
   */
  async deleteOrganization(userId: string, organizationId: string, reason?: string): Promise<void> {
    this.invalidateOrganizations(userId);
    try {
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('id, name, metadata')
        .eq('id', organizationId)
        .eq('user_id', userId)
        .maybeSingle();

      if (org) {
        const { entityDeletionRecoveryService } = await import('./entityDeletionRecoveryService');
        await entityDeletionRecoveryService.runBeforeDelete(userId, {
          entityType: 'organization',
          entityId: org.id as string,
          name: org.name as string,
          metadata: (org.metadata as Record<string, unknown> | null) ?? {},
          reason: reason ?? 'user_deleted_organization_from_ui',
          mode: 'permanent',
        });
      }

      const { error } = await supabaseAdmin
        .from('organizations')
        .delete()
        .eq('id', organizationId)
        .eq('user_id', userId);

      if (error) throw error;
    } catch (error) {
      logger.error({ error, userId, organizationId }, 'Failed to delete organization');
      throw error;
    }
  }

  /**
   * Add an event to an organization
   */
  async addEvent(
    userId: string,
    organizationId: string,
    event: { title: string; date: string; type?: OrganizationEvent['type']; event_id?: string }
  ): Promise<OrganizationEvent> {
    this.invalidateOrganizations(userId);
    try {
      const { data, error } = await supabaseAdmin
        .from('organization_events')
        .insert({
          user_id: userId,
          organization_id: organizationId,
          title: event.title,
          date: event.date,
          type: event.type || 'other',
          event_id: event.event_id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error({ error, userId, organizationId }, 'Failed to add event');
      throw error;
    }
  }

  /**
   * Remove an event from an organization
   */
  async removeEvent(userId: string, organizationId: string, eventId: string): Promise<void> {
    this.invalidateOrganizations(userId);
    try {
      const { error } = await supabaseAdmin
        .from('organization_events')
        .delete()
        .eq('id', eventId)
        .eq('organization_id', organizationId)
        .eq('user_id', userId);

      if (error) throw error;
    } catch (error) {
      logger.error({ error, userId, organizationId, eventId }, 'Failed to remove event');
      throw error;
    }
  }

  /**
   * Add a story to an organization
   */
  async addStory(
    userId: string,
    organizationId: string,
    story: { title: string; summary: string; date: string; memory_id?: string }
  ): Promise<OrganizationStory> {
    this.invalidateOrganizations(userId);
    try {
      const { data, error } = await supabaseAdmin
        .from('organization_stories')
        .insert({
          user_id: userId,
          organization_id: organizationId,
          title: story.title,
          summary: story.summary,
          date: story.date,
          memory_id: story.memory_id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error({ error, userId, organizationId }, 'Failed to add story');
      throw error;
    }
  }

  /**
   * Remove a story from an organization
   */
  async removeStory(userId: string, organizationId: string, storyId: string): Promise<void> {
    this.invalidateOrganizations(userId);
    try {
      const { error } = await supabaseAdmin
        .from('organization_stories')
        .delete()
        .eq('id', storyId)
        .eq('organization_id', organizationId)
        .eq('user_id', userId);

      if (error) throw error;
    } catch (error) {
      logger.error({ error, userId, organizationId, storyId }, 'Failed to remove story');
      throw error;
    }
  }

  /**
   * Add a location to an organization
   */
  async addLocation(
    userId: string,
    organizationId: string,
    location: { location_name: string; location_id?: string; visit_count?: number; last_visited?: string }
  ): Promise<OrganizationLocation> {
    this.invalidateOrganizations(userId);
    try {
      const { data, error } = await supabaseAdmin
        .from('organization_locations')
        .insert({
          user_id: userId,
          organization_id: organizationId,
          location_name: location.location_name,
          location_id: location.location_id,
          visit_count: location.visit_count || 1,
          last_visited: location.last_visited,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error({ error, userId, organizationId }, 'Failed to add location');
      throw error;
    }
  }

  /**
   * Remove a location from an organization
   */
  async removeLocation(userId: string, organizationId: string, locationId: string): Promise<void> {
    this.invalidateOrganizations(userId);
    try {
      const { error } = await supabaseAdmin
        .from('organization_locations')
        .delete()
        .eq('id', locationId)
        .eq('organization_id', organizationId)
        .eq('user_id', userId);

      if (error) throw error;
    } catch (error) {
      logger.error({ error, userId, organizationId, locationId }, 'Failed to remove location');
      throw error;
    }
  }

  // ── Organization Relationships ──────────────────────────────────────

  async addRelationship(
    userId: string,
    fromOrgId: string,
    toOrgId: string,
    relationshipType: OrgRelationshipType,
    notes?: string
  ): Promise<OrganizationRelationship> {
    try {
      const { data, error } = await supabaseAdmin
        .from('organization_relationships')
        .insert({
          user_id: userId,
          from_org_id: fromOrgId,
          to_org_id: toOrgId,
          relationship_type: relationshipType,
          notes,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error({ error, userId, fromOrgId, toOrgId }, 'Failed to add organization relationship');
      throw error;
    }
  }

  /** Idempotent insert — returns true if created, false if already existed. */
  async ensureRelationship(
    userId: string,
    fromOrgId: string,
    toOrgId: string,
    relationshipType: OrgRelationshipType,
    notes?: string
  ): Promise<boolean> {
    if (fromOrgId === toOrgId) return false;
    try {
      const { data: existing } = await supabaseAdmin
        .from('organization_relationships')
        .select('id')
        .eq('user_id', userId)
        .eq('from_org_id', fromOrgId)
        .eq('to_org_id', toOrgId)
        .eq('relationship_type', relationshipType)
        .maybeSingle();
      if (existing) return false;
      await this.addRelationship(userId, fromOrgId, toOrgId, relationshipType, notes);
      return true;
    } catch (error) {
      logger.debug({ error, userId, fromOrgId, toOrgId }, 'ensureRelationship skipped');
      return false;
    }
  }

  async removeRelationship(userId: string, relationshipId: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('organization_relationships')
        .delete()
        .eq('id', relationshipId)
        .eq('user_id', userId);

      if (error) throw error;
    } catch (error) {
      logger.error({ error, userId, relationshipId }, 'Failed to remove organization relationship');
      throw error;
    }
  }

  async getRelationships(userId: string, orgId: string): Promise<OrganizationRelationship[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('organization_relationships')
        .select('*')
        .eq('user_id', userId)
        .or(`from_org_id.eq.${orgId},to_org_id.eq.${orgId}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error({ error, userId, orgId }, 'Failed to get organization relationships');
      return [];
    }
  }

  /**
   * Get all organizations that contain a given character as a member.
   * Searches by character_id (if available) or character_name (fuzzy).
   */
  async getOrganizationsByCharacter(
    userId: string,
    characterId?: string,
    characterName?: string
  ): Promise<Organization[]> {
    try {
      let memberQuery = supabaseAdmin
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId);

      if (characterId) {
        memberQuery = memberQuery.eq('character_id', characterId);
      } else if (characterName) {
        memberQuery = memberQuery.ilike('character_name', `%${characterName}%`);
      } else {
        return [];
      }

      const { data: memberships, error } = await memberQuery;
      if (error) throw error;
      if (!memberships || memberships.length === 0) return [];

      const orgIds = [...new Set(memberships.map(m => m.organization_id))];
      const orgs = await this.getOrganizationsChunked(userId, orgIds);
      return orgs.filter((o): o is Organization => o !== null);
    } catch (error) {
      logger.error({ error, userId, characterId, characterName }, 'Failed to get organizations by character');
      return [];
    }
  }

  /**
   * Load many organizations in bounded batches. `getOrganization` fans out to
   * members + stories + events + locations per org, so loading ALL orgs at once
   * materialized whole subgraphs simultaneously (OOM contributor — see
   * docs/oom-root-cause-report.md). Process in small chunks instead.
   */
  private async getOrganizationsChunked(
    userId: string,
    orgIds: string[],
    chunkSize = 5
  ): Promise<Array<Organization | null>> {
    const out: Array<Organization | null> = [];
    for (let i = 0; i < orgIds.length; i += chunkSize) {
      const batch = orgIds.slice(i, i + chunkSize);
      out.push(...await Promise.all(batch.map(id => this.getOrganization(userId, id))));
    }
    return out;
  }

  /** Other group memberships for each roster member (excludes the current org). */
  async getMemberAffiliationsBatch(
    userId: string,
    organizationId: string
  ): Promise<Record<string, Array<{ id: string; name: string; group_type?: string }>>> {
    try {
      const org = await this.getOrganization(userId, organizationId);
      if (!org?.members?.length) return {};

      const characterIds = [...new Set(
        org.members.map(m => m.character_id).filter((id): id is string => Boolean(id))
      )];
      if (characterIds.length === 0) return {};

      const { data: rows, error } = await supabaseAdmin
        .from('organization_members')
        .select('character_id, organization_id')
        .eq('user_id', userId)
        .in('character_id', characterIds)
        .neq('organization_id', organizationId);

      if (error) throw error;
      if (!rows?.length) return {};

      const orgIds = [...new Set(rows.map(r => r.organization_id as string))];
      const orgs = await this.getOrganizationsChunked(userId, orgIds);
      const orgById = new Map(
        orgs.filter((o): o is Organization => o !== null).map(o => [o.id, o])
      );

      const result: Record<string, Array<{ id: string; name: string; group_type?: string }>> = {};
      for (const row of rows as Array<{ character_id: string; organization_id: string }>) {
        const other = orgById.get(row.organization_id);
        if (!other) continue;
        const list = result[row.character_id] ?? (result[row.character_id] = []);
        if (list.some(o => o.id === other.id)) continue;
        list.push({
          id: other.id,
          name: other.name,
          group_type: other.group_type ?? other.type,
        });
      }
      return result;
    } catch (error) {
      logger.error({ error, userId, organizationId }, 'Failed to get member affiliations batch');
      return {};
    }
  }
}

export const organizationService = new OrganizationService();
