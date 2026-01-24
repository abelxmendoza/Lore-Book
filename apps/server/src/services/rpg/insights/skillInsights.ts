/**
 * Skill Insight Generator
 * Converts skill stats to growth narratives
 * Never shows levels - only progression stories
 */

import { supabaseAdmin } from '../../supabaseClient';
import type { SkillTree } from '../skillTreeEngine';

export interface SkillInsight {
  text: string;
  skillId: string;
  skillName: string;
  type: 'progression' | 'synergy' | 'growth' | 'connection' | 'narrative' | 'temporal';
  storyContext?: {
    timeline?: string;
    evolution?: string;
    frequency?: string;
    significance?: string;
  };
}

export class SkillInsightGenerator {
  /**
   * Generate insights for a skill with story-driven context
   */
  async generateInsights(userId: string, tree: SkillTree): Promise<SkillInsight[]> {
    const insights: SkillInsight[] = [];

    // Get skill context
    const skillContext = await this.getSkillContext(userId, tree);
    const skillEvolution = await this.getSkillEvolution(userId, tree);

    // Progression insights with narrative
    if (tree.currentLevel >= 5) {
      const progressionNarrative = this.buildProgressionNarrative(tree, skillContext, skillEvolution);
      insights.push({
        text: progressionNarrative.text,
        skillId: tree.skillId,
        skillName: tree.skillName,
        type: 'progression',
        storyContext: {
          timeline: skillContext.timeline,
          evolution: skillEvolution.trend,
          significance: progressionNarrative.significance,
        },
      });
    } else if (tree.currentLevel >= 3) {
      const progressText = `You're making progress with ${tree.skillName}${skillContext.recentActivity ? ` ${skillContext.recentActivity}` : ''}. ${skillEvolution.trend || 'Your development is ongoing'}.`;
      insights.push({
        text: progressText,
        skillId: tree.skillId,
        skillName: tree.skillName,
        type: 'progression',
      });
    }

    // Synergy insights with context
    if (tree.synergies.length > 0) {
      const { data: synSkills } = await supabaseAdmin
        .from('skills')
        .select('skill_name')
        .eq('user_id', userId)
        .in('id', tree.synergies)
        .eq('is_active', true);

      if (synSkills && synSkills.length > 0) {
        const synNames = synSkills.map(s => s.skill_name).join(', ');
        const synergyNarrative = this.buildSynergyNarrative(tree.skillName, synNames);
        insights.push({
          text: synergyNarrative.text,
          skillId: tree.skillId,
          skillName: tree.skillName,
          type: 'synergy',
          storyContext: {
            significance: synergyNarrative.significance,
          },
        });
      }
    }

    // Growth insights with narrative
    if (tree.masteryLevel > 0) {
      const masteryNarrative = this.buildMasteryNarrative(tree, skillContext);
      insights.push({
        text: masteryNarrative.text,
        skillId: tree.skillId,
        skillName: tree.skillName,
        type: 'growth',
        storyContext: {
          evolution: masteryNarrative.evolution,
          significance: masteryNarrative.significance,
        },
      });
    }

    // Connection insights (prerequisites) with story
    if (tree.prerequisites.length > 0) {
      const { data: prereqSkills } = await supabaseAdmin
        .from('skills')
        .select('skill_name')
        .eq('user_id', userId)
        .in('skill_name', tree.prerequisites)
        .eq('is_active', true);

      if (prereqSkills && prereqSkills.length > 0) {
        const connectionNarrative = this.buildConnectionNarrative(tree.skillName, prereqSkills.map(s => s.skill_name));
        insights.push({
          text: connectionNarrative.text,
          skillId: tree.skillId,
          skillName: tree.skillName,
          type: 'connection',
          storyContext: {
            significance: connectionNarrative.significance,
          },
        });
      }
    }

    // Narrative arc insights
    if (skillEvolution.hasArc) {
      insights.push({
        text: skillEvolution.arcText,
        skillId: tree.skillId,
        skillName: tree.skillName,
        type: 'narrative',
        storyContext: {
          evolution: skillEvolution.arcSummary,
        },
      });
    }

    return insights;
  }

