// =====================================================
// LOCATION ANALYTICS SERVICE
// Purpose: Calculate comprehensive metrics for locations
// =====================================================

import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';
import { entityConfidenceService } from './entityConfidenceService';

export interface LocationAnalytics {
  // Visit metrics
  visit_frequency: number; // 0-100: How often you visit
  recency_score: number; // 0-100: How recently visited
  total_visits: number; // Total visit count
  average_visit_duration?: number; // Average time spent (minutes)
  
  // Importance metrics
  importance_score: number; // 0-100: Overall importance
  priority_score: number; // 0-100: Priority level
  relevance_score: number; // 0-100: Current relevance
  value_score: number; // 0-100: Value the location provides
  
  // Sentiment metrics
  sentiment_score: number; // -100 to 100: Overall sentiment
  comfort_score: number; // 0-100: How comfortable you feel there
  productivity_score: number; // 0-100: Productivity at this location
  social_score: number; // 0-100: Social value
  
  // Activity metrics
  activity_diversity: number; // 0-100: Variety of activities
  engagement_score: number; // 0-100: Your engagement with location
  associated_people_count: number; // People you associate with this location
  
  // Temporal metrics
  first_visited_days_ago: number; // Days since first visit
  trend: 'increasing' | 'stable' | 'decreasing'; // Visit trend
  
  // Context metrics
  primary_purpose: string[]; // Main reasons for visiting (work, social, etc.)
  associated_activities: string[]; // Activities done here
  peak_times?: string[]; // When you visit most
  
  // Qualitative analysis
  strengths: string[]; // What makes this location good
  weaknesses: string[]; // Areas of concern
  opportunities: string[]; // Potential uses
  considerations: string[]; // Things to consider
  
  // Calculated metadata
  calculated_at: string;
  calculation_period_days: number;
}

