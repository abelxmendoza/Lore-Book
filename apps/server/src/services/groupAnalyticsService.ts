// =====================================================
// GROUP ANALYTICS SERVICE
// Purpose: Calculate comprehensive metrics for groups
// =====================================================

import { logger } from '../logger';

import { organizationService, type Organization, type OrganizationMember } from './organizationService';
import { supabaseAdmin } from './supabaseClient';

export interface GroupAnalytics {
  // User involvement metrics
  user_involvement_score: number; // 0-100: How involved the user is
  user_ranking: number; // User's position in the group (1 = most involved)
  user_role_importance: number; // 0-100: Importance of user's role
  
  // Group metrics
  relevance_score: number; // 0-100: How relevant the group is to user
  priority_score: number; // 0-100: Priority level
  importance_score: number; // 0-100: Overall importance to user
  value_score: number; // 0-100: Value the group provides
  
  // Influence metrics
  group_influence_on_user: number; // 0-100: How much group influences user
  user_influence_over_group: number; // 0-100: How much user influences group
  
  // Social metrics
  cohesion_score: number; // 0-100: How cohesive/tight-knit the group is
  activity_level: number; // 0-100: How active the group is
  engagement_score: number; // 0-100: User's engagement with the group
  
  // Qualitative analysis
  strengths: string[]; // What the group is good at
  weaknesses: string[]; // Areas for improvement
  opportunities: string[]; // Potential opportunities
  threats: string[]; // Potential risks
  
  // Temporal metrics
  recency_score: number; // 0-100: How recently active
  frequency_score: number; // 0-100: How frequently mentioned/interacted
  trend: 'increasing' | 'stable' | 'decreasing'; // Trend over time
  
  // Calculated metadata
  calculated_at: string;
  calculation_period_days: number;
}

export class GroupAnalyticsService {
  /**
   * Calculate comprehensive analytics for a group
   */
  async calculateAnalytics(
    userId: string,
    organizationId: string,
    organization: Organization
  ): Promise<GroupAnalytics> {
    try {
      const calculationPeriod = 90; // Analyze last 90 days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - calculationPeriod);

      // Get conversation data
      const conversations = await this.getGroupConversations(userId, organizationId, cutoffDate);
      
      // Get journal entries mentioning the group
      const journalMentions = await this.getJournalMentions(userId, organization, cutoffDate);
      
      // Get events related to the group
      const groupEvents = await this.getGroupEvents(userId, organizationId, cutoffDate);
      
      // Calculate base metrics
      const mentionCount = conversations.length + journalMentions.length;
      const eventCount = groupEvents.length;
      const memberCount = organization.members?.length || 0;
      
      // User involvement score (based on mentions, events, active participation)
      const user_involvement_score = this.calculateInvolvementScore(
        conversations,
        journalMentions,
        groupEvents,
        organization
      );
      
      // User ranking (position in group based on activity)
      const user_ranking = await this.calculateUserRanking(
        userId,
        organizationId,
        conversations,
        groupEvents
      );
      
      // Relevance score (how relevant to user's current life)
      const relevance_score = this.calculateRelevanceScore(
        conversations,
        journalMentions,
        groupEvents,
        calculationPeriod
      );
      
      // Priority score (urgency + importance)
      const priority_score = this.calculatePriorityScore(
        conversations,
        groupEvents,
        organization
      );
      
      // Importance score (overall importance to user)
      const importance_score = this.calculateImportanceScore(
        user_involvement_score,
        relevance_score,
        priority_score,
        organization
      );
      
      // Value score (value provided to user)
      const value_score = this.calculateValueScore(
        conversations,
        journalMentions,
        organization
      );
      
      // Influence metrics
      const group_influence_on_user = this.calculateGroupInfluence(
        conversations,
        journalMentions
      );
      
      const user_influence_over_group = await this.calculateUserInfluence(
        userId,
        organizationId,
        conversations,
        groupEvents
      );
      
      // Cohesion score (how tight-knit the group is)
      const cohesion_score = this.calculateCohesionScore(
        organization,
        conversations,
        groupEvents
      );
      
      // Activity level
      const activity_level = this.calculateActivityLevel(
        conversations,
        groupEvents,
        calculationPeriod
      );
      
      // Engagement score
      const engagement_score = this.calculateEngagementScore(
        user_involvement_score,
        activity_level,
        relevance_score
      );
      
      // Recency and frequency
      const recency_score = this.calculateRecencyScore(conversations, groupEvents);
      const frequency_score = this.calculateFrequencyScore(mentionCount, calculationPeriod);
      
      // Trend analysis
      const trend = this.calculateTrend(conversations, groupEvents, calculationPeriod);
      
      // Qualitative analysis
      const { strengths, weaknesses, opportunities, threats } = await this.analyzeQualitative(
        userId,
        organization,
        conversations,
        journalMentions
      );
      
      // User role importance
      const user_role_importance = this.calculateRoleImportance(
        organization,
        user_involvement_score,
        user_influence_over_group
      );

      return {
        user_involvement_score: Math.round(user_involvement_score),
        user_ranking,
        user_role_importance: Math.round(user_role_importance),
        relevance_score: Math.round(relevance_score),
        priority_score: Math.round(priority_score),
        importance_score: Math.round(importance_score),
        value_score: Math.round(value_score),
        group_influence_on_user: Math.round(group_influence_on_user),
        user_influence_over_group: Math.round(user_influence_over_group),
        cohesion_score: Math.round(cohesion_score),
        activity_level: Math.round(activity_level),
        engagement_score: Math.round(engagement_score),
        strengths,
        weaknesses,
        opportunities,
        threats,
        recency_score: Math.round(recency_score),
        frequency_score: Math.round(frequency_score),
        trend,
        calculated_at: new Date().toISOString(),
        calculation_period_days: calculationPeriod,
      };

      // Update entity confidence based on analytics (fire and forget)
      entityConfidenceService
        .updateEntityConfidenceFromAnalytics(userId, organizationId, 'ORG', result)
        .catch(err => {
          logger.debug({ err, userId, organizationId }, 'Failed to update confidence from analytics');
        });

      return result;
    } catch (error) {
      logger.error({ error, userId, organizationId }, 'Failed to calculate group analytics');
      throw error;
    }
  }

