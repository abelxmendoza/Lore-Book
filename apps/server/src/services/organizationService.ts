// =====================================================
// ORGANIZATION SERVICE
// Purpose: Manage organizations with members, stories, events, locations
// =====================================================

import { logger } from '../logger';

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
  | 'martial_arts'
  | 'scene'
  | 'crew'
  | 'collective'
  | 'institution'
  | 'public_entity'
  | 'other';

// ── Membership model ──────────────────────────────────────────────────
// strict = defined roster | fuzzy = participatory | none = reference only
export type MembershipModel = 'strict' | 'fuzzy' | 'none';

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
  async listOrganizations(userId: string): Promise<Organization[]> {
    try {
      const { data: orgs, error } = await supabaseAdmin
        .from('organizations')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      // Load related data for each organization
      const organizations = await Promise.all(
        (orgs || []).map(async (org) => {
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
        usage_count: events.length + stories.length,
        confidence: 1.0,
        last_seen: org.updated_at,
        analytics,
      };
        })
      );

      return organizations;
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
      const { data: org, error } = await supabaseAdmin
        .from('organizations')
        .select('*')
        .eq('id', organizationId)
        .eq('user_id', userId)
        .single();

      if (error) throw error;
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
   * Create a new organization
   */
  async createOrganization(userId: string, data: Partial<Organization>): Promise<Organization> {
    try {
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
        .select('*')
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
        .select('*')
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
        .select('*')
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
        .select('*')
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
   * Delete an organization (cascades to members, stories, events, locations via FK)
   */
  async deleteOrganization(userId: string, organizationId: string): Promise<void> {
    try {
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
      const orgs = await Promise.all(
        orgIds.map(id => this.getOrganization(userId, id))
      );
      return orgs.filter((o): o is Organization => o !== null);
    } catch (error) {
      logger.error({ error, userId, characterId, characterName }, 'Failed to get organizations by character');
      return [];
    }
  }
}

export const organizationService = new OrganizationService();

