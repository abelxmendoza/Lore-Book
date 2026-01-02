import { logger } from '../../logger';
import type { MemoryComponent } from '../../types';
import { supabaseAdmin } from '../supabaseClient';

/**
 * Abandoned Goal Detection Service
 * Finds goals mentioned but not referenced again after a threshold period
 */
class AbandonedGoalDetectionService {
  private readonly ABANDONMENT_THRESHOLD_DAYS = 30; // Default: 30 days
  private readonly GOAL_KEYWORDS = [
    'goal',
    'want to',
    'plan',
    'planning',
    'working on',
    'aiming',
    'trying to',
    'hope to',
    'wish to',
    'intend to',
    'going to',
    'will',
    'objective',
    'target',
    'aspiration',
    'dream',
    'ambition',
  ];

  /**
   * Detect abandoned goals
   */
  async detectAbandonedGoals(
    components: MemoryComponent[],
    userId: string,
    thresholdDays: number = this.ABANDONMENT_THRESHOLD_DAYS
  ): Promise<Array<{
    event_type: 'abandoned_goal';
    description: string;
    source_components: string[];
    severity: number;
    metadata: Record<string, unknown>;
  }>> {
    const abandonedGoals: Array<{
      event_type: 'abandoned_goal';
      description: string;
      source_components: string[];
      severity: number;
      metadata: Record<string, unknown>;
    }> = [];

    // 1. Extract all goal components
    const goalComponents = this.extractGoalComponents(components);

    if (goalComponents.length === 0) {
      return abandonedGoals;
    }

    // 2. Group goals by topic/action
    const goalGroups = this.groupGoalsByTopic(goalComponents);

    // 3. Check each goal group for abandonment
    const now = new Date();

    for (const group of goalGroups) {
      // Find most recent mention
      const mostRecent = group.components.reduce((latest, current) => {
        const currentTime = new Date(current.timestamp || current.created_at || 0).getTime();
        const latestTime = new Date(latest.timestamp || latest.created_at || 0).getTime();
        return currentTime > latestTime ? current : latest;
      });

      const mostRecentTime = new Date(mostRecent.timestamp || mostRecent.created_at || 0);
      const daysSinceLastMention = (now.getTime() - mostRecentTime.getTime()) / (1000 * 60 * 60 * 24);

      // Check if goal is abandoned
      if (daysSinceLastMention >= thresholdDays) {
        // Check if goal was actually worked on (look for progress indicators)
        const hasProgress = await this.checkGoalProgress(group.components, userId);

        if (!hasProgress) {
          const goalText = this.extractGoalText(mostRecent.text);
          const severity = this.calculateSeverity(daysSinceLastMention, group.components.length);

          abandonedGoals.push({
            event_type: 'abandoned_goal',
            description: `Abandoned goal detected: "${goalText}" (last mentioned ${Math.round(daysSinceLastMention)} days ago)`,
            source_components: group.components.map(c => c.id),
            severity,
            metadata: {
              goal_text: goalText,
              days_since_last_mention: Math.round(daysSinceLastMention),
              mention_count: group.components.length,
              first_mentioned: group.components[0].timestamp || group.components[0].created_at,
              last_mentioned: mostRecent.timestamp || mostRecent.created_at,
            },
          });
        }
      }
    }

    return abandonedGoals;
  }

  /**
   * Extract components that mention goals
   */
  private extractGoalComponents(components: MemoryComponent[]): MemoryComponent[] {
    return components.filter(component => {
      const text = component.text.toLowerCase();

      // Check for goal keywords
      for (const keyword of this.GOAL_KEYWORDS) {
        if (text.includes(keyword)) {
          return true;
        }
      }

      // Check component type
      if (component.component_type === 'decision' || component.component_type === 'thought') {
        // More likely to contain goals
        return true;
      }

      return false;
    });
  }

