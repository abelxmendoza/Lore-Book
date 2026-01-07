// =====================================================
// CHARACTER ANALYTICS SERVICE
// Purpose: Calculate comprehensive metrics for characters
// =====================================================

import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';
import { entityConfidenceService } from './entityConfidenceService';

export interface CharacterAnalytics {
  // Relationship metrics
  closeness_score: number; // 0-100: How close the relationship is
  relationship_depth: number; // 0-100: Depth of relationship
  interaction_frequency: number; // 0-100: How often you interact
  recency_score: number; // 0-100: How recently interacted
  
  // Influence metrics
  character_influence_on_user: number; // 0-100: How much they influence you
  user_influence_over_character: number; // 0-100: How much you influence them
  
  // Importance metrics
  importance_score: number; // 0-100: Overall importance to user
  priority_score: number; // 0-100: Priority level
  relevance_score: number; // 0-100: Current relevance
  value_score: number; // 0-100: Value they provide
  
  // Social metrics
  sentiment_score: number; // -100 to 100: Overall sentiment (negative to positive)
  trust_score: number; // 0-100: Level of trust
  support_score: number; // 0-100: How supportive they are
  conflict_score: number; // 0-100: Level of conflict/tension
  
  // Activity metrics
  engagement_score: number; // 0-100: Your engagement with them
  activity_level: number; // 0-100: Their activity in your life
  shared_experiences: number; // Count of shared memories/events
  
  // Temporal metrics
  relationship_duration_days: number; // How long you've known them
  trend: 'deepening' | 'stable' | 'weakening'; // Relationship trend
  
  // Qualitative analysis
  strengths: string[]; // What they're good at / positive traits
  weaknesses: string[]; // Areas of concern / negative traits
  opportunities: string[]; // Potential for growth
  risks: string[]; // Potential risks
  
  // Calculated metadata
  calculated_at: string;
  calculation_period_days: number;
}

export class CharacterAnalyticsService {
  /**
   * Calculate comprehensive analytics for a character
   */
  async calculateAnalytics(
    userId: string,
    characterId: string,
    character: any
  ): Promise<CharacterAnalytics> {
    try {
      const calculationPeriod = 90; // Analyze last 90 days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - calculationPeriod);

      // Get conversation data
      const conversations = await this.getCharacterConversations(userId, characterId, character, cutoffDate);
      
      // Get journal entries mentioning the character
      const journalMentions = await this.getJournalMentions(userId, character, cutoffDate);
      
      // Get shared memories
      const sharedMemories = await this.getSharedMemories(userId, characterId, cutoffDate);
      
      // Get relationships
      const relationships = await this.getRelationships(userId, characterId);
      
      // Calculate base metrics
      const mentionCount = conversations.length + journalMentions.length;
      const sharedExperienceCount = sharedMemories.length;
      
      // Closeness score (based on interactions, shared experiences, relationship depth)
      const closeness_score = this.calculateClosenessScore(
        conversations,
        journalMentions,
        sharedMemories,
        relationships,
        character
      );
      
      // Relationship depth
      const relationship_depth = this.calculateRelationshipDepth(
        relationships,
        sharedMemories,
        conversations
      );
      
      // Interaction frequency
      const interaction_frequency = this.calculateInteractionFrequency(
        mentionCount,
        calculationPeriod
      );
      
      // Recency score
      const recency_score = this.calculateRecencyScore(conversations, journalMentions, sharedMemories);
      
      // Influence metrics
      const character_influence_on_user = this.calculateCharacterInfluence(
        conversations,
        journalMentions
      );
      
      const user_influence_over_character = this.calculateUserInfluence(
        conversations,
        relationships
      );
      
      // Importance metrics
      const importance_score = this.calculateImportanceScore(
        closeness_score,
        interaction_frequency,
        relevance_score,
        character
      );
      
      const priority_score = this.calculatePriorityScore(
        recency_score,
        interaction_frequency,
        character
      );
      
      const relevance_score = this.calculateRelevanceScore(
        conversations,
        journalMentions,
        calculationPeriod
      );
      
      const value_score = await this.calculateValueScore(
        userId,
        conversations,
        journalMentions,
        sharedMemories
      );
      
      // Social metrics
      const sentiment_score = this.calculateSentimentScore(
        conversations,
        journalMentions
      );
      
      const trust_score = this.calculateTrustScore(
        conversations,
        journalMentions,
        relationships
      );
      
      const support_score = this.calculateSupportScore(
        conversations,
        journalMentions
      );
      
      const conflict_score = this.calculateConflictScore(
        conversations,
        journalMentions
      );
      
      // Activity metrics
      const engagement_score = this.calculateEngagementScore(
        closeness_score,
        interaction_frequency,
        recency_score
      );
      
      const activity_level = this.calculateActivityLevel(
        mentionCount,
        calculationPeriod
      );
      
      // Relationship duration
      const relationship_duration_days = this.calculateRelationshipDuration(character, sharedMemories);
      
      // Trend analysis
      const trend = this.calculateTrend(conversations, journalMentions, sharedMemories, calculationPeriod);
      
      // Qualitative analysis
      const { strengths, weaknesses, opportunities, risks } = await this.analyzeQualitative(
        userId,
        character,
        conversations,
        journalMentions,
        relationships
      );

      return {
        closeness_score: Math.round(closeness_score),
        relationship_depth: Math.round(relationship_depth),
        interaction_frequency: Math.round(interaction_frequency),
        recency_score: Math.round(recency_score),
        character_influence_on_user: Math.round(character_influence_on_user),
        user_influence_over_character: Math.round(user_influence_over_character),
        importance_score: Math.round(importance_score),
        priority_score: Math.round(priority_score),
        relevance_score: Math.round(relevance_score),
        value_score: Math.round(value_score),
        sentiment_score: Math.round(sentiment_score),
        trust_score: Math.round(trust_score),
        support_score: Math.round(support_score),
        conflict_score: Math.round(conflict_score),
        engagement_score: Math.round(engagement_score),
        activity_level: Math.round(activity_level),
        shared_experiences: sharedExperienceCount,
        relationship_duration_days,
        trend,
        strengths,
        weaknesses,
        opportunities,
        risks,
        calculated_at: new Date().toISOString(),
        calculation_period_days: calculationPeriod,
      };
    } catch (error) {
      logger.error({ error, userId, characterId }, 'Failed to calculate character analytics');
      throw error;
    }
  }

