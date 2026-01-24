/**
 * Companion Insight Generator
 * Converts companion stats to natural language insights with story-driven context
 * Never shows numbers - only stories and meaningful insights
 */

import { supabaseAdmin } from '../../supabaseClient';
import type { CompanionStats } from '../companionEngine';

export interface CompanionInsight {
  text: string;
  characterId: string;
  characterName: string;
  type: 'relationship_depth' | 'shared_experiences' | 'support' | 'evolution' | 'discovery' | 'narrative_arc' | 'temporal_context';
  suggestion?: string;
  storyContext?: {
    timeline?: string;
    evolution?: string;
    frequency?: string;
    significance?: string;
  };
}

export class CompanionInsightGenerator {
  /**
   * Generate insights for a companion with story-driven context
   */
  async generateInsights(userId: string, stats: CompanionStats): Promise<CompanionInsight[]> {
    const insights: CompanionInsight[] = [];

    // Get character name and first appearance
    const { data: character } = await supabaseAdmin
      .from('characters')
      .select('name, first_appearance')
      .eq('id', stats.character_id)
      .single();

    const characterName = character?.name || 'Someone';
    const firstAppearance = character?.first_appearance;

    // Get temporal context - when was this relationship most active?
    const temporalContext = await this.getTemporalContext(userId, stats.character_id);
    
    // Get relationship evolution
    const evolution = await this.getRelationshipEvolution(userId, stats.character_id);

    // Relationship depth insights with story context
    if (stats.relationship_depth >= 70) {
      const context = this.buildRelationshipContext(temporalContext, evolution, stats.shared_experiences);
      insights.push({
        text: `${characterName} has been a central figure in your story${context.timeline ? ` ${context.timeline}` : ''}. ${context.evolution || 'Your connection has grown deeper over time'}.`,
        characterId: stats.character_id,
        characterName,
        type: 'relationship_depth',
        storyContext: context,
      });
    } else if (stats.relationship_depth >= 40) {
      insights.push({
        text: `You've been building a meaningful connection with ${characterName}${temporalContext.recentActivity ? `, especially ${temporalContext.recentActivity}` : ''}. ${evolution.currentPhase || 'This relationship is evolving'}.`,
        characterId: stats.character_id,
        characterName,
        type: 'relationship_depth',
        storyContext: {
          timeline: temporalContext.timeline,
          evolution: evolution.currentPhase,
        },
      });
    }

    // Shared experiences insights with narrative
    if (stats.shared_experiences >= 10) {
      const experienceNarrative = this.buildExperienceNarrative(stats.shared_experiences, temporalContext);
      insights.push({
        text: `You've shared ${experienceNarrative.countDescription} with ${characterName}${experienceNarrative.timeline ? ` ${experienceNarrative.timeline}` : ''}. ${experienceNarrative.significance || 'These moments have shaped your relationship'}.`,
        characterId: stats.character_id,
        characterName,
        type: 'shared_experiences',
        storyContext: {
          frequency: experienceNarrative.frequency,
          significance: experienceNarrative.significance,
        },
      });
    } else if (stats.shared_experiences >= 5) {
      insights.push({
        text: `You've been spending quality time with ${characterName}${temporalContext.recentActivity ? ` ${temporalContext.recentActivity}` : ''}. ${evolution.trend || 'Your connection is growing'}.`,
        characterId: stats.character_id,
        characterName,
        type: 'shared_experiences',
      });
    }

    // Support level insights with context
    if (stats.support_level >= 7) {
      const supportContext = await this.getSupportContext(userId, stats.character_id);
      const supportText = `${characterName} has been a ${supportContext.supportType || 'supportive'} presence in your life${supportContext.when ? ` ${supportContext.when}` : ''}. ${supportContext.how || "They've been there for you through important moments"}.`;
      insights.push({
        text: supportText,
        characterId: stats.character_id,
        characterName,
        type: 'support',
        storyContext: {
          significance: supportContext.how,
        },
      });
    }

    // Relationship class insights with narrative
    if (stats.relationship_class === 'Mentor') {
      const mentorContext = await this.getMentorContext(userId, stats.character_id);
      const mentorText = `${characterName} has been a ${mentorContext.mentorType || 'supportive mentor'}${mentorContext.impact ? `, ${mentorContext.impact}` : ''}. ${mentorContext.guidance || "They've helped guide you through several challenges"}.`;
      insights.push({
        text: mentorText,
        characterId: stats.character_id,
        characterName,
        type: 'support',
        storyContext: {
          significance: mentorContext.guidance,
        },
      });
    } else if (stats.relationship_class === 'Family') {
      const familyContext = await this.getFamilyContext(userId, stats.character_id, firstAppearance);
      insights.push({
        text: `Your relationship with ${characterName} has ${familyContext.evolution || 'deepened'}${familyContext.timeline ? ` ${familyContext.timeline}` : ''}. ${familyContext.bond || 'Your bond has grown stronger over time'}.`,
        characterId: stats.character_id,
        characterName,
        type: 'evolution',
        storyContext: {
          timeline: familyContext.timeline,
          evolution: familyContext.evolution,
        },
      });
    }

    // Narrative arc insights
    if (evolution.hasArc) {
      insights.push({
        text: `Your relationship with ${characterName} has ${evolution.arcDescription || 'evolved through different phases'}. ${evolution.arcSummary || 'From early connections to deeper understanding'}.`,
        characterId: stats.character_id,
        characterName,
        type: 'narrative_arc',
        storyContext: {
          evolution: evolution.arcSummary,
        },
      });
    }

    // Discovery prompts with temporal context
    if (stats.shared_experiences === 0) {
      const lastMention = await this.getLastMention(userId, stats.character_id);
      insights.push({
        text: `You haven't written about ${characterName}${lastMention ? ` ${lastMention}` : ' in a while'}`,
        characterId: stats.character_id,
        characterName,
        type: 'discovery',
        suggestion: `Want to check in about ${characterName}?`,
      });
    }

    return insights;
  }

