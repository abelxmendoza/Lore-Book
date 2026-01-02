import { logger } from '../../logger';
import type { SocialEdge, Community } from './types';

/**
 * Detects communities (clusters) in the social network
 * Groups people who frequently interact together
 */
export class CommunityDetector {
  /**
   * Detect communities from edges
   */
  detect(edges: SocialEdge[]): Community[] {
    const communities: Community[] = [];

    try {
      // Build adjacency map
      const adjacency: Record<string, Set<string>> = {};

      for (const edge of edges) {
        if (!adjacency[edge.source]) {
          adjacency[edge.source] = new Set();
        }
        if (!adjacency[edge.target]) {
          adjacency[edge.target] = new Set();
        }

        adjacency[edge.source].add(edge.target);
        adjacency[edge.target].add(edge.source);
      }

      // Simple community detection: find connected components
      const visited = new Set<string>();
      let communityId = 0;

      for (const person of Object.keys(adjacency)) {
        if (visited.has(person)) continue;

        // BFS to find connected component
        const component: string[] = [];
        const queue = [person];
        visited.add(person);

        while (queue.length > 0) {
          const current = queue.shift()!;
          component.push(current);

          const neighbors = adjacency[current] || new Set();
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              queue.push(neighbor);
            }
          }
        }

        // Only create community if it has at least 2 members
        if (component.length >= 2) {
          const theme = this.inferTheme(component, edges);

          communities.push({
            id: `community_${communityId++}`,
            members: component,
            theme,
            size: component.length,
            cohesion: this.calculateCohesion(component, edges),
            metadata: {},
          });
        }
      }

      logger.debug({ communities: communities.length }, 'Detected communities');

      return communities;
    } catch (error) {
      logger.error({ error }, 'Failed to detect communities');
      return [];
    }
  }

  /**
   * Infer theme for a community
   */
  private inferTheme(members: string[], edges: SocialEdge[]): string {
    // Find edges within this community
    const communityEdges = edges.filter(
      e => members.includes(e.source) && members.includes(e.target)
    );

    // Analyze interaction text for themes
    const allText = communityEdges
      .flatMap(e => e.interactions)
      .join(' ')
      .toLowerCase();

    // Theme patterns
    if (/gym|bjj|muay thai|training|sparring|rolling/i.test(allText)) {
      return 'training';
    }
    if (/family|mom|dad|abuela|home/i.test(allText)) {
      return 'family';
    }
    if (/work|office|colleague|team|project/i.test(allText)) {
      return 'work';
    }
    if (/friend|hangout|party|social|club/i.test(allText)) {
      return 'social';
    }
    if (/robotics|code|tech|project|build/i.test(allText)) {
      return 'tech';
    }

    return 'interaction cluster';
  }

  /**
   * Calculate cohesion (how connected the community is)
   */
  private calculateCohesion(members: string[], edges: SocialEdge[]): number {
    if (members.length < 2) return 0;

    // Count edges within community
    const internalEdges = edges.filter(
      e => members.includes(e.source) && members.includes(e.target)
    );

    // Maximum possible edges in a complete graph
    const maxEdges = (members.length * (members.length - 1)) / 2;

    // Cohesion = actual edges / max possible edges
    return Math.min(1, internalEdges.length / maxEdges);
  }
}