  /**
   * Get conversations mentioning the character
   */
  private async getCharacterConversations(
    userId: string,
    characterId: string,
    character: any,
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

      const characterName = character.name.toLowerCase();
      const aliases = (character.alias || []).map((a: string) => a.toLowerCase());

      return (data || []).filter(msg => {
        const content = msg.content.toLowerCase();
        return content.includes(characterName) || 
               aliases.some((alias: string) => content.includes(alias));
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get character conversations');
      return [];
    }
  }

  /**
   * Get journal entries mentioning the character
   */
  private async getJournalMentions(
    userId: string,
    character: any,
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

      const characterName = character.name.toLowerCase();
      const aliases = (character.alias || []).map((a: string) => a.toLowerCase());

      return (data || []).filter(entry => {
        const content = entry.content.toLowerCase();
        return content.includes(characterName) || 
               aliases.some((alias: string) => content.includes(alias));
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get journal mentions');
      return [];
    }
  }

  /**
   * Get shared memories
   */
  private async getSharedMemories(
    userId: string,
    characterId: string,
    since: Date
  ): Promise<any[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('character_memories')
        .select('*')
        .eq('character_id', characterId)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error({ error }, 'Failed to get shared memories');
      return [];
    }
  }

  /**
   * Get relationships
   */
  private async getRelationships(
    userId: string,
    characterId: string
  ): Promise<any[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('character_relationships')
        .select('*')
        .eq('user_id', userId)
        .or(`source_character_id.eq.${characterId},target_character_id.eq.${characterId}`);

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error({ error }, 'Failed to get relationships');
      return [];
    }
  }

