/**
 * Location Insight Generator
 * Converts location stats to natural language stories
 * Never shows numbers - only meaningful place stories
 */

import { supabaseAdmin } from '../../supabaseClient';
import type { LocationStats } from '../locationEngine';

export interface LocationInsight {
  text: string;
  locationId: string;
  locationName: string;
  type: 'significance' | 'discovery' | 'memory_collection' | 'exploration' | 'narrative' | 'temporal';
  suggestion?: string;
  storyContext?: {
    timeline?: string;
    evolution?: string;
    frequency?: string;
    significance?: string;
  };
}

export class LocationInsightGenerator {
  /**
   * Generate insights for a location with story-driven context
   */
  async generateInsights(userId: string, stats: LocationStats): Promise<LocationInsight[]> {
    const insights: LocationInsight[] = [];

    // Get location name and type
    const { data: location } = await supabaseAdmin
      .from('locations')
      .select('name, type')
      .eq('id', stats.location_id)
      .single();

    const locationName = location?.name || 'A place';
    const locationType = location?.type || '';

    // Get temporal context
    const temporalContext = await this.getTemporalContext(userId, stats.location_id, stats.discovery_date);
    const visitPattern = await this.getVisitPattern(userId, stats.location_id);
    const memoryContext = await this.getMemoryContext(userId, stats.location_id, stats.memories_attached);

    // Significance insights with narrative
    if (stats.significance_score >= 70) {
      const significanceNarrative = this.buildSignificanceNarrative(
        stats.significance_score,
        stats.memories_attached,
        temporalContext,
        memoryContext
      );
      insights.push({
        text: `${locationName} holds ${significanceNarrative.significanceLevel} meaning for you${significanceNarrative.timeline ? ` ${significanceNarrative.timeline}` : ''}. ${significanceNarrative.why || 'This place has been significant in your journey'}.`,
        locationId: stats.location_id,
        locationName,
        type: 'significance',
        storyContext: {
          timeline: temporalContext.timeline,
          significance: significanceNarrative.why,
        },
      });
    } else if (stats.significance_score >= 40) {
      insights.push({
        text: `${locationName} has been an important place in your story${temporalContext.discoveryStory ? ` ${temporalContext.discoveryStory}` : ''}. ${memoryContext.theme || 'It holds meaningful memories'}.`,
        locationId: stats.location_id,
        locationName,
        type: 'significance',
      });
    }

    // Discovery insights with story
    if (stats.discovery_date) {
      const discoveryStory = this.buildDiscoveryStory(stats.discovery_date, temporalContext, locationType);
      insights.push({
        text: discoveryStory.text,
        locationId: stats.location_id,
        locationName,
        type: 'discovery',
        storyContext: {
          timeline: discoveryStory.timeline,
        },
      });
    }

    // Memory collection insights with narrative
    if (stats.memories_attached >= 10) {
      const memoryNarrative = this.buildMemoryNarrative(
        stats.memories_attached,
        visitPattern,
        memoryContext
      );
      insights.push({
        text: `${memoryNarrative.countDescription} from your time in ${locationName}${memoryNarrative.timeline ? ` ${memoryNarrative.timeline}` : ''}. ${memoryNarrative.story || 'These memories tell a story'}.`,
        locationId: stats.location_id,
        locationName,
        type: 'memory_collection',
        storyContext: {
          frequency: visitPattern.frequency,
          significance: memoryNarrative.story,
        },
      });
    } else if (stats.memories_attached >= 5) {
      insights.push({
        text: `Several meaningful memories from ${locationName}${visitPattern.recentVisit ? ` ${visitPattern.recentVisit}` : ''}. ${memoryContext.theme || 'This place holds special moments'}.`,
        locationId: stats.location_id,
        locationName,
        type: 'memory_collection',
      });
    }

    // Narrative insights - how this place fits into the story
    if (stats.memories_attached >= 5 && visitPattern.hasPattern) {
      insights.push({
        text: `${locationName} has been ${visitPattern.patternDescription || 'a recurring setting'} in your story. ${visitPattern.storyArc || 'It represents an important chapter'}.`,
        locationId: stats.location_id,
        locationName,
        type: 'narrative',
        storyContext: {
          evolution: visitPattern.storyArc,
        },
      });
    }

    // Exploration prompts with context
    if (stats.visit_count === 0 && stats.memories_attached === 0) {
      const lastVisit = await this.getLastVisit(userId, stats.location_id);
      insights.push({
        text: `You haven't written about ${locationName}${lastVisit ? ` ${lastVisit}` : ' in a while'}`,
        locationId: stats.location_id,
        locationName,
        type: 'exploration',
        suggestion: `Want to explore memories from ${locationName}?`,
      });
    }

    return insights;
  }