  /**
   * Group goals by topic/action
   */
  private groupGoalsByTopic(
    goalComponents: MemoryComponent[]
  ): Array<{ components: MemoryComponent[]; topic: string }> {
    const groups: Map<string, MemoryComponent[]> = new Map();

    for (const component of goalComponents) {
      const topic = this.extractGoalTopic(component.text);

      if (!groups.has(topic)) {
        groups.set(topic, []);
      }

      groups.get(topic)!.push(component);
    }

    return Array.from(groups.entries()).map(([topic, components]) => ({
      topic,
      components: components.sort((a, b) => {
        const timeA = new Date(a.timestamp || a.created_at || 0).getTime();
        const timeB = new Date(b.timestamp || b.created_at || 0).getTime();
        return timeA - timeB;
      }),
    }));
  }

  /**
   * Extract goal topic from text
   */
  private extractGoalTopic(text: string): string {
    // Extract action/topic after goal keywords
    const lowerText = text.toLowerCase();

    for (const keyword of this.GOAL_KEYWORDS) {
      const index = lowerText.indexOf(keyword);
      if (index !== -1) {
        // Extract next few words after keyword
        const afterKeyword = text.slice(index + keyword.length).trim();
        const words = afterKeyword.split(/\s+/).slice(0, 5);
        return words.join(' ').toLowerCase();
      }
    }

    // Fallback: extract first few meaningful words
    const words = text.split(/\s+/).slice(0, 5);
    return words.join(' ').toLowerCase();
  }

  /**
   * Extract goal text for description
   */
  private extractGoalText(text: string): string {
    const lowerText = text.toLowerCase();

    for (const keyword of this.GOAL_KEYWORDS) {
      const index = lowerText.indexOf(keyword);
      if (index !== -1) {
        // Extract sentence containing goal
        const start = Math.max(0, text.lastIndexOf('.', index));
        const end = text.indexOf('.', index);
        if (end !== -1) {
          return text.slice(start + 1, end).trim();
        }
        return text.slice(Math.max(0, index - 50), index + 100).trim();
      }
    }

    return text.slice(0, 100);
  }

  /**
   * Check if goal has progress indicators
   */
  private async checkGoalProgress(
    goalComponents: MemoryComponent[],
    userId: string
  ): Promise<boolean> {
    // Look for progress keywords in components
    const progressKeywords = [
      'progress',
      'achieved',
      'completed',
      'finished',
      'done',
      'accomplished',
      'succeeded',
      'working on',
      'making progress',
      'getting closer',
      'almost',
      'nearly',
    ];

    for (const component of goalComponents) {
      const text = component.text.toLowerCase();
      for (const keyword of progressKeywords) {
        if (text.includes(keyword)) {
          return true;
        }
      }
    }

    // Check for related entries that might indicate progress
    // This could be enhanced with semantic search
    const goalText = this.extractGoalText(goalComponents[0].text);
    const goalKeywords = goalText.split(/\s+/).slice(0, 3);

    // Search for entries mentioning these keywords
    const { data: entries } = await supabaseAdmin
      .from('journal_entries')
      .select('id, content')
      .eq('user_id', userId)
      .limit(100);

    if (entries) {
      for (const entry of entries) {
        const content = entry.content.toLowerCase();
        const matches = goalKeywords.filter(keyword => content.includes(keyword.toLowerCase()));
        if (matches.length >= 2) {
          // Check if entry is after goal mention
          const goalTime = new Date(goalComponents[0].timestamp || goalComponents[0].created_at || 0).getTime();
          const entryTime = new Date((entry as any).date || (entry as any).created_at || 0).getTime();

          if (entryTime > goalTime) {
            // Check for progress indicators
            for (const keyword of progressKeywords) {
              if (content.includes(keyword)) {
                return true;
              }
            }
          }
        }
      }
    }

    return false;
  }

  /**
   * Calculate severity based on days since last mention and mention count
   */
  private calculateSeverity(daysSinceLastMention: number, mentionCount: number): number {
    // More mentions = higher severity (more important goal)
    // More days = higher severity (more abandoned)
    const daysScore = Math.min(10, Math.round(daysSinceLastMention / 10));
    const mentionScore = Math.min(5, mentionCount);
    return Math.max(1, Math.min(10, daysScore + mentionScore));
  }
}

export const abandonedGoalDetectionService = new AbandonedGoalDetectionService();