  /**
   * Calculate closeness score with sophisticated multi-factor analysis
   */
  private calculateClosenessScore(
    conversations: any[],
    journalMentions: any[],
    sharedMemories: any[],
    relationships: any[],
    character: any
  ): number {
    let score = 30; // Lower base - requires evidence

    // 1. Shared memories (weighted by recency and emotional depth)
    const recentMemories = sharedMemories.filter(m => {
      const daysAgo = (Date.now() - new Date(m.created_at).getTime()) / (1000 * 60 * 60 * 24);
      return daysAgo <= 30;
    });
    const memoryScore = Math.min(
      (sharedMemories.length * 3) + (recentMemories.length * 5), 
      35
    );
    score += memoryScore;

    // 2. Relationship closeness (exponential scaling for deeper relationships)
    const relationship = relationships[0];
    if (relationship?.closeness_score) {
      const normalizedCloseness = (relationship.closeness_score + 10) / 20; // -10 to 10 -> 0 to 1
      // Exponential curve: deeper relationships matter more
      const closenessBoost = Math.pow(normalizedCloseness, 0.7) * 25;
      score += closenessBoost;
    }

    // 3. Interaction quality (not just frequency)
    const totalMentions = conversations.length + journalMentions.length;
    const avgConversationLength = conversations.reduce((sum, c) => sum + (c.content?.length || 0), 0) / (conversations.length || 1);
    const qualityMultiplier = avgConversationLength > 200 ? 1.5 : avgConversationLength > 100 ? 1.2 : 1.0;
    const interactionScore = Math.min(totalMentions * 1.5 * qualityMultiplier, 20);
    score += interactionScore;

    // 4. Emotional indicators in text
    const emotionalWords = ['love', 'care', 'miss', 'appreciate', 'grateful', 'trust', 'confide', 'support'];
    const emotionalMentions = [...conversations, ...journalMentions].filter(item => {
      const content = (item.content || '').toLowerCase();
      return emotionalWords.some(word => content.includes(word));
    }).length;
    score += Math.min(emotionalMentions * 2, 10);

    // 5. Archetype-based adjustments (contextual)
    const archetypeCloseness: Record<string, number> = {
      'ally': 15,
      'mentor': 12,
      'companion': 18,
      'family': 20,
      'close_friend': 22,
      'rival': -5, // Rivals can still be close
      'self': 25,
      'protagonist': 20,
    };
    score += archetypeCloseness[character.archetype?.toLowerCase() || ''] || 0;

    // 6. Relationship depth indicator
    if (character.relationship_depth === 'close') score += 8;
    if (character.relationship_depth === 'moderate') score += 4;

    // 7. Recency bonus (recent interactions indicate active closeness)
    const mostRecent = [...conversations, ...journalMentions]
      .map(item => new Date(item.created_at).getTime())
      .sort((a, b) => b - a)[0];
    if (mostRecent) {
      const daysSince = (Date.now() - mostRecent) / (1000 * 60 * 60 * 24);
      if (daysSince <= 7) score += 5; // Very recent
      if (daysSince <= 30) score += 3; // Recent
    }

    return Math.max(0, Math.min(score, 100));
  }

  /**
   * Calculate relationship depth with multi-dimensional analysis
   */
  private calculateRelationshipDepth(
    relationships: any[],
    sharedMemories: any[],
    conversations: any[]
  ): number {
    let depth = 20; // Lower base - requires evidence

    // 1. Shared memories (weighted by diversity and recency)
    const uniqueMemoryTypes = new Set(sharedMemories.map(m => m.summary?.substring(0, 50) || 'generic'));
    const memoryDiversityBonus = uniqueMemoryTypes.size > 5 ? 5 : 0;
    depth += Math.min(sharedMemories.length * 2.5 + memoryDiversityBonus, 30);

    // 2. Relationship type depth (hierarchical)
    const relationship = relationships[0];
    if (relationship) {
      const typeDepth: Record<string, number> = {
        'family': 35,
        'close_friend': 28,
        'best_friend': 32,
        'partner': 40,
        'spouse': 45,
        'friend': 18,
        'colleague': 12,
        'mentor': 25,
        'mentee': 20,
        'acquaintance': 8,
        'rival': 15, // Rivals can have depth too
      };
      depth += typeDepth[relationship.relationship_type?.toLowerCase() || ''] || 0;
    }

    // 3. Conversation depth (quality over quantity)
    const avgConversationLength = conversations.reduce((sum, c) => sum + (c.content?.length || 0), 0) / (conversations.length || 1);
    const depthIndicators = ['deep', 'meaningful', 'personal', 'intimate', 'vulnerable', 'honest', 'philosophical'];
    const deepConversations = conversations.filter(c => {
      const content = (c.content || '').toLowerCase();
      return depthIndicators.some(indicator => content.includes(indicator)) || 
             (c.content?.length || 0) > 300;
    }).length;
    
    if (avgConversationLength > 500) depth += 12;
    else if (avgConversationLength > 200) depth += 8;
    else if (avgConversationLength > 100) depth += 4;
    
    depth += Math.min(deepConversations * 2, 10);

    // 4. Temporal depth (longer relationships = deeper)
    const oldestMemory = sharedMemories
      .map(m => new Date(m.created_at).getTime())
      .sort((a, b) => a - b)[0];
    if (oldestMemory) {
      const relationshipDays = (Date.now() - oldestMemory) / (1000 * 60 * 60 * 24);
      if (relationshipDays > 365) depth += 8; // Over a year
      if (relationshipDays > 730) depth += 5; // Over 2 years
    }

    // 5. Closeness score from relationship (if available)
    if (relationship?.closeness_score && relationship.closeness_score > 5) {
      depth += 5; // High closeness indicates depth
    }

    return Math.max(0, Math.min(depth, 100));
  }

