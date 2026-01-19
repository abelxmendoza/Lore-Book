import { logger } from '../../logger';

import type { SocialNode, SocialEdge } from './types';

/**
 * Builds social graph from edges
 * Creates nodes for each person and aggregates their properties
 */
export class SocialGraphBuilder {
  /**
   * Build graph from edges
   */
  build(edges: SocialEdge[]): Record<string, SocialNode> {
    const graph: Record<string, SocialNode> = {};

    try {
      // Process all edges to build nodes
      for (const edge of edges) {
        // Process source node
        if (!graph[edge.source]) {
          graph[edge.source] = {
            id: edge.source,
            mentions: 0,
            sentiment: 0,
            categories: [],
            first_mentioned: edge.first_interaction,
            last_mentioned: edge.last_interaction,
            metadata: {},
          };
        }

        // Process target node
        if (!graph[edge.target]) {
          graph[edge.target] = {
            id: edge.target,
            mentions: 0,
            sentiment: 0,
            categories: [],
            first_mentioned: edge.first_interaction,
            last_mentioned: edge.last_interaction,
            metadata: {},
          };
        }

        // Update node properties
        graph[edge.source].mentions += edge.weight;
        graph[edge.target].mentions += edge.weight;

        // Update sentiment (weighted average)
        const sourceSentiment = graph[edge.source].sentiment;
        const targetSentiment = graph[edge.target].sentiment;
        const sourceMentions = graph[edge.source].mentions;
        const targetMentions = graph[edge.target].mentions;

        graph[edge.source].sentiment = (sourceSentiment * (sourceMentions - edge.weight) + edge.sentiment * edge.weight) / sourceMentions;
        graph[edge.target].sentiment = (targetSentiment * (targetMentions - edge.weight) + edge.sentiment * edge.weight) / targetMentions;

        // Update timestamps
        if (edge.first_interaction) {
          if (!graph[edge.source].first_mentioned || edge.first_interaction < graph[edge.source].first_mentioned) {
            graph[edge.source].first_mentioned = edge.first_interaction;
          }
          if (!graph[edge.target].first_mentioned || edge.first_interaction < graph[edge.target].first_mentioned) {
            graph[edge.target].first_mentioned = edge.first_interaction;
          }
        }

        if (edge.last_interaction) {
          if (!graph[edge.source].last_mentioned || edge.last_interaction > graph[edge.source].last_mentioned) {
            graph[edge.source].last_mentioned = edge.last_interaction;
          }
          if (!graph[edge.target].last_mentioned || edge.last_interaction > graph[edge.target].last_mentioned) {
            graph[edge.target].last_mentioned = edge.last_interaction;
          }
        }
      }

      // Infer categories from context
      this.inferCategories(graph, edges);

      logger.debug({ nodes: Object.keys(graph).length, edges: edges.length }, 'Built social graph');

      return graph;
    } catch (error) {
      logger.error({ error }, 'Failed to build social graph');
      return {};
    }
  }

  /**
   * Infer categories for nodes based on context
   */
  private inferCategories(graph: Record<string, SocialNode>, edges: SocialEdge[]): void {
    // Category patterns
    const categoryPatterns: Array<{ category: string; patterns: RegExp[] }> = [
      { category: 'family', patterns: [/mom|dad|mother|father|sister|brother|family|abuela|abuelo/i] },
      { category: 'friend', patterns: [/friend|buddy|pal|hangout|chill/i] },
      { category: 'mentor', patterns: [/coach|teacher|mentor|guide|learned from/i] },
      { category: 'colleague', patterns: [/colleague|co-worker|team|work|office/i] },
      { category: 'romantic', patterns: [/girlfriend|boyfriend|date|romantic|love|relationship/i] },
      { category: 'training', patterns: [/gym|bjj|muay thai|training|sparring|rolling/i] },
    ];

    // Check interactions for category clues
    for (const edge of edges) {
      const interactionText = edge.interactions.join(' ').toLowerCase();

      for (const { category, patterns } of categoryPatterns) {
        for (const pattern of patterns) {
          if (pattern.test(interactionText)) {
            // Add category to both nodes
            if (!graph[edge.source].categories.includes(category)) {
              graph[edge.source].categories.push(category);
            }
            if (!graph[edge.target].categories.includes(category)) {
              graph[edge.target].categories.push(category);
            }
          }
        }
      }
    }
  }
}