  /**
   * Get temporal context for relationship
   */
  private async getTemporalContext(userId: string, characterId: string): Promise<{
    timeline: string;
    recentActivity: string;
    peakPeriod: string | null;
  }> {
    try {
      const { data: memories } = await supabaseAdmin
        .from('character_memories')
        .select('created_at')
        .eq('user_id', userId)
        .eq('character_id', characterId)
        .order('created_at', { ascending: false });

      if (!memories || memories.length === 0) {
        return { timeline: '', recentActivity: '', peakPeriod: null };
      }

      const firstMention = new Date(memories[memories.length - 1].created_at);
      const lastMention = new Date(memories[0].created_at);
      const daysSinceFirst = Math.floor((Date.now() - firstMention.getTime()) / (1000 * 60 * 60 * 24));
      const daysSinceLast = Math.floor((Date.now() - lastMention.getTime()) / (1000 * 60 * 60 * 24));

      let timeline = '';
      if (daysSinceFirst > 365) {
        const years = Math.floor(daysSinceFirst / 365);
        timeline = `for over ${years} year${years > 1 ? 's' : ''}`;
      } else if (daysSinceFirst > 30) {
        const months = Math.floor(daysSinceFirst / 30);
        timeline = `for ${months} month${months > 1 ? 's' : ''}`;
      }

      let recentActivity = '';
      if (daysSinceLast <= 7) {
        recentActivity = 'this week';
      } else if (daysSinceLast <= 30) {
        recentActivity = 'this month';
      } else if (daysSinceLast <= 90) {
        recentActivity = 'recently';
      }

      // Find peak period (most mentions in a month)
      const peakPeriod = this.findPeakPeriod(memories);

      return { timeline, recentActivity, peakPeriod };
    } catch (error) {
      return { timeline: '', recentActivity: '', peakPeriod: null };
    }
  }