  /**
   * Calculate interaction frequency
   */
  private calculateInteractionFrequency(
    mentionCount: number,
    periodDays: number
  ): number {
    const interactionsPerWeek = (mentionCount / periodDays) * 7;
    return Math.min((interactionsPerWeek / 5) * 100, 100);
  }

  /**
   * Calculate recency score
   */
  private calculateRecencyScore(
    conversations: any[],
    journalMentions: any[],
    sharedMemories: any[]
  ): number {
    const allItems = [...conversations, ...journalMentions, ...sharedMemories];
    if (allItems.length === 0) return 0;

    const mostRecent = allItems.reduce((latest, item) => {
      const itemDate = new Date(item.created_at);
      const latestDate = new Date(latest.created_at);
      return itemDate > latestDate ? item : latest;
    });

    const daysSince = (Date.now() - new Date(mostRecent.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, 100 - (daysSince / 30) * 50);
  }

  /**
   * Calculate character influence on user
   */
  private calculateCharacterInfluence(
    conversations: any[],
    journalMentions: any[]
  ): number {
    const influenceIndicators = [
      'influenced', 'inspired', 'changed', 'affected', 'impacted',
      'because of', 'thanks to', 'due to', 'learned from', 'taught me'
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
   * Calculate user influence over character
   */
  private calculateUserInfluence(
    conversations: any[],
    relationships: any[]
  ): number {
    // Look for leadership/guidance language
    const leadershipIndicators = [
      'helped', 'advised', 'guided', 'supported', 'mentored',
      'taught', 'showed', 'led', 'influenced them'
    ];

    let leadershipCount = 0;
    conversations.forEach(conv => {
      const content = conv.content.toLowerCase();
      if (leadershipIndicators.some(indicator => content.includes(indicator))) {
        leadershipCount++;
      }
    });

    // Role-based influence
    const relationship = relationships[0];
    let roleBonus = 0;
    if (relationship) {
      const roleInfluence: Record<string, number> = {
        'mentor': 40,
        'teacher': 35,
        'parent': 30,
        'boss': 25,
        'friend': 10,
      };
      roleBonus = roleInfluence[relationship.relationship_type || ''] || 0;
    }

    const baseScore = conversations.length > 0 
      ? Math.min((leadershipCount / conversations.length) * 60, 60)
      : 0;

    return Math.min(baseScore + roleBonus, 100);
  }

  /**
   * Calculate importance score
   */
  private calculateImportanceScore(
    closeness: number,
    frequency: number,
    relevance: number,
    character: any
  ): number {
    const closenessWeight = 0.4;
    const frequencyWeight = 0.3;
    const relevanceWeight = 0.3;

    let score = (closeness * closenessWeight) +
                (frequency * frequencyWeight) +
                (relevance * relevanceWeight);

    // Archetype importance
    const archetypeImportance: Record<string, number> = {
      'self': 30,
      'ally': 20,
      'mentor': 15,
      'companion': 15,
    };
    score += archetypeImportance[character.archetype || ''] || 0;

    // Importance level from metadata
    const importanceLevel = character.importance_level;
    const levelBonus: Record<string, number> = {
      'protagonist': 20,
      'major': 15,
      'supporting': 10,
      'minor': 5,
    };
    score += levelBonus[importanceLevel || ''] || 0;

    return Math.min(score, 100);
  }

  /**
   * Calculate priority score
   */
  private calculatePriorityScore(
    recency: number,
    frequency: number,
    character: any
  ): number {
    let score = (recency * 0.5 + frequency * 0.5);

    // Active status increases priority
    if (character.status === 'active') {
      score += 20;
    }

    // High importance increases priority
    if (character.importance_level === 'protagonist' || character.importance_level === 'major') {
      score += 15;
    }

    return Math.min(score, 100);
  }

  /**
   * Calculate relevance score
   */
  private calculateRelevanceScore(
    conversations: any[],
    journalMentions: any[],
    periodDays: number
  ): number {
    const totalMentions = conversations.length + journalMentions.length;
    const daysSinceLastMention = this.getDaysSinceLastMention(conversations, journalMentions);
    
    const recencyFactor = Math.max(0, 1 - (daysSinceLastMention / periodDays));
    const frequencyFactor = Math.min(1, totalMentions / 20);
    
    return (recencyFactor * 60 + frequencyFactor * 40);
  }

  /**
   * Calculate value score with sophisticated value indicators
   */
  private async calculateValueScore(
    userId: string,
    conversations: any[],
    journalMentions: any[],
    sharedMemories: any[]
  ): Promise<number> {
    let valueScore = 40; // Base value

    // Phase 4: Filter to only CANON entries
    const canonConversations = conversations.filter(item => {
      // Check if item has canon_status or check via EntryIR
      return item.canon_status === 'CANON' || item.canon_status === undefined; // undefined = assume CANON for backward compat
    });
    const canonJournalMentions = journalMentions.filter(item => {
      return item.canon_status === 'CANON' || item.canon_status === undefined;
    });

    // BRRE: Apply belief weights to items
    const allItems = await this.applyBeliefWeights(userId, [...canonConversations, ...canonJournalMentions]);
    let totalMentions = allItems.length;

    // 1. Positive sentiment analysis (weighted)
    const positiveWords = {
      strong: ['love', 'amazing', 'incredible', 'best', 'favorite', 'treasure', 'cherish'],
      medium: ['great', 'enjoy', 'helpful', 'supportive', 'valuable', 'appreciate', 'grateful'],
      light: ['good', 'nice', 'pleasant', 'fine', 'okay']
    };
    const negativeWords = {
      strong: ['hate', 'awful', 'terrible', 'worst', 'horrible'],
      medium: ['bad', 'annoying', 'difficult', 'frustrating', 'disappointing'],
      light: ['boring', 'meh', 'whatever']
    };

    let positiveValue = 0;
    let negativeValue = 0;

    allItems.forEach(item => {
      const content = (item.content || '').toLowerCase();
      
      // Strong positive = 3 points, medium = 2, light = 1
      positiveWords.strong.forEach(w => { if (content.includes(w)) positiveValue += 3; });
      positiveWords.medium.forEach(w => { if (content.includes(w)) positiveValue += 2; });
      positiveWords.light.forEach(w => { if (content.includes(w)) positiveValue += 1; });
      
      // Strong negative = -3, medium = -2, light = -1
      negativeWords.strong.forEach(w => { if (content.includes(w)) negativeValue += 3; });
      negativeWords.medium.forEach(w => { if (content.includes(w)) negativeValue += 2; });
      negativeWords.light.forEach(w => { if (content.includes(w)) negativeValue += 1; });
    });

    // 2. Value indicators (explicit value statements)
    const valueIndicators = [
      'learned from', 'taught me', 'helped me', 'supported me', 'inspired me',
      'changed my', 'impacted my', 'influenced my', 'made me', 'gave me',
      'worth it', 'worthwhile', 'meaningful', 'important to me'
    ];
    const valueMentions = allItems.filter(item => {
      const content = (item.content || '').toLowerCase();
      return valueIndicators.some(indicator => content.includes(indicator));
    }).length;
    valueScore += Math.min(valueMentions * 4, 20);

    // 3. Shared memories value (recent memories worth more)
    const recentMemories = sharedMemories.filter(m => {
      const daysAgo = (Date.now() - new Date(m.created_at).getTime()) / (1000 * 60 * 60 * 24);
      return daysAgo <= 90;
    });
    const memoryValue = Math.min(
      (sharedMemories.length * 2) + (recentMemories.length * 3),
      25
    );
    valueScore += memoryValue;

    // 4. Net sentiment contribution
    const netSentiment = positiveValue - negativeValue;
    if (totalMentions > 0) {
      const sentimentRatio = netSentiment / (totalMentions * 3); // Normalize by max possible
      valueScore += sentimentRatio * 15;
    }

    // 5. Reciprocity indicators (mutual value)
    const reciprocityWords = ['helped each other', 'mutual', 'both', 'together', 'we'];
    const reciprocityCount = allItems.filter(item => {
      const content = (item.content || '').toLowerCase();
      return reciprocityWords.some(word => content.includes(word));
    }).length;
    valueScore += Math.min(reciprocityCount * 2, 10);

    return Math.max(0, Math.min(valueScore, 100));
  }

  /**
   * Calculate sentiment score (-100 to 100)
   */
  private calculateSentimentScore(
    conversations: any[],
    journalMentions: any[]
  ): number {
    let positiveCount = 0;
    let negativeCount = 0;

    const positiveWords = ['love', 'great', 'amazing', 'wonderful', 'happy', 'glad', 'appreciate', 'grateful'];
    const negativeWords = ['hate', 'awful', 'terrible', 'sad', 'angry', 'frustrated', 'disappointed', 'upset'];

    [...conversations, ...journalMentions].forEach(item => {
      const content = item.content.toLowerCase();
      positiveCount += positiveWords.filter(w => content.includes(w)).length;
      negativeCount += negativeWords.filter(w => content.includes(w)).length;
    });

    const total = positiveCount + negativeCount;
    if (total === 0) return 0;

    // Normalize to -100 to 100
    return ((positiveCount - negativeCount) / total) * 100;
  }

  /**
   * Calculate trust score with sophisticated trust indicators
   */
  private calculateTrustScore(
    conversations: any[],
    journalMentions: any[],
    relationships: any[]
  ): number {
    let score = 40; // Lower base - requires evidence

    // 1. Explicit trust indicators (weighted)
    const trustIndicators = {
      strong: ['trust completely', 'trust with', 'confide in', 'tell secrets', 'rely on', 'depend on'],
      medium: ['trust', 'reliable', 'dependable', 'confide', 'secret', 'private', 'trustworthy'],
      light: ['believe', 'count on', 'trustworthy']
    };
    
    let trustValue = 0;
    [...conversations, ...journalMentions].forEach(item => {
      const content = (item.content || '').toLowerCase();
      trustIndicators.strong.forEach(indicator => { if (content.includes(indicator)) trustValue += 3; });
      trustIndicators.medium.forEach(indicator => { if (content.includes(indicator)) trustValue += 2; });
      trustIndicators.light.forEach(indicator => { if (content.includes(indicator)) trustValue += 1; });
    });
    score += Math.min(trustValue * 3, 30);

    // 2. Relationship type affects trust (hierarchical)
    const relationship = relationships[0];
    if (relationship) {
      const typeTrust: Record<string, number> = {
        'family': 25,
        'spouse': 30,
        'partner': 28,
        'close_friend': 18,
        'best_friend': 20,
        'mentor': 15,
        'friend': 10,
        'colleague': 8,
        'acquaintance': 5,
      };
      score += typeTrust[relationship.relationship_type?.toLowerCase() || ''] || 0;
    }

    // 3. Vulnerability indicators (sharing personal info = trust)
    const vulnerabilityIndicators = ['vulnerable', 'opened up', 'shared personal', 'told them about', 'opened up to'];
    const vulnerabilityCount = [...conversations, ...journalMentions].filter(item => {
      const content = (item.content || '').toLowerCase();
      return vulnerabilityIndicators.some(indicator => content.includes(indicator));
    }).length;
    score += Math.min(vulnerabilityCount * 2, 10);

    // 4. Consistency indicators (consistent behavior = trust)
    const consistencyIndicators = ['always there', 'consistently', 'never let me down', 'always reliable'];
    const consistencyCount = [...conversations, ...journalMentions].filter(item => {
      const content = (item.content || '').toLowerCase();
      return consistencyIndicators.some(indicator => content.includes(indicator));
    }).length;
    score += Math.min(consistencyCount * 2, 10);

    return Math.max(0, Math.min(score, 100));
  }

  /**
   * Calculate support score with sophisticated support indicators
   */
  private calculateSupportScore(
    conversations: any[],
    journalMentions: any[]
  ): number {
    let score = 40; // Base support

    // 1. Explicit support indicators (weighted by strength)
    const supportIndicators = {
      strong: ['always there for me', 'supported me through', 'helped me through', 'stood by me', 'had my back', 'backed me up'],
      medium: ['support', 'helped', 'there for me', 'backed me', 'stood by', 'encouraged', 'cheered', 'comforted'],
      light: ['listened', 'understood', 'was there', 'helped out']
    };

    let supportValue = 0;
    [...conversations, ...journalMentions].forEach(item => {
      const content = (item.content || '').toLowerCase();
      supportIndicators.strong.forEach(indicator => { if (content.includes(indicator)) supportValue += 3; });
      supportIndicators.medium.forEach(indicator => { if (content.includes(indicator)) supportValue += 2; });
      supportIndicators.light.forEach(indicator => { if (content.includes(indicator)) supportValue += 1; });
    });
    score += Math.min(supportValue * 4, 35);

    // 2. Emotional support indicators
    const emotionalSupport = ['comforted', 'listened', 'understood', 'empathized', 'validated', 'reassured'];
    const emotionalCount = [...conversations, ...journalMentions].filter(item => {
      const content = (item.content || '').toLowerCase();
      return emotionalSupport.some(indicator => content.includes(indicator));
    }).length;
    score += Math.min(emotionalCount * 2, 15);

    // 3. Practical support indicators
    const practicalSupport = ['helped with', 'assisted', 'lent a hand', 'pitched in', 'gave advice', 'guided'];
    const practicalCount = [...conversations, ...journalMentions].filter(item => {
      const content = (item.content || '').toLowerCase();
      return practicalSupport.some(indicator => content.includes(indicator));
    }).length;
    score += Math.min(practicalCount * 2, 10);

    return Math.max(0, Math.min(score, 100));
  }

  /**
   * Calculate conflict score
   */
  private calculateConflictScore(
    conversations: any[],
    journalMentions: any[]
  ): number {
    const conflictIndicators = [
      'argued', 'fought', 'disagreed', 'conflict', 'tension',
      'upset with', 'angry at', 'frustrated with', 'disappointed in'
    ];

    let conflictCount = 0;
    [...conversations, ...journalMentions].forEach(item => {
      const content = item.content.toLowerCase();
      if (conflictIndicators.some(indicator => content.includes(indicator))) {
        conflictCount++;
      }
    });

    const total = conversations.length + journalMentions.length;
    if (total === 0) return 0;

    return Math.min((conflictCount / total) * 100, 100);
  }

  /**
   * Calculate engagement score
   */
  private calculateEngagementScore(
    closeness: number,
    frequency: number,
    recency: number
  ): number {
    return (closeness * 0.4 + frequency * 0.3 + recency * 0.3);
  }

  /**
   * Calculate activity level
   */
  private calculateActivityLevel(
    mentionCount: number,
    periodDays: number
  ): number {
    const mentionsPerWeek = (mentionCount / periodDays) * 7;
    return Math.min((mentionsPerWeek / 5) * 100, 100);
  }

  /**
   * Calculate relationship duration
   */
  private calculateRelationshipDuration(
    character: any,
    sharedMemories: any[]
  ): number {
    if (character.first_appearance) {
      const firstAppearance = new Date(character.first_appearance);
      const daysSince = (Date.now() - firstAppearance.getTime()) / (1000 * 60 * 60 * 24);
      return Math.floor(daysSince);
    }

    // Fallback: use oldest shared memory
    if (sharedMemories.length > 0) {
      const oldest = sharedMemories.reduce((oldest, mem) => {
        const memDate = new Date(mem.created_at);
        const oldestDate = new Date(oldest.created_at);
        return memDate < oldestDate ? mem : oldest;
      });

      const daysSince = (Date.now() - new Date(oldest.created_at).getTime()) / (1000 * 60 * 60 * 24);
      return Math.floor(daysSince);
    }

    return 0;
  }

  /**
   * Calculate trend
   */
  private calculateTrend(
    conversations: any[],
    journalMentions: any[],
    sharedMemories: any[],
    periodDays: number
  ): 'deepening' | 'stable' | 'weakening' {
    const allItems = [...conversations, ...journalMentions, ...sharedMemories].sort((a, b) => {
      const dateA = new Date(a.created_at);
      const dateB = new Date(b.created_at);
      return dateA.getTime() - dateB.getTime();
    });

    if (allItems.length < 2) return 'stable';

    const midpoint = Math.floor(allItems.length / 2);
    const firstHalf = allItems.slice(0, midpoint);
    const secondHalf = allItems.slice(midpoint);

    const firstHalfRate = firstHalf.length / (periodDays / 2);
    const secondHalfRate = secondHalf.length / (periodDays / 2);

    const change = ((secondHalfRate - firstHalfRate) / (firstHalfRate || 1)) * 100;

    if (change > 20) return 'deepening';
    if (change < -20) return 'weakening';
    return 'stable';
  }

  /**
   * Analyze qualitative aspects
   */
  private async analyzeQualitative(
    userId: string,
    character: any,
    conversations: any[],
    journalMentions: any[],
    relationships: any[]
  ): Promise<{ strengths: string[]; weaknesses: string[]; opportunities: string[]; risks: string[] }> {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const opportunities: string[] = [];
    const risks: string[] = [];

    const totalMentions = conversations.length + journalMentions.length;
    
    // Strengths based on positive sentiment
    const positiveWords = ['great', 'amazing', 'love', 'helpful', 'supportive'];
    const hasPositiveSentiment = [...conversations, ...journalMentions].some(item => 
      positiveWords.some(word => item.content.toLowerCase().includes(word))
    );

    if (hasPositiveSentiment) {
      strengths.push('Positive relationship and interactions');
    }

    if (totalMentions > 10) {
      strengths.push('High engagement and frequent interactions');
    }

    // Relationship-based strengths
    const relationship = relationships[0];
    if (relationship) {
      if (relationship.relationship_type === 'close_friend' || relationship.relationship_type === 'family') {
        strengths.push('Close personal connection');
      }
      if (relationship.closeness_score && relationship.closeness_score > 5) {
        strengths.push('Strong emotional bond');
      }
    }

    // Weaknesses
    if (totalMentions < 3) {
      weaknesses.push('Low interaction frequency');
    }

    const negativeWords = ['conflict', 'tension', 'disagreement', 'upset'];
    const hasConflict = [...conversations, ...journalMentions].some(item =>
      negativeWords.some(word => item.content.toLowerCase().includes(word))
    );

    if (hasConflict) {
      weaknesses.push('Occasional conflicts or tensions');
    }

    // Opportunities
    if (totalMentions < 10) {
      opportunities.push('Potential for deeper connection');
    }

    // Risks
    if (hasConflict && totalMentions > 5) {
      risks.push('Ongoing relationship challenges');
    }

    return { strengths, weaknesses, opportunities, risks };
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

  /**
   * Apply BRRE belief weights to items (journal mentions, conversations)
   * Contradicted/abandoned beliefs get low weight, supported get high weight
   */
  private async applyBeliefWeights(
    userId: string,
    items: any[]
  ): Promise<any[]> {
    try {
      const { beliefRealityReconciliationService } = await import('./beliefRealityReconciliationService');
      
      // Get knowledge unit IDs from items (if they have them)
      const knowledgeUnitIds: string[] = [];
      const itemToUnitMap = new Map<number, string>();

      items.forEach((item, index) => {
        const knowledgeUnitId = item.metadata?.knowledge_unit_id || 
                               item.knowledge_unit_id ||
                               item.ir?.metadata?.knowledge_unit_id;
        if (knowledgeUnitId) {
          knowledgeUnitIds.push(knowledgeUnitId);
          itemToUnitMap.set(index, knowledgeUnitId);
        }
      });

      if (knowledgeUnitIds.length === 0) {
        return items; // No knowledge units to weight
      }

      // Batch get weights
      const weights = await beliefRealityReconciliationService.batchGetAnalyticsWeights(
        userId,
        knowledgeUnitIds
      );

      // Apply weights: filter out low-weight items (contradicted/abandoned)
      const weightedItems = items.map((item, index) => {
        const knowledgeUnitId = itemToUnitMap.get(index);
        if (knowledgeUnitId && weights[knowledgeUnitId] !== undefined) {
          const weight = weights[knowledgeUnitId];
          // Only include items with weight >= 0.5 (exclude contradicted/abandoned)
          if (weight < 0.5) {
            return null; // Filter out
          }
          // Apply weight multiplier for partial support
          return {
            ...item,
            _beliefWeight: weight,
          };
        }
        return item; // No weight, include as-is
      }).filter(item => item !== null);

      return weightedItems;
    } catch (error) {
      logger.debug({ error }, 'Failed to apply belief weights, using items as-is');
      return items; // Fallback: return items unchanged
    }
  }
}

export const characterAnalyticsService = new CharacterAnalyticsService();