  /**
   * Get skill context
   */
  private async getSkillContext(userId: string, tree: SkillTree): Promise<{
    timeline: string;
    recentActivity: string;
    practiceFrequency: string;
  }> {
    try {
      const { data: skill } = await supabaseAdmin
        .from('skills')
        .select('first_mentioned_at, last_practiced_at, practice_count')
        .eq('id', tree.skillId)
        .eq('user_id', userId)
        .single();

      if (!skill) {
        return { timeline: '', recentActivity: '', practiceFrequency: '' };
      }

      let timeline = '';
      if (skill.first_mentioned_at) {
        const firstDate = new Date(skill.first_mentioned_at);
        const monthsAgo = Math.floor((Date.now() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
        if (monthsAgo > 0) {
          timeline = `for ${monthsAgo} month${monthsAgo > 1 ? 's' : ''}`;
        }
      }

      let recentActivity = '';
      if (skill.last_practiced_at) {
        const lastPractice = new Date(skill.last_practiced_at);
        const daysSince = Math.floor((Date.now() - lastPractice.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince <= 7) recentActivity = 'this week';
        else if (daysSince <= 30) recentActivity = 'this month';
        else if (daysSince <= 90) recentActivity = 'recently';
      }

      const practiceFrequency = skill.practice_count >= 20
        ? 'frequently'
        : skill.practice_count >= 10
        ? 'regularly'
        : 'occasionally';

      return { timeline, recentActivity, practiceFrequency };
    } catch (error) {
      return { timeline: '', recentActivity: '', practiceFrequency: '' };
    }
  }

  /**
   * Get skill evolution
   */
  private async getSkillEvolution(userId: string, tree: SkillTree): Promise<{
    hasArc: boolean;
    trend: string;
    arcText: string;
    arcSummary: string;
  }> {
    const hasArc = tree.currentLevel >= 5 || tree.masteryLevel > 0;

    const trend = tree.currentLevel >= 7
      ? 'Your skills have been developing steadily'
      : tree.currentLevel >= 5
      ? 'You\'re making consistent progress'
      : 'Your development is ongoing';

    const arcText = tree.masteryLevel > 0
      ? `Your journey with ${tree.skillName} has been one of continuous growth. You've reached a level of mastery that shows dedication and persistence.`
      : tree.currentLevel >= 7
      ? `Your ${tree.skillName} skills have developed significantly. You've been consistently practicing and growing.`
      : '';

    const arcSummary = tree.masteryLevel > 0
      ? 'You\'ve achieved mastery through dedicated practice'
      : tree.currentLevel >= 7
      ? 'Your skills have developed significantly over time'
      : 'Your skills are evolving';

    return { hasArc, trend, arcText, arcSummary };
  }

  /**
   * Build progression narrative
   */
  private buildProgressionNarrative(
    tree: SkillTree,
    context: { timeline: string; practiceFrequency: string },
    evolution: { trend: string }
  ): {
    text: string;
    significance: string;
  } {
    let text = `You've been developing your ${tree.skillName} skills`;
    
    if (context.timeline) {
      text += ` ${context.timeline}`;
    }

    if (context.practiceFrequency) {
      text += `, practicing ${context.practiceFrequency}`;
    }

    const significance = tree.currentLevel >= 7
      ? 'Your consistent practice has led to significant development'
      : 'Your dedication to this skill is showing results';

    return { text, significance };
  }

  /**
   * Build synergy narrative
   */
  private buildSynergyNarrative(skillName: string, synNames: string): {
    text: string;
    significance: string;
  } {
    const text = `Your ${skillName} skills complement your ${synNames} abilities. These skills work together, creating a stronger foundation.`;

    const significance = 'The connection between these skills shows how your abilities build on each other';

    return { text, significance };
  }

  /**
   * Build mastery narrative
   */
  private buildMasteryNarrative(
    tree: SkillTree,
    context: { timeline: string }
  ): {
    text: string;
    evolution: string;
    significance: string;
  } {
    let text = `You're becoming more confident in ${tree.skillName}`;
    
    if (tree.masteryLevel >= 2) {
      text += `, reaching advanced levels of proficiency`;
    }

    const evolution = context.timeline
      ? `Over ${context.timeline}, you've developed deep expertise`
      : 'You\'ve developed significant expertise';

    const significance = tree.masteryLevel >= 2
      ? 'You\'ve achieved advanced mastery through dedicated practice'
      : 'Your mastery level shows commitment to continuous improvement';

    return { text, evolution, significance };
  }

  /**
   * Build connection narrative
   */
  private buildConnectionNarrative(skillName: string, prereqNames: string[]): {
    text: string;
    significance: string;
  } {
    const prereqList = prereqNames.length === 1
      ? prereqNames[0]
      : prereqNames.slice(0, -1).join(', ') + `, and ${prereqNames[prereqNames.length - 1]}`;

    const text = `Your ${skillName} builds on your foundation in ${prereqList}. These skills form a connected path of development.`;

    const significance = 'Your skill development shows a thoughtful progression, building expertise step by step';

    return { text, significance };
  }

  /**
   * Generate insights for all skills
   */
  async generateAllInsights(userId: string, trees: SkillTree[]): Promise<SkillInsight[]> {
    const allInsights: SkillInsight[] = [];

    for (const tree of trees) {
      const insights = await this.generateInsights(userId, tree);
      allInsights.push(...insights);
    }

    return allInsights;
  }
}

export const skillInsightGenerator = new SkillInsightGenerator();
