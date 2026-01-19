import { logger } from '../../logger';

import type { Goal, GoalInsight, GoalContext } from './types';

/**
 * Detects and tracks goal milestones
 */
export class MilestoneDetector {
  /**
   * Detect milestone achievements
   */
  detect(goals: Goal[], ctx: GoalContext): GoalInsight[] {
    const insights: GoalInsight[] = [];

    for (const goal of goals) {
      if (!goal.milestones || goal.milestones.length === 0) {
        // Try to extract milestones from goal description or entries
        const extracted = this.extractMilestones(goal, ctx);
        if (extracted.length > 0) {
          goal.milestones = extracted;
        }
        continue;
      }

      // Check each milestone
      for (const milestone of goal.milestones) {
        // If milestone is marked as achieved but doesn't have achieved_at
        if (milestone.achieved && !milestone.achieved_at) {
          milestone.achieved_at = new Date().toISOString();

          insights.push({
            id: crypto.randomUUID(),
            type: 'milestone',
            message: `Milestone achieved for "${goal.title}": ${milestone.description}`,
            confidence: 0.95,
            timestamp: milestone.achieved_at,
            related_goal_id: goal.id,
            metadata: {
              milestone_id: milestone.id,
              milestone_description: milestone.description,
            },
          });
        }

        // Check if milestone should be marked as achieved based on entries
        if (!milestone.achieved && this.isMilestoneAchieved(milestone, goal, ctx)) {
          milestone.achieved = true;
          milestone.achieved_at = new Date().toISOString();

          insights.push({
            id: crypto.randomUUID(),
            type: 'milestone',
            message: `Milestone achieved for "${goal.title}": ${milestone.description}`,
            confidence: 0.85,
            timestamp: milestone.achieved_at,
            related_goal_id: goal.id,
            metadata: {
              milestone_id: milestone.id,
              milestone_description: milestone.description,
              auto_detected: true,
            },
          });
        }
      }
    }

    return insights;
  }

  /**
   * Extract milestones from goal description or related entries
   */
  private extractMilestones(goal: Goal, ctx: GoalContext): Goal['milestones'] {
    const milestones: Goal['milestones'] = [];

    // Look for milestone patterns in description
    const description = goal.description || '';
    const milestonePatterns = [
      /(?:first|step 1|milestone 1)[:\-]\s*(.+)/i,
      /(?:second|step 2|milestone 2)[:\-]\s*(.+)/i,
      /(?:third|step 3|milestone 3)[:\-]\s*(.+)/i,
    ];

    for (const pattern of milestonePatterns) {
      const match = description.match(pattern);
      if (match && match[1]) {
        milestones.push({
          id: crypto.randomUUID(),
          description: match[1].trim(),
          achieved: false,
        });
      }
    }

    // Look for bullet points or numbered lists
    const lines = description.split('\n');
    for (const line of lines) {
      const bulletMatch = line.match(/^[-*•]\s*(.+)/);
      const numberMatch = line.match(/^\d+[.)]\s*(.+)/);
      
      if (bulletMatch || numberMatch) {
        const text = (bulletMatch?.[1] || numberMatch?.[1] || '').trim();
        if (text.length > 5 && text.length < 100) {
          milestones.push({
            id: crypto.randomUUID(),
            description: text,
            achieved: false,
          });
        }
      }
    }

    return milestones;
  }

  /**
   * Check if milestone is achieved based on entries
   */
  private isMilestoneAchieved(
    milestone: Goal['milestones']![0],
    goal: Goal,
    ctx: GoalContext
  ): boolean {
    const milestoneText = milestone.description.toLowerCase();
    const goalTitle = goal.title.toLowerCase();

    // Check recent entries for milestone achievement
    const recentEntries = (ctx.entries || [])
      .filter((e: any) => {
        const entryDate = new Date(e.date || e.created_at);
        const goalDate = new Date(goal.updated_at);
        return entryDate >= goalDate;
      })
      .slice(0, 10);

    for (const entry of recentEntries) {
      const content = (entry.content || '').toLowerCase();
      
      // Check if entry mentions both goal and milestone
      if (content.includes(goalTitle) && content.includes(milestoneText)) {
        // Check for achievement keywords
        const achievementKeywords = ['achieved', 'completed', 'done', 'finished', 'accomplished'];
        if (achievementKeywords.some(kw => content.includes(kw))) {
          return true;
        }
      }
    }

    return false;
  }
}

