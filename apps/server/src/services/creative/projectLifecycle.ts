import { logger } from '../../logger';

import type { CreativeEvent, ProjectLifecycle, ProjectStage } from './types';

/**
 * Tracks project lifecycle stages
 */
export class ProjectLifecycleEngine {
  /**
   * Detect project lifecycles from events
   */
  detect(events: CreativeEvent[]): ProjectLifecycle[] {
    const projects: ProjectLifecycle[] = [];

    try {
      // Group events by project
      const byProject: Record<string, CreativeEvent[]> = {};

      events.forEach((e) => {
        const projectName = this.guessProjectName(e.description);
        if (!byProject[projectName]) {
          byProject[projectName] = [];
        }
        byProject[projectName].push(e);
      });

      // Create project lifecycles
      for (const [projectName, projectEvents] of Object.entries(byProject)) {
        if (projectEvents.length === 0) continue;

        // Sort by timestamp
        const sorted = [...projectEvents].sort((a, b) => {
          const dateA = new Date(a.timestamp).getTime();
          const dateB = new Date(b.timestamp).getTime();
          return dateA - dateB;
        });

        const firstMentioned = sorted[0].timestamp;
        const lastUpdated = sorted[sorted.length - 1].timestamp;
        const stage = this.computeStage(projectEvents, sorted);

        projects.push({
          id: `project_${projectName}_${Date.now()}`,
          projectName,
          stage,
          indicators: sorted.map(e => e.description.substring(0, 100)),
          first_mentioned: firstMentioned,
          last_updated: lastUpdated,
          event_count: projectEvents.length,
          metadata: {
            events: projectEvents.map(e => ({
              id: e.id,
              timestamp: e.timestamp,
              action: e.action,
            })),
          },
        });
      }

      logger.debug({ projects: projects.length, events: events.length }, 'Detected project lifecycles');

      return projects;
    } catch (error) {
      logger.error({ error }, 'Failed to detect project lifecycles');
      return [];
    }
  }

  /**
   * Guess project name from description
   */
  private guessProjectName(text: string): string {
    const projectPatterns = [
      /(omega|omega technologies|omega tech)/i,
      /(hood runner|hoodrunner)/i,
      /(memoir|autobiography|life story)/i,
      /(lore keeper|lorekeeper)/i,
      /(video|youtube|content)/i,
      /(coding|app|application|software|project)/i,
      /(robot|robotics|hardware)/i,
      /(art|artwork|illustration)/i,
      /(music|song|album|track)/i,
      /(book|novel|story)/i,
    ];

    for (const pattern of projectPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0].toLowerCase().trim();
      }
    }

    // Extract first few words as project name
    const words = text.split(/\s+/).slice(0, 3).join(' ').toLowerCase();
    return words.length > 0 ? words : 'misc';
  }

  /**
   * Compute project stage
   */
  private computeStage(events: CreativeEvent[], sorted: CreativeEvent[]): ProjectStage {
    const eventCount = events.length;
    const actionCounts: Record<string, number> = {};

    events.forEach(e => {
      actionCounts[e.action] = (actionCounts[e.action] || 0) + 1;
    });

    // Check for abandoned projects
    const abandonedCount = actionCounts['abandoned'] || 0;
    if (abandonedCount > 0 && abandonedCount >= eventCount * 0.3) {
      return 'abandoned';
    }

    // Check for dormant projects (no activity in last 30 days)
    const lastEvent = sorted[sorted.length - 1];
    const daysSinceLastEvent = (Date.now() - new Date(lastEvent.timestamp).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastEvent > 30 && eventCount > 0) {
      return 'dormant';
    }

    // Check for completed projects
    const completedCount = actionCounts['completed'] || 0;
    if (completedCount > 0) {
      return 'release';
    }

    // Check for published projects
    const publishedCount = actionCounts['published'] || 0;
    if (publishedCount > 0) {
      return 'release';
    }

    // Stage based on event count and actions
    if (eventCount < 2) {
      return 'seed';
    } else if (eventCount < 5) {
      return 'development';
    } else if (eventCount < 10) {
      return 'execution';
    } else if (eventCount < 15) {
      return 'refinement';
    } else {
      return 'release';
    }
  }
}

