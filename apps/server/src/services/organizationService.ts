// =====================================================
// ORGANIZATION SERVICE
// Purpose: Manage organizations with members, stories, events, locations
// =====================================================

import { supabaseAdmin } from './supabaseClient';
import { logger } from '../logger';
import { groupAnalyticsService, type GroupAnalytics } from './groupAnalyticsService';

export type OrganizationType = 'friend_group' | 'company' | 'sports_team' | 'club' | 'nonprofit' | 'affiliation' | 'other';
export type OrganizationStatus = 'active' | 'inactive' | 'dissolved';

export interface OrganizationMember {
  id: string;
  organization_id: string;
  character_id?: string;
  character_name: string;
  role?: string;
  joined_date?: string;
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
  type: OrganizationType;
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
        usage_count: 0, // TODO: Calculate from entity mentions
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
   * Chat endpoint for organization editing
   */
  async chat(
    userId: string,
    organizationId: string,
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<{ answer: string; updates?: Partial<Organization> }> {
    try {
      const organization = await this.getOrganization(userId, organizationId);
      if (!organization) {
        throw new Error('Organization not found');
      }

      // TODO: Integrate with omegaChatService for AI responses
      // For now, return a simple response
      const answer = `I understand you want to discuss ${organization.name}. This feature is being enhanced to provide AI-powered assistance for managing your organization.`;

      return { answer };
    } catch (error) {
      logger.error({ error, userId, organizationId }, 'Failed to process chat');
      throw error;
    }
  }
}

export const organizationService = new OrganizationService();

