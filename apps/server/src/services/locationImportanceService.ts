import OpenAI from 'openai';
import { differenceInDays, differenceInMonths, differenceInYears } from 'date-fns';

import { config } from '../config';
import { logger } from '../logger';

import { supabaseAdmin } from './supabaseClient';

const openai = new OpenAI({ apiKey: config.openAiKey });

export type LocationImportanceLevel = 'essential' | 'major' | 'supporting' | 'minor' | 'ephemeral';

export type LocationImportanceCriteria = {
  visitCount: number; // Total number of visits/mentions
  visitFrequency: number; // Visits per month
  recency: number; // Days since last visit (lower = more recent)
  emotionalSignificance: number; // 0-1 based on emotional content
  eventSignificance: number; // 0-1 based on memorable events
  culturalSignificance: number; // 0-1 based on cultural/social importance
  consistency: number; // 0-1 based on regularity of visits
  durationOfRelevance: number; // Days from first to last mention
  relationshipToEntities: number; // 0-1 based on connection to home/job/important places
  lastVisitDate?: Date;
  firstVisitDate?: Date;
};

export type LocationImportance = {
  importanceLevel: LocationImportanceLevel;
  importanceScore: number; // 0-100
  criteria: LocationImportanceCriteria;
  reasoning: string;
};

class LocationImportanceService {
  /**
   * Calculate importance level and score for a location
   */
  async calculateImportance(
    userId: string,
    locationId: string,
    criteria: Partial<LocationImportanceCriteria>
  ): Promise<LocationImportance> {
    try {
      // Get full criteria by fetching from database if not provided
      const fullCriteria = await this.gatherCriteria(userId, locationId, criteria);

      // Calculate base score
      const baseScore = this.calculateBaseScore(fullCriteria);

      // Use AI to determine importance level with context
      const importanceLevel = await this.determineImportanceLevel(
        userId,
        locationId,
        fullCriteria,
        baseScore
      );

      // Final score (0-100)
      const importanceScore = Math.min(100, Math.max(0, baseScore));

      return {
        importanceLevel,
        importanceScore,
        criteria: fullCriteria,
        reasoning: this.generateReasoning(fullCriteria, importanceLevel)
      };
    } catch (error) {
      logger.error({ error, locationId }, 'Failed to calculate location importance');
      // Default to minor if calculation fails
      return {
        importanceLevel: 'minor',
        importanceScore: 10,
        criteria: criteria as LocationImportanceCriteria,
        reasoning: 'Unable to calculate importance'
      };
    }
  }