export class LocationAnalyticsService {
  /**
   * Calculate comprehensive analytics for a location
   */
  async calculateAnalytics(
    userId: string,
    locationId: string,
    location: any
  ): Promise<LocationAnalytics> {
    try {
      const calculationPeriod = 90; // Analyze last 90 days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - calculationPeriod);

      // Get visit history
      const visits = await this.getVisits(userId, locationId, cutoffDate);
      
      // Get journal entries mentioning location
      const journalMentions = await this.getJournalMentions(userId, location, cutoffDate);
      
      // Get conversations mentioning location
      const conversations = await this.getLocationConversations(userId, location, cutoffDate);
      
      // Get associated people
      const associatedPeople = await this.getAssociatedPeople(userId, locationId);
      
      // Calculate base metrics
      const visitCount = visits.length;
      const mentionCount = conversations.length + journalMentions.length;
      
      // Visit frequency
      const visit_frequency = this.calculateVisitFrequency(visitCount, calculationPeriod);
      
      // Recency score
      const recency_score = this.calculateRecencyScore(visits, journalMentions);
      
      // Total visits (from location data or calculated)
      const total_visits = location.visitCount || visitCount;
      
      // Importance metrics
      const importance_score = this.calculateImportanceScore(
        visit_frequency,
        recency_score,
        relevance_score,
        location
      );
      
      const priority_score = this.calculatePriorityScore(
        recency_score,
        visit_frequency,
        location
      );
      
      const relevance_score = this.calculateRelevanceScore(
        visits,
        journalMentions,
        calculationPeriod
      );
      
      const value_score = this.calculateValueScore(
        visits,
        journalMentions,
        conversations,
        location
      );
      
      // Sentiment metrics
      const sentiment_score = this.calculateSentimentScore(
        journalMentions,
        conversations
      );
      
      const comfort_score = this.calculateComfortScore(
        journalMentions,
        conversations,
        visits
      );
      
      const productivity_score = this.calculateProductivityScore(
        journalMentions,
        conversations,
        location
      );
      
      const social_score = this.calculateSocialScore(
        associatedPeople,
        visits,
        journalMentions
      );
      
      // Activity metrics
      const activity_diversity = this.calculateActivityDiversity(
        journalMentions,
        conversations,
        location
      );
      
      const engagement_score = this.calculateEngagementScore(
        visit_frequency,
        recency_score,
        relevance_score
      );
      
      // Temporal metrics
      const first_visited_days_ago = this.calculateFirstVisit(location, visits);
      
      // Trend analysis
      const trend = this.calculateTrend(visits, journalMentions, calculationPeriod);
      
      // Context analysis
      const primary_purpose = this.extractPrimaryPurpose(journalMentions, conversations, location);
      const associated_activities = this.extractActivities(journalMentions, conversations);
      
      // Qualitative analysis
      const { strengths, weaknesses, opportunities, considerations } = this.analyzeQualitative(
        location,
        visits,
        journalMentions,
        associatedPeople
      );

      return {
        visit_frequency: Math.round(visit_frequency),
        recency_score: Math.round(recency_score),
        total_visits,
        visit_frequency,
        importance_score: Math.round(importance_score),
        priority_score: Math.round(priority_score),
        relevance_score: Math.round(relevance_score),
        value_score: Math.round(value_score),
        sentiment_score: Math.round(sentiment_score),
        comfort_score: Math.round(comfort_score),
        productivity_score: Math.round(productivity_score),
        social_score: Math.round(social_score),
        activity_diversity: Math.round(activity_diversity),
        engagement_score: Math.round(engagement_score),
        associated_people_count: associatedPeople.length,
        first_visited_days_ago,
        trend,
        primary_purpose,
        associated_activities,
        strengths,
        weaknesses,
        opportunities,
        considerations,
        calculated_at: new Date().toISOString(),
        calculation_period_days: calculationPeriod,
      };

      // Update entity confidence based on analytics (fire and forget)
      const { entityConfidenceService } = await import('./entityConfidenceService');
      entityConfidenceService
        .updateEntityConfidenceFromAnalytics(userId, locationId, 'LOCATION', result)
        .catch(err => {
          logger.debug({ err, userId, locationId }, 'Failed to update confidence from analytics');
        });

      return result;
    } catch (error) {
      logger.error({ error, userId, locationId }, 'Failed to calculate location analytics');
      throw error;
    }
  }

  /**
   * Get visits to location
   */
  private async getVisits(
    userId: string,
    locationId: string,
    since: Date
  ): Promise<any[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('location_visits')
        .select('*')
        .eq('location_id', locationId)
        .eq('user_id', userId)
        .gte('visited_at', since.toISOString())
        .order('visited_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error({ error }, 'Failed to get visits');
      return [];
    }
  }