  /**
   * Find peak period of activity
   */
  private findPeakPeriod(memories: Array<{ created_at: string }>): string | null {
    // Group by month
    const monthlyCounts: Record<string, number> = {};
    for (const mem of memories) {
      const date = new Date(mem.created_at);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      monthlyCounts[monthKey] = (monthlyCounts[monthKey] || 0) + 1;
    }

    const peakMonth = Object.entries(monthlyCounts).sort((a, b) => b[1] - a[1])[0];
    if (peakMonth && peakMonth[1] >= 3) {
      const [year, month] = peakMonth[0].split('-');
      const monthName = new Date(parseInt(year), parseInt(month)).toLocaleString('default', { month: 'long' });
      return `with peak activity in ${monthName} ${year}`;
    }
    return null;
  }

  /**
   * Get relationship evolution
   */
  private async getRelationshipEvolution(userId: string, characterId: string): Promise<{
    hasArc: boolean;
    arcDescription: string;
    arcSummary: string;
    currentPhase: string;
    trend: string;
  }> {
    try {
      const { data: memories } = await supabaseAdmin
        .from('character_memories')
        .select('created_at, emotion, role')
        .eq('user_id', userId)
        .eq('character_id', characterId)
        .order('created_at', { ascending: true });

      if (!memories || memories.length < 3) {
        return {
          hasArc: false,
          arcDescription: '',
          arcSummary: '',
          currentPhase: 'building',
          trend: 'growing',
        };
      }

      // Analyze evolution
      const earlyMemories = memories.slice(0, Math.floor(memories.length / 3));
      const recentMemories = memories.slice(-Math.floor(memories.length / 3));

      const earlyEmotions = earlyMemories.filter(m => m.emotion).map(m => m.emotion);
      const recentEmotions = recentMemories.filter(m => m.emotion).map(m => m.emotion);

      let arcDescription = '';
      let currentPhase = '';
      let trend = '';

      if (recentMemories.length > earlyMemories.length * 1.5) {
        arcDescription = 'grown more frequent';
        currentPhase = 'deepening';
        trend = 'strengthening';
      } else if (recentMemories.length < earlyMemories.length * 0.7) {
        arcDescription = 'become less frequent';
        currentPhase = 'evolving';
        trend = 'changing';
      } else {
        arcDescription = 'remained steady';
        currentPhase = 'stable';
        trend = 'consistent';
      }

      return {
        hasArc: true,
        arcDescription,
        arcSummary: `From early connections to ${currentPhase} relationship`,
        currentPhase,
        trend,
      };
    } catch (error) {
      return {
        hasArc: false,
        arcDescription: '',
        arcSummary: '',
        currentPhase: 'building',
        trend: 'growing',
      };
    }
  }

  /**
   * Build relationship context
   */
  private buildRelationshipContext(
    temporal: { timeline: string; recentActivity: string },
    evolution: { currentPhase: string; trend: string },
    sharedExperiences: number
  ): { timeline?: string; evolution?: string; frequency?: string; significance?: string } {
    return {
      timeline: temporal.timeline || undefined,
      evolution: evolution.currentPhase ? `Your relationship is ${evolution.currentPhase}` : undefined,
      frequency: sharedExperiences >= 20 ? 'frequently' : sharedExperiences >= 10 ? 'regularly' : 'occasionally',
      significance: sharedExperiences >= 15 ? 'This person has been significant in your journey' : undefined,
    };
  }

  /**
   * Build experience narrative
   */
  private buildExperienceNarrative(
    count: number,
    temporal: { timeline: string; recentActivity: string }
  ): { countDescription: string; timeline?: string; frequency?: string; significance?: string } {
    let countDescription = '';
    if (count >= 20) countDescription = 'many meaningful moments';
    else if (count >= 10) countDescription = 'numerous experiences';
    else if (count >= 5) countDescription = 'several meaningful moments';
    else countDescription = 'some moments';

    return {
      countDescription,
      timeline: temporal.timeline || undefined,
      frequency: count >= 15 ? 'frequently' : 'regularly',
      significance: count >= 20 ? 'These experiences have been significant in your story' : undefined,
    };
  }

