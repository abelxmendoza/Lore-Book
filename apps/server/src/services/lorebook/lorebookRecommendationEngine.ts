/**
 * Lorebook Recommendation Engine
 * 
 * Analyzes user's data to recommend main lorebooks:
 * - Full Life Story (always recommended)
 * - Character-based lorebooks (top relationships)
 * - Location-based lorebooks (significant places)
 * - Event-based lorebooks (major events)
 * - Skill-based lorebooks (skill journeys)
 * - Timeline-based lorebooks (significant periods)
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { memoryService } from '../memoryService';
import type { BiographySpec, Domain } from '../biographyGeneration/types';

export interface LorebookRecommendation {
  id: string;
  title: string;
  description: string;
  type: 'full_life' | 'character' | 'location' | 'event' | 'skill' | 'timeline' | 'domain';
  spec: BiographySpec & { 
    characterIds?: string[];
    locationIds?: string[];
    eventIds?: string[];
    skillIds?: string[];
  };
  reason: string;
  priority: number;
  estimatedChapters: number;
  metadata?: {
    characterName?: string;
    locationName?: string;
    eventTitle?: string;
    skillName?: string;
    timeRange?: { start: string; end: string };
  };
}

export class LorebookRecommendationEngine {
  /**
   * Get recommended lorebooks for user
   */
  async getRecommendations(userId: string, limit: number = 10): Promise<LorebookRecommendation[]> {
    try {
      const recommendations: LorebookRecommendation[] = [];

      // 1. Always include Full Life Story
      recommendations.push({
        id: 'full-life-story',
        title: 'My Full Life Story',
        description: 'Your complete biography from beginning to present',
        type: 'full_life',
        spec: {
          scope: 'full_life',
          tone: 'neutral',
          depth: 'detailed',
          audience: 'self',
          includeIntrospection: true,
        },
        reason: 'Comprehensive narrative of your entire life',
        priority: 1,
        estimatedChapters: 0,
      });

      // 2. Get character-based recommendations
      const characterRecs = await this.getCharacterRecommendations(userId);
      recommendations.push(...characterRecs);

      // 3. Get location-based recommendations
      const locationRecs = await this.getLocationRecommendations(userId);
      recommendations.push(...locationRecs);

      // 4. Get event-based recommendations
      const eventRecs = await this.getEventRecommendations(userId);
      recommendations.push(...eventRecs);

      // 5. Get skill-based recommendations
      const skillRecs = await this.getSkillRecommendations(userId);
      recommendations.push(...skillRecs);

      // 6. Get timeline-based recommendations
      const timelineRecs = await this.getTimelineRecommendations(userId);
      recommendations.push(...timelineRecs);

      // 7. Get domain-based recommendations
      const domainRecs = await this.getDomainRecommendations(userId);
      recommendations.push(...domainRecs);

      // Sort by priority and limit
      recommendations.sort((a, b) => a.priority - b.priority);
      return recommendations.slice(0, limit);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to generate lorebook recommendations');
      return [this.getDefaultFullLifeRecommendation()];
    }
  }

  /**
   * Get character-based recommendations
   */
  private async getCharacterRecommendations(userId: string): Promise<LorebookRecommendation[]> {
    try {
      // Get characters with most journal entries
      // Use a simpler query that works with Supabase
      const { data: characterMemories, error: memError } = await supabaseAdmin
        .from('character_memories')
        .select('character_id')
        .eq('user_id', userId);

      if (memError || !characterMemories) {
        return [];
      }

      // Count occurrences
      const charCounts = new Map<string, number>();
      for (const cm of characterMemories) {
        charCounts.set(cm.character_id, (charCounts.get(cm.character_id) || 0) + 1);
      }

      // Get top 5 character IDs
      const topCharIds = Array.from(charCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id]) => id);

      // Get character details
      const { data: characters, error } = await supabaseAdmin
        .from('characters')
        .select('id, name')
        .eq('user_id', userId)
        .in('id', topCharIds);

      if (error || !characterStats) {
        return [];
      }

      if (error || !characters) {
        return [];
      }

      const recommendations: LorebookRecommendation[] = [];
      let priority = 2;

      for (const character of characters) {
        const count = charCounts.get(character.id) || 0;
        if (count === 0) continue;

        recommendations.push({
          id: `character-${character.id}`,
          title: `My Story with ${character.name}`,
          description: `Your relationship and experiences with ${character.name}`,
          type: 'character',
          spec: {
            scope: 'thematic',
            tone: 'reflective',
            depth: 'detailed',
            audience: 'self',
            includeIntrospection: true,
            characterIds: [character.id],
            themes: ['relationship', 'connection'],
          },
          reason: `Significant relationship with ${character.name}`,
          priority: priority++,
          estimatedChapters: Math.ceil(count / 10),
          metadata: {
            characterName: character.name,
          },
        });
      }

      return recommendations;
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to get character recommendations');
      return [];
    }
  }

  /**
   * Get location-based recommendations
   */
  private async getLocationRecommendations(userId: string): Promise<LorebookRecommendation[]> {
    try {
      // Get locations with most mentions
      const { data: locationMentions, error: memError } = await supabaseAdmin
        .from('location_mentions')
        .select('location_id')
        .eq('user_id', userId);

      if (memError || !locationMentions) {
        return [];
      }

      // Count occurrences
      const locCounts = new Map<string, number>();
      for (const lm of locationMentions) {
        locCounts.set(lm.location_id, (locCounts.get(lm.location_id) || 0) + 1);
      }

      // Get top 3 location IDs
      const topLocIds = Array.from(locCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => id);

      // Get location details
      const { data: locations, error } = await supabaseAdmin
        .from('locations')
        .select('id, name')
        .eq('user_id', userId)
        .in('id', topLocIds);

      if (error || !locations) {
        return [];
      }

      const recommendations: LorebookRecommendation[] = [];
      let priority = 5;

      for (const location of locations) {
        const count = locCounts.get(location.id) || 0;
        if (count === 0) continue;

        recommendations.push({
          id: `location-${location.id}`,
          title: `Life at ${location.name}`,
          description: `Your experiences and memories at ${location.name}`,
          type: 'location',
          spec: {
            scope: 'thematic',
            tone: 'neutral',
            depth: 'detailed',
            audience: 'self',
            includeIntrospection: true,
            locationIds: [location.id],
            themes: ['place', 'location', 'memories'],
          },
          reason: `Significant place: ${location.name}`,
          priority: priority++,
          estimatedChapters: Math.ceil(count / 10),
          metadata: {
            locationName: location.name,
          },
        });
      }

      return recommendations;
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to get location recommendations');
      return [];
    }
  }

  /**
   * Get event-based recommendations
   */
  private async getEventRecommendations(userId: string): Promise<LorebookRecommendation[]> {
    try {
      // Get significant events
      const { data: events, error } = await supabaseAdmin
        .from('resolved_events')
        .select('id, title, description, significance, date')
        .eq('user_id', userId)
        .order('significance', { ascending: false })
        .limit(3);

      if (error || !events || events.length === 0) {
        return [];
      }

      const recommendations: LorebookRecommendation[] = [];
      let priority = 7;

      for (const event of events) {
        recommendations.push({
          id: `event-${event.id}`,
          title: `The ${event.title} Story`,
          description: event.description || `Your experience of ${event.title}`,
          type: 'event',
          spec: {
            scope: 'thematic',
            tone: 'dramatic',
            depth: 'detailed',
            audience: 'self',
            includeIntrospection: true,
            eventIds: [event.id],
            themes: ['event', 'experience'],
          },
          reason: `Significant event: ${event.title}`,
          priority: priority++,
          estimatedChapters: 3,
          metadata: {
            eventTitle: event.title,
          },
        });
      }

      return recommendations;
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to get event recommendations');
      return [];
    }
  }

  /**
   * Get skill-based recommendations
   */
  private async getSkillRecommendations(userId: string): Promise<LorebookRecommendation[]> {
    try {
      // Get skills with progress
      const { data: skills, error } = await supabaseAdmin
        .from('skills')
        .select(`
          id,
          name,
          description,
          skill_progress(progress_level)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(3);

      if (error || !skills || skills.length === 0) {
        return [];
      }

      const recommendations: LorebookRecommendation[] = [];
      let priority = 9;

      for (const skill of skills) {
        const skillName = skill.skill_name || 'Unknown';
        recommendations.push({
          id: `skill-${skill.id}`,
          title: `My ${skillName} Journey`,
          description: `Your journey learning and developing ${skillName}`,
          type: 'skill',
          spec: {
            scope: 'thematic',
            tone: 'reflective',
            depth: 'detailed',
            audience: 'self',
            includeIntrospection: true,
            skillIds: [skill.id],
            themes: ['learning', 'growth', 'skill'],
          },
          reason: `Skill development: ${skillName}`,
          priority: priority++,
          estimatedChapters: 5,
          metadata: {
            skillName: skillName,
          },
        });
      }

      return recommendations;
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to get skill recommendations');
      return [];
    }
  }

  /**
   * Get timeline-based recommendations
   */
  private async getTimelineRecommendations(userId: string): Promise<LorebookRecommendation[]> {
    try {
      // Get entries to find significant periods
      const entries = await memoryService.searchEntries(userId, { limit: 1000 });
      
      if (!entries || entries.length === 0) {
        return [];
      }

      // Group by year to find significant years
      const yearGroups = new Map<number, any[]>();
      for (const entry of entries) {
        const date = new Date(entry.date || entry.created_at);
        const year = date.getFullYear();
        if (!yearGroups.has(year)) {
          yearGroups.set(year, []);
        }
        yearGroups.get(year)!.push(entry);
      }

      // Find years with most entries
      const significantYears = Array.from(yearGroups.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 2);

      const recommendations: LorebookRecommendation[] = [];
      let priority = 11;

      for (const [year, yearEntries] of significantYears) {
        recommendations.push({
          id: `timeline-${year}`,
          title: `My ${year} Story`,
          description: `Your experiences and memories from ${year}`,
          type: 'timeline',
          spec: {
            scope: 'time_range',
            tone: 'neutral',
            depth: 'detailed',
            audience: 'self',
            includeIntrospection: true,
            timeRange: {
              start: `${year}-01-01T00:00:00Z`,
              end: `${year}-12-31T23:59:59Z`,
            },
          },
          reason: `Significant year with ${yearEntries.length} entries`,
          priority: priority++,
          estimatedChapters: Math.ceil(yearEntries.length / 15),
          metadata: {
            timeRange: {
              start: `${year}-01-01T00:00:00Z`,
              end: `${year}-12-31T23:59:59Z`,
            },
          },
        });
      }

      return recommendations;
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to get timeline recommendations');
      return [];
    }
  }

  /**
   * Get domain-based recommendations
   */
  private async getDomainRecommendations(userId: string): Promise<LorebookRecommendation[]> {
    try {
      const entries = await memoryService.searchEntries(userId, { limit: 1000 });
      
      if (!entries || entries.length === 0) {
        return [];
      }

      // Count domain mentions
      const domainCounts: Record<Domain, number> = {
        fighting: 0,
        robotics: 0,
        relationships: 0,
        creative: 0,
        professional: 0,
        personal: 0,
        health: 0,
        education: 0,
        family: 0,
        friendship: 0,
        romance: 0,
      };

      for (const entry of entries) {
        const content = (entry.content || entry.summary || '').toLowerCase();
        const tags = (entry.tags || []).map((t: string) => t.toLowerCase());

        if (content.includes('fight') || content.includes('bjj') || tags.includes('fighting')) {
          domainCounts.fighting++;
        }
        if (content.includes('robot') || content.includes('code') || tags.includes('robotics')) {
          domainCounts.robotics++;
        }
        if (content.includes('relationship') || content.includes('love') || tags.includes('relationship')) {
          domainCounts.relationships++;
        }
        // Add more domain detection...
      }

      // Get top 2 domains
      const topDomains = Object.entries(domainCounts)
        .filter(([_, count]) => count > 0)
        .sort(([_, a], [__, b]) => b - a)
        .slice(0, 2)
        .map(([domain]) => domain as Domain);

      const recommendations: LorebookRecommendation[] = [];
      let priority = 13;

      for (const domain of topDomains) {
        recommendations.push({
          id: `domain-${domain}`,
          title: `My ${this.getDomainTitle(domain)}`,
          description: `Your journey in ${domain}`,
          type: 'domain',
          spec: {
            scope: 'domain',
            domain,
            tone: 'neutral',
            depth: 'detailed',
            audience: 'self',
            includeIntrospection: true,
          },
          reason: `High activity in ${domain}`,
          priority: priority++,
          estimatedChapters: Math.ceil(domainCounts[domain] / 15),
        });
      }

      return recommendations;
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to get domain recommendations');
      return [];
    }
  }

  private getDomainTitle(domain: Domain): string {
    const titles: Record<Domain, string> = {
      fighting: 'Fighting Journey',
      robotics: 'Robotics Journey',
      relationships: 'Relationships Story',
      creative: 'Creative Journey',
      professional: 'Professional Story',
      personal: 'Personal Growth',
      health: 'Health Journey',
      education: 'Education Story',
      family: 'Family Story',
      friendship: 'Friendships',
      romance: 'Romance Story',
    };
    return titles[domain] || domain;
  }

  private getDefaultFullLifeRecommendation(): LorebookRecommendation {
    return {
      id: 'full-life-story',
      title: 'My Full Life Story',
      description: 'Your complete biography',
      type: 'full_life',
      spec: {
        scope: 'full_life',
        tone: 'neutral',
        depth: 'detailed',
        audience: 'self',
        includeIntrospection: true,
      },
      reason: 'Your complete life story',
      priority: 1,
      estimatedChapters: 0,
    };
  }
}

export const lorebookRecommendationEngine = new LorebookRecommendationEngine();