  /**
   * Get temporal context for location
   */
  private async getTemporalContext(
    userId: string,
    locationId: string,
    discoveryDate: string | null
  ): Promise<{
    timeline: string;
    discoveryStory: string;
    firstVisit: string | null;
  }> {
    try {
      let discoveryStory = '';
      let timeline = '';

      if (discoveryDate) {
        const discovery = new Date(discoveryDate);
        const yearsAgo = Math.floor((Date.now() - discovery.getTime()) / (1000 * 60 * 60 * 24 * 365));
        
        if (yearsAgo > 0) {
          timeline = `for over ${yearsAgo} year${yearsAgo > 1 ? 's' : ''}`;
          discoveryStory = `You first discovered this place ${yearsAgo} year${yearsAgo > 1 ? 's' : ''} ago`;
        } else {
          const monthsAgo = Math.floor((Date.now() - discovery.getTime()) / (1000 * 60 * 60 * 24 * 30));
          if (monthsAgo > 0) {
            timeline = `for ${monthsAgo} month${monthsAgo > 1 ? 's' : ''}`;
            discoveryStory = `You discovered this place ${monthsAgo} month${monthsAgo > 1 ? 's' : ''} ago`;
          } else {
            discoveryStory = 'You recently discovered this place';
          }
        }
      }

      return { timeline, discoveryStory, firstVisit: discoveryDate };
    } catch (error) {
      return { timeline: '', discoveryStory: '', firstVisit: null };
    }
  }

  /**
   * Get visit pattern
   */
  private async getVisitPattern(userId: string, locationId: string): Promise<{
    frequency: string;
    recentVisit: string;
    hasPattern: boolean;
    patternDescription: string;
    storyArc: string;
  }> {
    try {
      const { data: mentions } = await supabaseAdmin
        .from('location_mentions')
        .select('created_at')
        .eq('user_id', userId)
        .eq('location_id', locationId)
        .order('created_at', { ascending: false });

      if (!mentions || mentions.length === 0) {
        return {
          frequency: '',
          recentVisit: '',
          hasPattern: false,
          patternDescription: '',
          storyArc: '',
        };
      }

      const lastVisit = new Date(mentions[0].created_at);
      const daysSince = Math.floor((Date.now() - lastVisit.getTime()) / (1000 * 60 * 60 * 24));

      let recentVisit = '';
      if (daysSince <= 7) recentVisit = 'this week';
      else if (daysSince <= 30) recentVisit = 'this month';
      else if (daysSince <= 90) recentVisit = 'recently';

      // Check for patterns
      const visitFrequency = mentions.length;
      let frequency = '';
      let patternDescription = '';
      let hasPattern = false;

      if (visitFrequency >= 10) {
        frequency = 'frequently';
        patternDescription = 'a recurring setting';
        hasPattern = true;
      } else if (visitFrequency >= 5) {
        frequency = 'regularly';
        patternDescription = 'a familiar place';
        hasPattern = true;
      } else {
        frequency = 'occasionally';
      }

      const storyArc = hasPattern 
        ? 'It represents an important chapter in your journey'
        : 'It holds special moments in your story';

      return {
        frequency,
        recentVisit,
        hasPattern,
        patternDescription,
        storyArc,
      };
    } catch (error) {
      return {
        frequency: '',
        recentVisit: '',
        hasPattern: false,
        patternDescription: '',
        storyArc: '',
      };
    }
  }