  /**
   * Get support context
   */
  private async getSupportContext(userId: string, characterId: string): Promise<{
    supportType: string;
    when: string;
    how: string;
  }> {
    try {
      const { data: memories } = await supabaseAdmin
        .from('character_memories')
        .select('role, emotion, created_at')
        .eq('user_id', userId)
        .eq('character_id', characterId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!memories || memories.length === 0) {
        return { supportType: 'supportive', when: '', how: '' };
      }

      const supportRoles = memories.filter(m => 
        m.role && ['supporter', 'helper', 'mentor', 'ally'].some(r => m.role?.toLowerCase().includes(r))
      );

      const supportType = supportRoles.length >= 3 ? 'deeply supportive' : 'supportive';
      const when = memories.length >= 5 ? 'throughout your journey' : 'in important moments';
      const how = supportRoles.length >= 2 
        ? 'They\'ve consistently been there when you needed support'
        : 'They\'ve been a source of strength';

      return { supportType, when, how };
    } catch (error) {
      return { supportType: 'supportive', when: '', how: '' };
    }
  }

  /**
   * Get mentor context
   */
  private async getMentorContext(userId: string, characterId: string): Promise<{
    mentorType: string;
    impact: string;
    guidance: string;
  }> {
    try {
      const { data: memories } = await supabaseAdmin
        .from('character_memories')
        .select('role, created_at')
        .eq('user_id', userId)
        .eq('character_id', characterId)
        .order('created_at', { ascending: false });

      if (!memories || memories.length === 0) {
        return { mentorType: 'supportive mentor', impact: '', guidance: '' };
      }

      const mentorType = memories.length >= 10 ? 'trusted mentor' : 'supportive mentor';
      const impact = memories.length >= 15 
        ? 'significantly impacting your growth'
        : 'helping shape your journey';
      const guidance = memories.length >= 10
        ? 'Their guidance has been valuable throughout your development'
        : 'They\'ve helped guide you through several challenges';

      return { mentorType, impact, guidance };
    } catch (error) {
      return { mentorType: 'supportive mentor', impact: '', guidance: '' };
    }
  }

  /**
   * Get family context
   */
  private async getFamilyContext(userId: string, characterId: string, firstAppearance: string | null): Promise<{
    evolution: string;
    timeline: string;
    bond: string;
  }> {
    let timeline = '';
    if (firstAppearance) {
      const firstDate = new Date(firstAppearance);
      const yearsAgo = Math.floor((Date.now() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 365));
      if (yearsAgo > 0) {
        timeline = `over the past ${yearsAgo} year${yearsAgo > 1 ? 's' : ''}`;
      }
    }

    return {
      evolution: timeline ? 'deepened' : 'grown',
      timeline,
      bond: timeline ? 'Your bond has strengthened over time' : 'Your connection has grown',
    };
  }

  /**
   * Get last mention context
   */
  private async getLastMention(userId: string, characterId: string): Promise<string | null> {
    try {
      const { data: lastMemory } = await supabaseAdmin
        .from('character_memories')
        .select('created_at')
        .eq('user_id', userId)
        .eq('character_id', characterId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!lastMemory) return null;

      const daysSince = Math.floor((Date.now() - new Date(lastMemory.created_at).getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysSince > 365) {
        const years = Math.floor(daysSince / 365);
        return `in over ${years} year${years > 1 ? 's' : ''}`;
      } else if (daysSince > 90) {
        const months = Math.floor(daysSince / 30);
        return `in ${months} month${months > 1 ? 's' : ''}`;
      } else if (daysSince > 30) {
        return 'in over a month';
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate insights for all companions
   */
  async generateAllInsights(userId: string, statsList: CompanionStats[]): Promise<CompanionInsight[]> {
    const allInsights: CompanionInsight[] = [];

    for (const stats of statsList) {
      const insights = await this.generateInsights(userId, stats);
      allInsights.push(...insights);
    }

    return allInsights;
  }
}

export const companionInsightGenerator = new CompanionInsightGenerator();