  /**
   * Gather all criteria for importance calculation
   */
  private async gatherCriteria(
    userId: string,
    locationId: string,
    providedCriteria: Partial<LocationImportanceCriteria>
  ): Promise<LocationImportanceCriteria> {
    // Get location info
    const { data: location } = await supabaseAdmin
      .from('locations')
      .select('name, type, metadata, associated_character_ids, event_context')
      .eq('id', locationId)
      .eq('user_id', userId)
      .single();

    // Count visits/mentions in journal entries
    const { count: visitCount } = await supabaseAdmin
      .from('journal_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .or(`content.ilike.%${location?.name}%,metadata->locations.cs.["${locationId}"]`);

    // Get location mentions
    const { data: mentions } = await supabaseAdmin
      .from('location_mentions')
      .select('created_at, memory_id')
      .eq('user_id', userId)
      .eq('location_id', locationId)
      .order('created_at', { ascending: true });

    // Get first and last visit dates
    const firstMention = mentions?.[0];
    const lastMention = mentions?.[mentions.length - 1];
    
    const firstVisitDate = firstMention?.created_at ? new Date(firstMention.created_at) : undefined;
    const lastVisitDate = lastMention?.created_at ? new Date(lastMention.created_at) : undefined;

    // Calculate recency (days since last visit)
    const recency = lastVisitDate 
      ? differenceInDays(new Date(), lastVisitDate)
      : 999; // Very old if never visited

    // Calculate duration of relevance
    const durationOfRelevance = (firstVisitDate && lastVisitDate)
      ? differenceInDays(lastVisitDate, firstVisitDate)
      : 0;

    // Calculate visit frequency (visits per month since first mention)
    const daysSinceFirst = firstVisitDate 
      ? (Date.now() - firstVisitDate.getTime()) / (1000 * 60 * 60 * 24)
      : 30;
    const monthsSinceFirst = Math.max(1, daysSinceFirst / 30);
    const visitFrequency = (visitCount || 0) / monthsSinceFirst;

    // Calculate consistency (regularity of visits)
    const consistency = this.calculateConsistency(mentions || []);

    // Check for emotional significance (mentions with emotional words)
    const emotionalSignificance = await this.calculateEmotionalSignificance(userId, locationId, location?.name || '');

    // Check for event significance (memorable events)
    const eventSignificance = location?.event_context ? 0.8 : 0.3;

    // Check for cultural significance (recurring events, fliers, scene venue)
    const culturalSignificance = await this.calculateCulturalSignificance(userId, locationId, location?.name || '');

    // Calculate relationship to entities (home, job, etc.)
    const relationshipToEntities = this.calculateRelationshipToEntities(location);

    return {
      visitCount: providedCriteria.visitCount ?? (visitCount || 0),
      visitFrequency: providedCriteria.visitFrequency ?? visitFrequency,
      recency: providedCriteria.recency ?? recency,
      emotionalSignificance: providedCriteria.emotionalSignificance ?? emotionalSignificance,
      eventSignificance: providedCriteria.eventSignificance ?? eventSignificance,
      culturalSignificance: providedCriteria.culturalSignificance ?? culturalSignificance,
      consistency: providedCriteria.consistency ?? consistency,
      durationOfRelevance: providedCriteria.durationOfRelevance ?? durationOfRelevance,
      relationshipToEntities: providedCriteria.relationshipToEntities ?? relationshipToEntities,
      lastVisitDate,
      firstVisitDate
    };
  }

  /**
   * Calculate consistency (regularity of visits)
   */
  private calculateConsistency(mentions: Array<{ created_at: string }>): number {
    if (mentions.length < 2) return 0.5; // Can't determine consistency with < 2 visits

    // Calculate variance in time between visits
    const intervals: number[] = [];
    for (let i = 1; i < mentions.length; i++) {
      const prev = new Date(mentions[i - 1].created_at).getTime();
      const curr = new Date(mentions[i].created_at).getTime();
      intervals.push(curr - prev);
    }

    if (intervals.length === 0) return 0.5;

    // Calculate coefficient of variation (lower = more consistent)
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 1;

    // Lower CV = higher consistency (inverse relationship)
    return Math.max(0, Math.min(1, 1 - (cv * 0.5)));
  }

  /**
   * Calculate emotional significance
   */
  private async calculateEmotionalSignificance(
    userId: string,
    locationId: string,
    locationName: string
  ): Promise<number> {
    // Check journal entries for emotional content
    const { data: entries } = await supabaseAdmin
      .from('journal_entries')
      .select('content, emotions')
      .eq('user_id', userId)
      .or(`content.ilike.%${locationName}%,metadata->locations.cs.["${locationId}"]`)
      .limit(20);

    if (!entries || entries.length === 0) return 0.3;

    // Count entries with emotional content
    const emotionalWords = ['love', 'hate', 'angry', 'happy', 'sad', 'excited', 'anxious', 'obsessed', 'crush', 'memorable', 'significant'];
    let emotionalCount = 0;

    for (const entry of entries) {
      const content = (entry.content || '').toLowerCase();
      const hasEmotion = emotionalWords.some(word => content.includes(word));
      if (hasEmotion || (entry.emotions && Array.isArray(entry.emotions) && entry.emotions.length > 0)) {
        emotionalCount++;
      }
    }

    return Math.min(1, emotionalCount / entries.length);
  }

  /**
   * Calculate cultural significance
   */
  private async calculateCulturalSignificance(
    userId: string,
    locationId: string,
    locationName: string
  ): Promise<number> {
    // Check for indicators of cultural significance
    const { data: entries } = await supabaseAdmin
      .from('journal_entries')
      .select('content')
      .eq('user_id', userId)
      .or(`content.ilike.%${locationName}%,metadata->locations.cs.["${locationId}"]`)
      .limit(20);

    if (!entries || entries.length === 0) return 0.2;

    const culturalIndicators = ['show', 'concert', 'event', 'scene', 'flier', 'flyer', 'venue', 'regular', 'always', 'recurring'];
    let culturalCount = 0;

    for (const entry of entries) {
      const content = (entry.content || '').toLowerCase();
      const hasCultural = culturalIndicators.some(word => content.includes(word));
      if (hasCultural) {
        culturalCount++;
      }
    }

    return Math.min(1, culturalCount / entries.length * 2); // Boost cultural significance
  }

  /**
   * Calculate relationship to important entities
   */
  private calculateRelationshipToEntities(location: any): number {
    if (!location) return 0.3;

    const name = (location.name || '').toLowerCase();
    const type = (location.type || '').toLowerCase();

    // Essential locations
    if (name.includes('home') || name.includes('house') || name.includes('apartment') || type === 'home') {
      return 1.0; // Always home = essential
    }

    if (name.includes('work') || name.includes('job') || name.includes('office') || type === 'work') {
      return 0.95; // Job = very important
    }

    // Regular gyms (BJJ, lifting)
    if (name.includes('gym') || name.includes('bjj') || name.includes('jiu jitsu') || type === 'gym') {
      return 0.7; // Regular activity location
    }

    // School/college (temporary but significant)
    if (name.includes('college') || name.includes('school') || name.includes('university') || type === 'education') {
      return 0.6; // Educational institution
    }

    return 0.3; // Default
  }

  /**
   * Calculate base importance score (0-100)
   */
  private calculateBaseScore(criteria: LocationImportanceCriteria): number {
    let score = 0;

    // Visit count (0-25 points) - logarithmic scale
    score += Math.min(25, Math.log10(Math.max(1, criteria.visitCount)) * 8);

    // Visit frequency (0-20 points)
    score += Math.min(20, criteria.visitFrequency * 2);

    // Recency bonus (0-15 points) - more recent = higher score
    const recencyScore = criteria.recency < 7 ? 15 : // Within a week
                        criteria.recency < 30 ? 10 : // Within a month
                        criteria.recency < 90 ? 5 : 0; // Within 3 months
    score += recencyScore;

    // Emotional significance (0-15 points)
    score += criteria.emotionalSignificance * 15;

    // Event significance (0-10 points)
    score += criteria.eventSignificance * 10;

    // Cultural significance (0-8 points)
    score += criteria.culturalSignificance * 8;

    // Consistency (0-5 points)
    score += criteria.consistency * 5;

    // Relationship to entities (0-2 points) - bonus for home/job
    score += criteria.relationshipToEntities * 2;

    // Duration of relevance bonus (0-5 points) - longer relevance = more important
    if (criteria.durationOfRelevance > 365) {
      score += 5; // Over a year
    } else if (criteria.durationOfRelevance > 180) {
      score += 3; // Over 6 months
    } else if (criteria.durationOfRelevance > 30) {
      score += 1; // Over a month
    }

    return score;
  }

  /**
   * Determine importance level using AI
   */
  private async determineImportanceLevel(
    userId: string,
    locationId: string,
    criteria: LocationImportanceCriteria,
    baseScore: number
  ): Promise<LocationImportanceLevel> {
    try {
      const { data: location } = await supabaseAdmin
        .from('locations')
        .select('name, type, metadata, event_context')
        .eq('id', locationId)
        .eq('user_id', userId)
        .single();

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: `Determine the importance level of a location based on the user's relationship with it.

Importance Levels:
- **essential**: Always present locations (home, job) - user is there constantly
- **major**: Frequently visited, emotionally significant, or culturally important (regular gym, memorable venue)
- **supporting**: Regularly visited but less central (college for a semester, regular cafe)
- **minor**: Occasionally visited, some significance
- **ephemeral**: Visited once or twice, forgettable, no lasting significance

Consider:
- Visit frequency: ${criteria.visitFrequency.toFixed(2)} visits/month
- Visit count: ${criteria.visitCount} total visits
- Recency: ${criteria.recency} days since last visit
- Emotional significance: ${(criteria.emotionalSignificance * 100).toFixed(0)}%
- Event significance: ${(criteria.eventSignificance * 100).toFixed(0)}%
- Cultural significance: ${(criteria.culturalSignificance * 100).toFixed(0)}%
- Consistency: ${(criteria.consistency * 100).toFixed(0)}%
- Duration: ${criteria.durationOfRelevance} days of relevance

Return only the importance level (essential, major, supporting, minor, or ephemeral).`
          },
          {
            role: 'user',
            content: `Location: ${location?.name}
Type: ${location?.type || 'unknown'}
Event context: ${location?.event_context || 'none'}
Base Score: ${baseScore.toFixed(1)}/100

Determine importance level:`
          }
        ]
      });

      const level = completion.choices[0]?.message?.content?.trim().toLowerCase();
      
      if (level === 'essential' || level === 'major' || level === 'supporting' || level === 'minor' || level === 'ephemeral') {
        return level;
      }

      // Fallback to score-based classification
      return this.scoreBasedClassification(baseScore, criteria);
    } catch (error) {
      logger.warn({ error, locationId }, 'AI importance classification failed, using score-based');
      return this.scoreBasedClassification(baseScore, criteria);
    }
  }

  /**
   * Fallback classification based on score
   */
  private scoreBasedClassification(
    score: number,
    criteria: LocationImportanceCriteria
  ): LocationImportanceLevel {
    // Essential: home, job (relationshipToEntities = 1.0)
    if (criteria.relationshipToEntities >= 0.9) {
      return 'essential';
    }

    // Major: high score or high emotional/cultural significance
    if (score >= 60 || criteria.emotionalSignificance > 0.7 || criteria.culturalSignificance > 0.7) {
      return 'major';
    }

    // Supporting: moderate score, regular visits
    if (score >= 40 || criteria.visitFrequency > 2) {
      return 'supporting';
    }

    // Minor: some visits but low significance
    if (score >= 20 || criteria.visitCount > 1) {
      return 'minor';
    }

    // Ephemeral: visited once, forgettable
    return 'ephemeral';
  }

  /**
   * Generate reasoning for importance level
   */
  private generateReasoning(criteria: LocationImportanceCriteria, level: LocationImportanceLevel): string {
    const reasons: string[] = [];

    if (criteria.visitCount > 10) {
      reasons.push(`visited ${criteria.visitCount} times`);
    }
    if (criteria.visitFrequency > 2) {
      reasons.push(`frequent visits (${criteria.visitFrequency.toFixed(1)}/month)`);
    }
    if (criteria.recency < 30) {
      reasons.push(`visited recently (${criteria.recency} days ago)`);
    }
    if (criteria.emotionalSignificance > 0.6) {
      reasons.push('emotionally significant');
    }
    if (criteria.eventSignificance > 0.6) {
      reasons.push('memorable events occurred here');
    }
    if (criteria.culturalSignificance > 0.6) {
      reasons.push('culturally/socially significant');
    }
    if (criteria.relationshipToEntities >= 0.9) {
      reasons.push('essential location (home/job)');
    }

    return reasons.length > 0 
      ? `Classified as ${level} because: ${reasons.join(', ')}`
      : `Classified as ${level} based on overall presence`;
  }

  /**
   * Update location importance in database
   */
  async updateLocationImportance(
    userId: string,
    locationId: string,
    importance: LocationImportance
  ): Promise<void> {
    try {
      await supabaseAdmin
        .from('locations')
        .update({
          importance_level: importance.importanceLevel,
          importance_score: importance.importanceScore,
          updated_at: new Date().toISOString()
        })
        .eq('id', locationId)
        .eq('user_id', userId);
    } catch (error) {
      logger.error({ error, locationId }, 'Failed to update location importance');
      throw error;
    }
  }
}

export const locationImportanceService = new LocationImportanceService();
