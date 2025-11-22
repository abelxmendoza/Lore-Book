import { logger } from '../../logger';
import type { Goal, GoalInsight, GoalContext } from './types';

/**
 * Analyzes goal dependencies
 */
export class DependencyAnalyzer {
  /**
   * Analyze dependencies between goals
   */
  analyze(goals: Goal[], ctx: GoalContext): GoalInsight[] {
    const insights: GoalInsight[] = [];

    for (const goal of goals) {
      const deps = this.findDependencies(goal, goals, ctx);
      
      if (deps.length > 0) {
        // Update goal dependencies
        goal.dependencies = deps;

        // Check if dependencies are blocking
        const blockingDeps = this.findBlockingDependencies(deps, goals);
        
        if (blockingDeps.length > 0) {
          insights.push({
            id: crypto.randomUUID(),
            type: 'dependency_warning',
            message: `Goal "${goal.title}" depends on incomplete goals: ${blockingDeps.map(d => `"${d}"`).join(', ')}. Consider completing these first.`,
            confidence: 0.8,
            timestamp: new Date().toISOString(),
            related_goal_id: goal.id,
            metadata: {
              dependencies: deps,
              blocking_dependencies: blockingDeps,
            },
          });
        } else {
          insights.push({
            id: crypto.randomUUID(),
            type: 'dependency_warning',
            message: `Goal "${goal.title}" depends on: ${deps.join(', ')}.`,
            confidence: 0.6,
            timestamp: new Date().toISOString(),
            related_goal_id: goal.id,
            metadata: {
              dependencies: deps,
            },
          });
        }
      }
    }

    return insights;
  }

  /**
   * Find dependencies for a goal
   */
  private findDependencies(goal: Goal, allGoals: Goal[], ctx: GoalContext): string[] {
    const dependencies: string[] = [];
    const goalTitle = goal.title.toLowerCase();
    const goalDescription = (goal.description || '').toLowerCase();

    // Semantic dependency rules
    const dependencyRules: Array<{ keywords: string[]; dependency: string }> = [
      {
        keywords: ['career', 'job', 'promotion', 'work'],
        dependency: 'Skill Development',
      },
      {
        keywords: ['fitness', 'health', 'exercise', 'workout'],
        dependency: 'Consistency',
      },
      {
        keywords: ['business', 'startup', 'company'],
        dependency: 'Financial Planning',
      },
      {
        keywords: ['relationship', 'dating', 'marriage'],
        dependency: 'Personal Growth',
      },
      {
        keywords: ['travel', 'trip', 'vacation'],
        dependency: 'Financial Planning',
      },
    ];

    // Check for semantic dependencies
    for (const rule of dependencyRules) {
      if (rule.keywords.some(kw => goalTitle.includes(kw) || goalDescription.includes(kw))) {
        // Try to find matching goal
        const matchingGoal = allGoals.find(
          g => g.title.toLowerCase().includes(rule.dependency.toLowerCase())
        );
        
        if (matchingGoal && matchingGoal.id !== goal.id) {
          dependencies.push(matchingGoal.id);
        }
      }
    }

    // Check for explicit dependencies in description
    const explicitDeps = this.extractExplicitDependencies(goal, allGoals);
    dependencies.push(...explicitDeps);

    // Remove duplicates
    return [...new Set(dependencies)];
  }

  /**
   * Extract explicit dependencies from goal description
   */
  private extractExplicitDependencies(goal: Goal, allGoals: Goal[]): string[] {
    const dependencies: string[] = [];
    const description = goal.description || '';

    // Look for patterns like "depends on", "requires", "after", etc.
    const dependencyPatterns = [
      /(?:depends on|requires|after|following)\s+["']?([^"'\n]+)["']?/gi,
      /(?:need|needs)\s+(?:to|first)\s+["']?([^"'\n]+)["']?/gi,
    ];

    for (const pattern of dependencyPatterns) {
      const matches = description.matchAll(pattern);
      for (const match of matches) {
        const depText = match[1]?.trim();
        if (depText) {
          // Try to find matching goal
          const matchingGoal = allGoals.find(
            g => g.title.toLowerCase().includes(depText.toLowerCase()) ||
                 (g.description || '').toLowerCase().includes(depText.toLowerCase())
          );
          
          if (matchingGoal && matchingGoal.id !== goal.id) {
            dependencies.push(matchingGoal.id);
          }
        }
      }
    }

    return dependencies;
  }

  /**
   * Find blocking dependencies (incomplete goals that this goal depends on)
   */
  private findBlockingDependencies(dependencyIds: string[], allGoals: Goal[]): string[] {
    const blocking: string[] = [];

    for (const depId of dependencyIds) {
      const depGoal = allGoals.find(g => g.id === depId);
      if (depGoal && depGoal.status !== 'completed') {
        blocking.push(depGoal.title);
      }
    }

    return blocking;
  }
}