  /**
   * Get conversations mentioning the group
   */
  private async getGroupConversations(
    userId: string,
    organizationId: string,
    since: Date
  ): Promise<any[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('chat_messages')
        .select('id, content, created_at, role')
        .eq('user_id', userId)
        .eq('role', 'user')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) throw error;

      // Get organization name for filtering
      const org = await organizationService.getOrganization(userId, organizationId);
      if (!org) return [];

      const orgName = org.name.toLowerCase();
      const orgAliases = (org.aliases || []).map((a: string) => a.toLowerCase());

      // Filter messages that mention the group
      return (data || []).filter(msg => {
        const content = msg.content.toLowerCase();
        return content.includes(orgName) || 
               orgAliases.some((alias: string) => content.includes(alias)) ||
               (org.members || []).some((m: OrganizationMember) => 
                 content.includes(m.character_name.toLowerCase())
               );
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get group conversations');
      return [];
    }
  }

  /**
   * Get journal entries mentioning the group
   */
  private async getJournalMentions(
    userId: string,
    organization: Organization,
    since: Date
  ): Promise<any[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('journal_entries')
        .select('id, content, created_at')
        .eq('user_id', userId)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      const orgName = organization.name.toLowerCase();
      const orgAliases = (organization.aliases || []).map((a: string) => a.toLowerCase());

      return (data || []).filter(entry => {
        const content = entry.content.toLowerCase();
        return content.includes(orgName) || 
               orgAliases.some((alias: string) => content.includes(alias));
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get journal mentions');
      return [];
    }
  }

  /**
   * Get events related to the group
   */
  private async getGroupEvents(
    userId: string,
    organizationId: string,
    since: Date
  ): Promise<any[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('organization_events')
        .select('*')
        .eq('organization_id', organizationId)
        .gte('date', since.toISOString().split('T')[0])
        .order('date', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error({ error }, 'Failed to get group events');
      return [];
    }
  }

  /**
   * Calculate user involvement score with sophisticated multi-factor analysis
   */
  private calculateInvolvementScore(
    conversations: any[],
    journalMentions: any[],
    groupEvents: any[],
    organization: Organization
  ): number {
    let score = 25; // Lower base - requires evidence

    // 1. Conversation mentions (weighted by quality and recency)
    const recentConversations = conversations.filter(c => {
      const daysAgo = (Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24);
      return daysAgo <= 30;
    });
    const conversationQuality = conversations.reduce((sum, c) => sum + (c.content?.length || 0), 0) / (conversations.length || 1);
    const qualityMultiplier = conversationQuality > 200 ? 1.3 : conversationQuality > 100 ? 1.1 : 1.0;
    const conversationScore = Math.min(
      (conversations.length * 1.5) + (recentConversations.length * 2) * qualityMultiplier,
      35
    );
    score += conversationScore;

    // 2. Journal mentions (weighted by emotional depth)
    const emotionalIndicators = ['important', 'meaningful', 'significant', 'matter', 'care about'];
    const emotionalMentions = journalMentions.filter(m => {
      const content = (m.content || '').toLowerCase();
      return emotionalIndicators.some(indicator => content.includes(indicator));
    }).length;
    const journalScore = Math.min(
      (journalMentions.length * 2) + (emotionalMentions * 3),
      25
    );
    score += journalScore;

    // 3. Event participation (recent events worth more)
    const recentEvents = groupEvents.filter(e => {
      const daysAgo = (Date.now() - new Date(e.date).getTime()) / (1000 * 60 * 60 * 24);
      return daysAgo <= 30;
    });
    const eventScore = Math.min(
      (groupEvents.length * 3) + (recentEvents.length * 4),
      20
    );
    score += eventScore;

    // 4. Member status and role (leadership roles = higher involvement)
    const userMember = organization.members?.find(m => m.status === 'active');
    if (userMember) {
      const role = (userMember.role || '').toLowerCase();
      const roleInvolvement: Record<string, number> = {
        'founder': 15,
        'leader': 12,
        'president': 12,
        'captain': 12,
        'director': 10,
        'manager': 8,
        'coordinator': 6,
        'organizer': 6,
        'member': 5,
      };
      score += roleInvolvement[role] || 5;
    }

    // 5. Active participation indicators
    const activeIndicators = ['organized', 'planned', 'led', 'coordinated', 'hosted', 'arranged'];
    const activeMentions = [...conversations, ...journalMentions].filter(item => {
      const content = (item.content || '').toLowerCase();
      return activeIndicators.some(indicator => content.includes(indicator));
    }).length;
    score += Math.min(activeMentions * 2, 10);

    return Math.max(0, Math.min(score, 100));
  }

  /**
   * Calculate user's ranking in the group
   */
  private async calculateUserRanking(
    userId: string,
    organizationId: string,
    conversations: any[],
    groupEvents: any[]
  ): Promise<number> {
    // For now, calculate based on activity
    // In a real implementation, you'd compare with other members
    const userActivity = conversations.length + groupEvents.length;
    
    // Get all members and their activity
    const members = await organizationService.getMembers(organizationId);
    const memberActivities = await Promise.all(
      members.map(async (member) => {
        // Count mentions of this member in conversations
        const memberMentions = conversations.filter(c => 
          c.content.toLowerCase().includes(member.character_name.toLowerCase())
        ).length;
        return { memberId: member.id, activity: memberMentions };
      })
    );

    // Sort by activity (descending)
    memberActivities.sort((a, b) => b.activity - a.activity);
    
    // Find user's position (assuming user is always first for now)
    // In real implementation, identify which member is the user
    return 1; // Placeholder - would need to identify user's member record
  }

  /**
   * Calculate relevance score
   */
  private calculateRelevanceScore(
    conversations: any[],
    journalMentions: any[],
    groupEvents: any[],
    periodDays: number
  ): number {
    const totalMentions = conversations.length + journalMentions.length;
    const daysSinceLastMention = this.getDaysSinceLastMention(conversations, journalMentions);
    
    // More recent = more relevant
    const recencyFactor = Math.max(0, 1 - (daysSinceLastMention / periodDays));
    
    // More mentions = more relevant
    const frequencyFactor = Math.min(1, totalMentions / 20);
    
    return (recencyFactor * 60 + frequencyFactor * 40);
  }

  /**
   * Calculate priority score
   */
  private calculatePriorityScore(
    conversations: any[],
    groupEvents: any[],
    organization: Organization
  ): number {
    let score = 50; // Base priority

    // Recent activity increases priority
    const recentEvents = groupEvents.filter(e => {
      const eventDate = new Date(e.date);
      const daysAgo = (Date.now() - eventDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysAgo <= 7;
    }).length;
    score += recentEvents * 5;

    // Active status increases priority
    if (organization.status === 'active') {
      score += 20;
    }

    // Type-based priority adjustments
    const typePriority: Record<string, number> = {
      'company': 10,
      'sports_team': 15,
      'friend_group': 20,
      'club': 10,
      'nonprofit': 5,
    };
    score += typePriority[organization.type] || 0;

    return Math.min(score, 100);
  }

  /**
   * Calculate importance score
   */
  private calculateImportanceScore(
    involvement: number,
    relevance: number,
    priority: number,
    organization: Organization
  ): number {
    // Weighted combination
    const involvementWeight = 0.4;
    const relevanceWeight = 0.3;
    const priorityWeight = 0.3;

    let score = (involvement * involvementWeight) +
                (relevance * relevanceWeight) +
                (priority * priorityWeight);

    // Adjust based on member count (larger groups might be more important)
    const memberCount = organization.members?.length || 0;
    if (memberCount > 5) score += 5;
    if (memberCount > 10) score += 5;

    return Math.min(score, 100);
  }

  /**
   * Calculate value score with sophisticated value indicators
   */
  private calculateValueScore(
    conversations: any[],
    journalMentions: any[],
    organization: Organization
  ): number {
    let valueScore = 40; // Base value

    const allItems = [...conversations, ...journalMentions];
    const totalMentions = allItems.length;

    // 1. Positive sentiment analysis (weighted)
    const positiveWords = {
      strong: ['love', 'amazing', 'incredible', 'best', 'favorite', 'treasure', 'essential'],
      medium: ['great', 'enjoy', 'helpful', 'supportive', 'valuable', 'appreciate', 'grateful'],
      light: ['good', 'nice', 'pleasant', 'fine']
    };
    const negativeWords = {
      strong: ['hate', 'awful', 'terrible', 'worst', 'waste of time'],
      medium: ['bad', 'annoying', 'frustrating', 'disappointing', 'pointless'],
      light: ['boring', 'meh', 'whatever']
    };

    let positiveValue = 0;
    let negativeValue = 0;

    allItems.forEach(item => {
      const content = (item.content || '').toLowerCase();
      
      positiveWords.strong.forEach(w => { if (content.includes(w)) positiveValue += 3; });
      positiveWords.medium.forEach(w => { if (content.includes(w)) positiveValue += 2; });
      positiveWords.light.forEach(w => { if (content.includes(w)) positiveValue += 1; });
      
      negativeWords.strong.forEach(w => { if (content.includes(w)) negativeValue += 3; });
      negativeWords.medium.forEach(w => { if (content.includes(w)) negativeValue += 2; });
      negativeWords.light.forEach(w => { if (content.includes(w)) negativeValue += 1; });
    });

    // 2. Value indicators (explicit value statements)
    const valueIndicators = [
      'learned from', 'gained from', 'benefited from', 'helped me', 'supported me',
      'important to me', 'matters to me', 'worth it', 'worthwhile', 'meaningful',
      'impacted my', 'influenced my', 'changed my', 'made me better'
    ];
    const valueMentions = allItems.filter(item => {
      const content = (item.content || '').toLowerCase();
      return valueIndicators.some(indicator => content.includes(indicator));
    }).length;
    valueScore += Math.min(valueMentions * 5, 25);

    // 3. Group type value (some groups inherently more valuable)
    const typeValue: Record<string, number> = {
      'friend_group': 15,
      'family': 20,
      'mentor_group': 18,
      'support_group': 15,
      'company': 10,
      'sports_team': 12,
      'club': 8,
      'nonprofit': 10,
    };
    valueScore += typeValue[organization.type] || 0;

    // 4. Net sentiment contribution
    const netSentiment = positiveValue - negativeValue;
    if (totalMentions > 0) {
      const sentimentRatio = netSentiment / (totalMentions * 3);
      valueScore += sentimentRatio * 20;
    }

    // 5. Growth/development indicators
    const growthIndicators = ['grew', 'developed', 'improved', 'progressed', 'evolved', 'became better'];
    const growthMentions = allItems.filter(item => {
      const content = (item.content || '').toLowerCase();
      return growthIndicators.some(indicator => content.includes(indicator));
    }).length;
    valueScore += Math.min(growthMentions * 3, 10);

    return Math.max(0, Math.min(valueScore, 100));
  }

  /**
   * Calculate group influence on user
   */
  private calculateGroupInfluence(
    conversations: any[],
    journalMentions: any[]
  ): number {
    // Look for language indicating influence
    const influenceIndicators = [
      'influenced', 'inspired', 'changed', 'affected', 'impacted',
      'because of', 'thanks to', 'due to', 'learned from'
    ];

    let influenceCount = 0;
    [...conversations, ...journalMentions].forEach(item => {
      const content = item.content.toLowerCase();
      if (influenceIndicators.some(indicator => content.includes(indicator))) {
        influenceCount++;
      }
    });

    const total = conversations.length + journalMentions.length;
    if (total === 0) return 0;

    return Math.min((influenceCount / total) * 100, 100);
  }

  /**
   * Calculate user influence over group
   */
  private async calculateUserInfluence(
    userId: string,
    organizationId: string,
    conversations: any[],
    groupEvents: any[]
  ): Promise<number> {
    // Look for leadership language, decision-making, organizing
    const leadershipIndicators = [
      'organized', 'led', 'planned', 'decided', 'suggested', 'proposed',
      'coordinated', 'managed', 'directed', 'initiated'
    ];

    let leadershipCount = 0;
    conversations.forEach(conv => {
      const content = conv.content.toLowerCase();
      if (leadershipIndicators.some(indicator => content.includes(indicator))) {
        leadershipCount++;
      }
    });

    // Check user's role in organization
    const org = await organizationService.getOrganization(userId, organizationId);
    const userMember = org?.members?.find(m => m.status === 'active');
    const role = userMember?.role?.toLowerCase() || '';
    
    let roleBonus = 0;
    if (role.includes('leader') || role.includes('founder') || role.includes('president') || 
        role.includes('captain') || role.includes('director')) {
      roleBonus = 30;
    } else if (role.includes('manager') || role.includes('coordinator')) {
      roleBonus = 20;
    }

    const baseScore = conversations.length > 0 
      ? Math.min((leadershipCount / conversations.length) * 70, 70)
      : 0;

    return Math.min(baseScore + roleBonus, 100);
  }

  /**
   * Calculate cohesion score
   */
  private calculateCohesionScore(
    organization: Organization,
    conversations: any[],
    groupEvents: any[]
  ): number {
    let score = 50; // Base cohesion

    // More members = potentially less cohesive (unless very active)
    const memberCount = organization.members?.length || 0;
    if (memberCount <= 5) score += 20; // Small groups are often more cohesive
    if (memberCount > 10) score -= 10; // Large groups might be less cohesive

    // Regular events indicate cohesion
    const eventsPerMonth = groupEvents.length / 3; // Assuming 3 months
    if (eventsPerMonth >= 4) score += 20; // Very active
    if (eventsPerMonth >= 2) score += 10; // Active
    if (eventsPerMonth < 1) score -= 10; // Inactive

    // Shared experiences (multiple members mentioned together)
    const sharedMentions = conversations.filter(c => {
      const memberNames = organization.members?.map(m => m.character_name.toLowerCase()) || [];
      const mentionedMembers = memberNames.filter(name => 
        c.content.toLowerCase().includes(name)
      );
      return mentionedMembers.length >= 2;
    }).length;

    if (conversations.length > 0) {
      const sharedRatio = sharedMentions / conversations.length;
      score += sharedRatio * 20;
    }

    return Math.max(0, Math.min(score, 100));
  }

  /**
   * Calculate activity level
   */
  private calculateActivityLevel(
    conversations: any[],
    groupEvents: any[],
    periodDays: number
  ): number {
    const totalActivity = conversations.length + groupEvents.length;
    const activityPerWeek = (totalActivity / periodDays) * 7;
    
    // Normalize to 0-100 scale
    // 5+ activities per week = very active (100)
    // 1 activity per week = moderate (50)
    // 0 activities = inactive (0)
    return Math.min((activityPerWeek / 5) * 100, 100);
  }

  /**
   * Calculate engagement score
   */
  private calculateEngagementScore(
    involvement: number,
    activity: number,
    relevance: number
  ): number {
    // Weighted combination
    return (involvement * 0.4 + activity * 0.3 + relevance * 0.3);
  }

  /**
   * Calculate recency score
   */
  private calculateRecencyScore(
    conversations: any[],
    groupEvents: any[]
  ): number {
    const allItems = [...conversations, ...groupEvents];
    if (allItems.length === 0) return 0;

    const mostRecent = allItems.reduce((latest, item) => {
      const itemDate = new Date(item.created_at || item.date);
      const latestDate = new Date(latest.created_at || latest.date);
      return itemDate > latestDate ? item : latest;
    });

    const daysSince = (Date.now() - new Date(mostRecent.created_at || mostRecent.date).getTime()) / (1000 * 60 * 60 * 24);
    
    // 0 days = 100, 30 days = 50, 90+ days = 0
    return Math.max(0, 100 - (daysSince / 30) * 50);
  }

  /**
   * Calculate frequency score
   */
  private calculateFrequencyScore(
    mentionCount: number,
    periodDays: number
  ): number {
    const mentionsPerWeek = (mentionCount / periodDays) * 7;
    return Math.min((mentionsPerWeek / 5) * 100, 100);
  }

  /**
   * Calculate trend
   */
  private calculateTrend(
    conversations: any[],
    groupEvents: any[],
    periodDays: number
  ): 'increasing' | 'stable' | 'decreasing' {
    const allItems = [...conversations, ...groupEvents].sort((a, b) => {
      const dateA = new Date(a.created_at || a.date);
      const dateB = new Date(b.created_at || b.date);
      return dateA.getTime() - dateB.getTime();
    });

    if (allItems.length < 2) return 'stable';

    // Split into two halves
    const midpoint = Math.floor(allItems.length / 2);
    const firstHalf = allItems.slice(0, midpoint);
    const secondHalf = allItems.slice(midpoint);

    const firstHalfRate = firstHalf.length / (periodDays / 2);
    const secondHalfRate = secondHalf.length / (periodDays / 2);

    const change = ((secondHalfRate - firstHalfRate) / firstHalfRate) * 100;

    if (change > 20) return 'increasing';
    if (change < -20) return 'decreasing';
    return 'stable';
  }

  /**
   * Analyze qualitative aspects
   */
  private async analyzeQualitative(
    userId: string,
    organization: Organization,
    conversations: any[],
    journalMentions: any[]
  ): Promise<{ strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] }> {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const opportunities: string[] = [];
    const threats: string[] = [];

    // Analyze based on activity and mentions
    const totalMentions = conversations.length + journalMentions.length;
    
    if (totalMentions > 10) {
      strengths.push('High engagement and activity');
    }
    
    if (organization.members && organization.members.length > 5) {
      strengths.push('Strong member base');
    } else if (organization.members && organization.members.length < 3) {
      weaknesses.push('Small member base');
    }

    if (organization.status === 'active') {
      strengths.push('Active and ongoing');
    } else {
      weaknesses.push('Inactive or dissolved');
    }

    // Look for positive sentiment
    const positiveWords = ['great', 'amazing', 'love', 'enjoy', 'fun', 'helpful'];
    const hasPositiveSentiment = [...conversations, ...journalMentions].some(item => 
      positiveWords.some(word => item.content.toLowerCase().includes(word))
    );

    if (hasPositiveSentiment) {
      strengths.push('Positive experiences and sentiment');
    }

    // Opportunities and threats based on trends
    if (totalMentions < 5) {
      opportunities.push('Potential for increased engagement');
    }

    if (organization.members && organization.members.length > 10) {
      threats.push('Large size may reduce cohesion');
    }

    return { strengths, weaknesses, opportunities, threats };
  }

  /**
   * Calculate role importance
   */
  private calculateRoleImportance(
    organization: Organization,
    involvement: number,
    influence: number
  ): number {
    const userMember = organization.members?.find(m => m.status === 'active');
    const role = userMember?.role?.toLowerCase() || '';
    
    let roleScore = 50; // Base score
    
    // Leadership roles
    if (role.includes('founder') || role.includes('president') || role.includes('captain')) {
      roleScore = 90;
    } else if (role.includes('leader') || role.includes('director') || role.includes('manager')) {
      roleScore = 75;
    } else if (role.includes('coordinator') || role.includes('organizer')) {
      roleScore = 65;
    } else if (role) {
      roleScore = 55; // Has a role but not leadership
    }

    // Combine with involvement and influence
    return (roleScore * 0.5 + involvement * 0.3 + influence * 0.2);
  }

  /**
   * Get days since last mention
   */
  private getDaysSinceLastMention(
    conversations: any[],
    journalMentions: any[]
  ): number {
    const allItems = [...conversations, ...journalMentions];
    if (allItems.length === 0) return 999;

    const mostRecent = allItems.reduce((latest, item) => {
      const itemDate = new Date(item.created_at);
      const latestDate = new Date(latest.created_at);
      return itemDate > latestDate ? item : latest;
    });

    const daysSince = (Date.now() - new Date(mostRecent.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince;
  }
}

export const groupAnalyticsService = new GroupAnalyticsService();