  /**
   * Get journal entries mentioning location
   */
  private async getJournalMentions(
    userId: string,
    location: any,
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

      const locationName = location.name.toLowerCase();

      return (data || []).filter(entry => {
        const content = entry.content.toLowerCase();
        return content.includes(locationName);
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get journal mentions');
      return [];
    }
  }

  /**
   * Get conversations mentioning location
   */
  private async getLocationConversations(
    userId: string,
    location: any,
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

      const locationName = location.name.toLowerCase();

      return (data || []).filter(msg => {
        const content = msg.content.toLowerCase();
        return content.includes(locationName);
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get location conversations');
      return [];
    }
  }

  /**
   * Get associated people
   */
  private async getAssociatedPeople(
    userId: string,
    locationId: string
  ): Promise<any[]> {
    try {
      // Get people mentioned in relation to this location
      const { data, error } = await supabaseAdmin
        .from('location_visits')
        .select('related_people')
        .eq('location_id', locationId)
        .eq('user_id', userId);

      if (error) throw error;

      const peopleSet = new Set<string>();
      (data || []).forEach(visit => {
        if (visit.related_people && Array.isArray(visit.related_people)) {
          visit.related_people.forEach((person: string) => peopleSet.add(person));
        }
      });

      return Array.from(peopleSet).map(name => ({ name }));
    } catch (error) {
      logger.error({ error }, 'Failed to get associated people');
      return [];
    }
  }

  /**
   * Calculate visit frequency
   */
  private calculateVisitFrequency(
    visitCount: number,
    periodDays: number
  ): number {
    const visitsPerWeek = (visitCount / periodDays) * 7;
    return Math.min((visitsPerWeek / 5) * 100, 100);
  }

  /**
   * Calculate recency score
   */
  private calculateRecencyScore(
    visits: any[],
    journalMentions: any[]
  ): number {
    const allItems = [...visits, ...journalMentions];
    if (allItems.length === 0) return 0;

    const mostRecent = allItems.reduce((latest, item) => {
      const itemDate = new Date(item.visited_at || item.created_at);
      const latestDate = new Date(latest.visited_at || latest.created_at);
      return itemDate > latestDate ? item : latest;
    });

    const daysSince = (Date.now() - new Date(mostRecent.visited_at || mostRecent.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, 100 - (daysSince / 30) * 50);
  }

  /**
   * Calculate importance score
   */
  private calculateImportanceScore(
    frequency: number,
    recency: number,
    relevance: number,
    location: any
  ): number {
    const frequencyWeight = 0.4;
    const recencyWeight = 0.3;
    const relevanceWeight = 0.3;

    let score = (frequency * frequencyWeight) +
                (recency * recencyWeight) +
                (relevance * relevanceWeight);

    // Visit count boosts importance
    if (location.visitCount && location.visitCount > 20) score += 10;
    if (location.visitCount && location.visitCount > 50) score += 10;

    return Math.min(score, 100);
  }

  /**
   * Calculate priority score
   */
  private calculatePriorityScore(
    recency: number,
    frequency: number,
    location: any
  ): number {
    let score = (recency * 0.5 + frequency * 0.5);

    // Home/work locations have higher priority
    if (location.name.toLowerCase().includes('home') || 
        location.name.toLowerCase().includes('office') ||
        location.name.toLowerCase().includes('work')) {
      score += 20;
    }

    return Math.min(score, 100);
  }

  /**
   * Calculate relevance score
   */
  private calculateRelevanceScore(
    visits: any[],
    journalMentions: any[],
    periodDays: number
  ): number {
    const totalMentions = visits.length + journalMentions.length;
    const daysSinceLastMention = this.getDaysSinceLastMention(visits, journalMentions);
    
    const recencyFactor = Math.max(0, 1 - (daysSinceLastMention / periodDays));
    const frequencyFactor = Math.min(1, totalMentions / 15);
    
    return (recencyFactor * 60 + frequencyFactor * 40);
  }

  /**
   * Calculate value score with sophisticated value indicators
   */
  private calculateValueScore(
    visits: any[],
    journalMentions: any[],
    conversations: any[],
    location: any
  ): number {
    let valueScore = 40; // Base value

    const allItems = [...journalMentions, ...conversations];
    let totalMentions = allItems.length;

    // 1. Positive sentiment analysis (weighted)
    const positiveWords = {
      strong: ['love', 'amazing', 'favorite', 'perfect', 'ideal', 'treasure', 'special'],
      medium: ['great', 'enjoy', 'comfortable', 'productive', 'peaceful', 'nice', 'good'],
      light: ['fine', 'okay', 'decent']
    };
    const negativeWords = {
      strong: ['hate', 'awful', 'terrible', 'worst'],
      medium: ['uncomfortable', 'stressful', 'annoying', 'boring'],
      light: ['meh', 'whatever']
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
      'important to me', 'special place', 'means a lot', 'cherish', 'treasure',
      'feel at home', 'my place', 'safe space', 'sanctuary', 'refuge',
      'productive here', 'creative here', 'inspired here', 'relax here'
    ];
    const valueMentions = allItems.filter(item => {
      const content = (item.content || '').toLowerCase();
      return valueIndicators.some(indicator => content.includes(indicator));
    }).length;
    valueScore += Math.min(valueMentions * 4, 20);

    // 3. Visit frequency value (recent visits worth more)
    const recentVisits = visits.filter(v => {
      const daysAgo = (Date.now() - new Date(v.visited_at).getTime()) / (1000 * 60 * 60 * 24);
      return daysAgo <= 30;
    });
    const visitValue = Math.min(
      (visits.length * 2) + (recentVisits.length * 3),
      25
    );
    valueScore += visitValue;

    // 4. Net sentiment contribution
    const netSentiment = positiveValue - negativeValue;
    if (totalMentions > 0) {
      const sentimentRatio = netSentiment / (totalMentions * 3);
      valueScore += sentimentRatio * 15;
    }

    // 5. Location type value (home/work inherently valuable)
    const locationName = (location.name || '').toLowerCase();
    if (locationName.includes('home') || locationName.includes('house') || locationName.includes('apartment')) {
      valueScore += 10; // Home is valuable
    }
    if (locationName.includes('office') || locationName.includes('work')) {
      valueScore += 8; // Work location valuable
    }

    return Math.max(0, Math.min(valueScore, 100));
  }

  /**
   * Calculate sentiment score
   */
  private calculateSentimentScore(
    journalMentions: any[],
    conversations: any[]
  ): number {
    let positiveCount = 0;
    let negativeCount = 0;

    const positiveWords = ['love', 'great', 'amazing', 'wonderful', 'happy', 'peaceful', 'comfortable'];
    const negativeWords = ['hate', 'awful', 'terrible', 'stressful', 'uncomfortable', 'annoying'];

    [...journalMentions, ...conversations].forEach(item => {
      const content = item.content.toLowerCase();
      positiveCount += positiveWords.filter(w => content.includes(w)).length;
      negativeCount += negativeWords.filter(w => content.includes(w)).length;
    });

    const total = positiveCount + negativeCount;
    if (total === 0) return 0;

    return ((positiveCount - negativeCount) / total) * 100;
  }

  /**
   * Calculate comfort score
   */
  private calculateComfortScore(
    journalMentions: any[],
    conversations: any[],
    visits: any[]
  ): number {
    const comfortIndicators = ['comfortable', 'relaxed', 'peaceful', 'safe', 'cozy', 'homey'];
    let comfortCount = 0;
    let total = journalMentions.length + conversations.length;

    [...journalMentions, ...conversations].forEach(item => {
      const content = item.content.toLowerCase();
      if (comfortIndicators.some(indicator => content.includes(indicator))) {
        comfortCount++;
      }
    });

    if (total === 0) return 50;

    // More visits = more comfortable (familiarity)
    const visitBonus = Math.min(visits.length * 2, 20);

    return Math.min((comfortCount / total) * 80 + visitBonus, 100);
  }

  /**
   * Calculate productivity score
   */
  private calculateProductivityScore(
    journalMentions: any[],
    conversations: any[],
    location: any
  ): number {
    const productivityIndicators = ['work', 'productive', 'focused', 'efficient', 'office', 'study'];
    let productivityCount = 0;
    let total = journalMentions.length + conversations.length;

    [...journalMentions, ...conversations].forEach(item => {
      const content = item.content.toLowerCase();
      if (productivityIndicators.some(indicator => content.includes(indicator))) {
        productivityCount++;
      }
    });

    // Location type affects productivity
    let typeBonus = 0;
    const locationName = location.name.toLowerCase();
    if (locationName.includes('office') || locationName.includes('work') || 
        locationName.includes('library') || locationName.includes('study')) {
      typeBonus = 30;
    }

    if (total === 0) return 50 + typeBonus;

    return Math.min((productivityCount / total) * 70 + typeBonus, 100);
  }

  /**
   * Calculate social score
   */
  private calculateSocialScore(
    associatedPeople: any[],
    visits: any[],
    journalMentions: any[]
  ): number {
    let score = 0;

    // More associated people = more social
    score += Math.min(associatedPeople.length * 10, 40);

    // Social indicators in mentions
    const socialIndicators = ['friends', 'together', 'met', 'social', 'gathering', 'party'];
    let socialMentions = 0;
    journalMentions.forEach(item => {
      const content = item.content.toLowerCase();
      if (socialIndicators.some(indicator => content.includes(indicator))) {
        socialMentions++;
      }
    });

    if (journalMentions.length > 0) {
      score += (socialMentions / journalMentions.length) * 60;
    }

    return Math.min(score, 100);
  }

  /**
   * Calculate activity diversity
   */
  private calculateActivityDiversity(
    journalMentions: any[],
    conversations: any[],
    location: any
  ): number {
    const activities = new Set<string>();
    const activityKeywords: Record<string, string[]> = {
      'work': ['work', 'meeting', 'office', 'desk'],
      'social': ['coffee', 'lunch', 'dinner', 'drinks', 'hang'],
      'exercise': ['gym', 'run', 'workout', 'exercise', 'fitness'],
      'leisure': ['read', 'relax', 'watch', 'music'],
      'shopping': ['shop', 'buy', 'store', 'mall'],
    };

    [...journalMentions, ...conversations].forEach(item => {
      const content = item.content.toLowerCase();
      Object.entries(activityKeywords).forEach(([activity, keywords]) => {
        if (keywords.some(keyword => content.includes(keyword))) {
          activities.add(activity);
        }
      });
    });

    // More diverse activities = higher score
    return Math.min(activities.size * 20, 100);
  }

  /**
   * Calculate engagement score
   */
  private calculateEngagementScore(
    frequency: number,
    recency: number,
    relevance: number
  ): number {
    return (frequency * 0.4 + recency * 0.3 + relevance * 0.3);
  }

  /**
   * Calculate first visit
   */
  private calculateFirstVisit(
    location: any,
    visits: any[]
  ): number {
    if (location.firstVisited) {
      const firstVisit = new Date(location.firstVisited);
      const daysSince = (Date.now() - firstVisit.getTime()) / (1000 * 60 * 60 * 24);
      return Math.floor(daysSince);
    }

    if (visits.length > 0) {
      const oldest = visits.reduce((oldest, visit) => {
        const visitDate = new Date(visit.visited_at);
        const oldestDate = new Date(oldest.visited_at);
        return visitDate < oldestDate ? visit : oldest;
      });

      const daysSince = (Date.now() - new Date(oldest.visited_at).getTime()) / (1000 * 60 * 60 * 24);
      return Math.floor(daysSince);
    }

    return 0;
  }

  /**
   * Calculate trend
   */
  private calculateTrend(
    visits: any[],
    journalMentions: any[],
    periodDays: number
  ): 'increasing' | 'stable' | 'decreasing' {
    const allItems = [...visits, ...journalMentions].sort((a, b) => {
      const dateA = new Date(a.visited_at || a.created_at);
      const dateB = new Date(b.visited_at || b.created_at);
      return dateA.getTime() - dateB.getTime();
    });

    if (allItems.length < 2) return 'stable';

    const midpoint = Math.floor(allItems.length / 2);
    const firstHalf = allItems.slice(0, midpoint);
    const secondHalf = allItems.slice(midpoint);

    const firstHalfRate = firstHalf.length / (periodDays / 2);
    const secondHalfRate = secondHalf.length / (periodDays / 2);

    const change = ((secondHalfRate - firstHalfRate) / (firstHalfRate || 1)) * 100;

    if (change > 20) return 'increasing';
    if (change < -20) return 'decreasing';
    return 'stable';
  }

  /**
   * Extract primary purpose
   */
  private extractPrimaryPurpose(
    journalMentions: any[],
    conversations: any[],
    location: any
  ): string[] {
    const purposes: Set<string> = new Set();
    const purposeKeywords: Record<string, string[]> = {
      'work': ['work', 'office', 'meeting', 'business', 'job'],
      'social': ['coffee', 'lunch', 'dinner', 'friends', 'social', 'hang'],
      'home': ['home', 'living', 'sleep', 'rest'],
      'exercise': ['gym', 'workout', 'run', 'exercise'],
      'shopping': ['shop', 'buy', 'store', 'mall'],
    };

    [...journalMentions, ...conversations].forEach(item => {
      const content = item.content.toLowerCase();
      Object.entries(purposeKeywords).forEach(([purpose, keywords]) => {
        if (keywords.some(keyword => content.includes(keyword))) {
          purposes.add(purpose);
        }
      });
    });

    // Also check location name
    const locationName = location.name.toLowerCase();
    if (locationName.includes('home') || locationName.includes('house')) purposes.add('home');
    if (locationName.includes('office') || locationName.includes('work')) purposes.add('work');
    if (locationName.includes('gym') || locationName.includes('fitness')) purposes.add('exercise');

    return Array.from(purposes);
  }

  /**
   * Extract activities
   */
  private extractActivities(
    journalMentions: any[],
    conversations: any[]
  ): string[] {
    const activities: Set<string> = new Set();
    const activityKeywords: Record<string, string[]> = {
      'work': ['work', 'meeting', 'project', 'task'],
      'social': ['coffee', 'lunch', 'dinner', 'drinks', 'chat', 'talk'],
      'exercise': ['workout', 'run', 'gym', 'exercise'],
      'leisure': ['read', 'watch', 'relax', 'music'],
      'shopping': ['shop', 'buy', 'browse'],
    };

    [...journalMentions, ...conversations].forEach(item => {
      const content = item.content.toLowerCase();
      Object.entries(activityKeywords).forEach(([activity, keywords]) => {
        if (keywords.some(keyword => content.includes(keyword))) {
          activities.add(activity);
        }
      });
    });

    return Array.from(activities);
  }

  /**
   * Analyze qualitative aspects
   */
  private analyzeQualitative(
    location: any,
    visits: any[],
    journalMentions: any[],
    associatedPeople: any[]
  ): { strengths: string[]; weaknesses: string[]; opportunities: string[]; considerations: string[] } {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const opportunities: string[] = [];
    const considerations: string[] = [];

    if (visits.length > 10) {
      strengths.push('Frequently visited location');
    }

    if (associatedPeople.length > 3) {
      strengths.push('Social hub with multiple connections');
    }

    const positiveWords = ['love', 'great', 'comfortable', 'peaceful'];
    const hasPositiveSentiment = journalMentions.some(item =>
      positiveWords.some(word => item.content.toLowerCase().includes(word))
    );

    if (hasPositiveSentiment) {
      strengths.push('Positive associations and experiences');
    }

    if (visits.length < 3) {
      weaknesses.push('Infrequent visits');
    }

    const negativeWords = ['stressful', 'uncomfortable', 'hate'];
    const hasNegativeSentiment = journalMentions.some(item =>
      negativeWords.some(word => item.content.toLowerCase().includes(word))
    );

    if (hasNegativeSentiment) {
      weaknesses.push('Some negative associations');
    }

    if (visits.length < 10 && associatedPeople.length > 0) {
      opportunities.push('Potential for more frequent visits');
    }

    if (associatedPeople.length === 0 && visits.length > 5) {
      considerations.push('Primarily solo visits');
    }

    return { strengths, weaknesses, opportunities, considerations };
  }

  /**
   * Get days since last mention
   */
  private getDaysSinceLastMention(
    visits: any[],
    journalMentions: any[]
  ): number {
    const allItems = [...visits, ...journalMentions];
    if (allItems.length === 0) return 999;

    const mostRecent = allItems.reduce((latest, item) => {
      const itemDate = new Date(item.visited_at || item.created_at);
      const latestDate = new Date(latest.visited_at || latest.created_at);
      return itemDate > latestDate ? item : latest;
    });

    const daysSince = (Date.now() - new Date(mostRecent.visited_at || mostRecent.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince;
  }
}

export const locationAnalyticsService = new LocationAnalyticsService();