  /**
   * Get memory context
   */
  private async getMemoryContext(
    userId: string,
    locationId: string,
    memoryCount: number
  ): Promise<{
    theme: string;
    significance: string;
  }> {
    try {
      const { data: entries } = await supabaseAdmin
        .from('location_mentions')
        .select('memory_id')
        .eq('user_id', userId)
        .eq('location_id', locationId)
        .limit(10);

      if (!entries || entries.length === 0) {
        return {
          theme: memoryCount >= 5 ? 'This place holds meaningful memories' : '',
          significance: '',
        };
      }

      const entryIds = entries.map(e => e.memory_id);
      const { data: memories } = await supabaseAdmin
        .from('journal_entries')
        .select('sentiment, mood')
        .eq('user_id', userId)
        .in('id', entryIds);

      if (!memories || memories.length === 0) {
        return {
          theme: 'This place holds meaningful memories',
          significance: '',
        };
      }

      const positiveMemories = memories.filter(m => m.sentiment && m.sentiment > 0.3).length;
      const theme = positiveMemories >= memories.length * 0.7
        ? 'This place holds mostly positive memories'
        : positiveMemories >= memories.length * 0.5
        ? 'This place holds mixed but meaningful memories'
        : 'This place holds significant memories';

      const significance = memoryCount >= 15
        ? 'It has been a significant setting in your story'
        : memoryCount >= 10
        ? 'It represents important moments'
        : '';

      return { theme, significance };
    } catch (error) {
      return { theme: '', significance: '' };
    }
  }

  /**
   * Build significance narrative
   */
  private buildSignificanceNarrative(
    score: number,
    memoryCount: number,
    temporal: { timeline: string },
    memory: { theme: string; significance: string }
  ): {
    significanceLevel: string;
    timeline?: string;
    why: string;
  } {
    let significanceLevel = 'special';
    if (score >= 90) significanceLevel = 'profound';
    else if (score >= 80) significanceLevel = 'deep';

    const why = memoryCount >= 15
      ? 'It has been a central setting in your journey'
      : memoryCount >= 10
      ? 'It represents important chapters in your story'
      : 'This place has been significant in your journey';

    return {
      significanceLevel,
      timeline: temporal.timeline || undefined,
      why,
    };
  }

  /**
   * Build discovery story
   */
  private buildDiscoveryStory(
    discoveryDate: string,
    temporal: { discoveryStory: string },
    locationType: string
  ): {
    text: string;
    timeline: string;
  } {
    const discovery = new Date(discoveryDate);
    const yearsAgo = Math.floor((Date.now() - discovery.getTime()) / (1000 * 60 * 60 * 24 * 365));

    let text = '';
    if (yearsAgo > 0) {
      text = `You first wrote about this place ${yearsAgo} year${yearsAgo > 1 ? 's' : ''} ago${locationType ? `, a ${locationType}` : ''}. ${temporal.discoveryStory || 'It has been part of your story since then'}.`;
    } else {
      const monthsAgo = Math.floor((Date.now() - discovery.getTime()) / (1000 * 60 * 60 * 24 * 30));
      if (monthsAgo > 0) {
        text = `You discovered this place ${monthsAgo} month${monthsAgo > 1 ? 's' : ''} ago. It's becoming part of your story.`;
      } else {
        text = `You recently discovered this place. It's a new chapter in your journey.`;
      }
    }

    return {
      text,
      timeline: temporal.discoveryStory,
    };
  }

  /**
   * Build memory narrative
   */
  private buildMemoryNarrative(
    count: number,
    visitPattern: { frequency: string; storyArc: string },
    memory: { theme: string }
  ): {
    countDescription: string;
    timeline?: string;
    story: string;
  } {
    let countDescription = '';
    if (count >= 20) countDescription = 'many memories';
    else if (count >= 15) countDescription = 'numerous memories';
    else if (count >= 10) countDescription = 'many meaningful memories';
    else countDescription = 'several memories';

    const story = visitPattern.storyArc || memory.theme || 'These memories tell a story';

    return {
      countDescription,
      story,
    };
  }

  /**
   * Get last visit context
   */
  private async getLastVisit(userId: string, locationId: string): Promise<string | null> {
    try {
      const { data: lastMention } = await supabaseAdmin
        .from('location_mentions')
        .select('created_at')
        .eq('user_id', userId)
        .eq('location_id', locationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!lastMention) return null;

      const daysSince = Math.floor((Date.now() - new Date(lastMention.created_at).getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysSince > 365) {
        const years = Math.floor(daysSince / 365);
        return `in over ${years} year${years > 1 ? 's' : ''}`;
      } else if (daysSince > 90) {
        const months = Math.floor(daysSince / 30);
        return `in ${months} month${months > 1 ? 's' : ''}`;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate insights for all locations
   */
  async generateAllInsights(userId: string, statsList: LocationStats[]): Promise<LocationInsight[]> {
    const allInsights: LocationInsight[] = [];

    for (const stats of statsList) {
      const insights = await this.generateInsights(userId, stats);
      allInsights.push(...insights);
    }

    return allInsights;
  }
}

export const locationInsightGenerator = new LocationInsightGenerator();
