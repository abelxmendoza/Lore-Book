import { logger } from '../../logger';
import { timeEngine } from '../timeEngine';

import type { Event, TemporalGraph, TemporalEdge } from './types';
import { applyIntervalAlgebra } from './utils/intervalAlgebra';

/**
 * Builds temporal graphs from events using interval algebra
 */
export class TemporalGraphBuilder {
  private readonly MIN_CONFIDENCE = 0.3;

  /**
   * Build a temporal graph from events
   */
  build(events: Event[]): TemporalGraph {
    const edges: TemporalEdge[] = [];

    // Normalize all timestamps using Time Engine
    const normalizedEvents = events.map(event => {
      if (!event.timestamp) return event;

      try {
        const ref = timeEngine.parseTimestamp(event.timestamp);
        return {
          ...event,
          timestamp: ref.timestamp.toISOString(),
        };
      } catch (error) {
        logger.debug({ error, eventId: event.id }, 'Failed to normalize timestamp');
        return event;
      }
    });

    // Build edges between all event pairs
    for (let i = 0; i < normalizedEvents.length; i++) {
      for (let j = i + 1; j < normalizedEvents.length; j++) {
        const edge = applyIntervalAlgebra(normalizedEvents[i], normalizedEvents[j]);

        if (edge && edge.confidence >= this.MIN_CONFIDENCE) {
          edges.push(edge);
        }
      }
    }

    // Detect temporal conflicts using Time Engine
    const timestamps = normalizedEvents
      .filter(e => e.timestamp)
      .map(e => e.timestamp!);

    if (timestamps.length > 1) {
      const conflicts = timeEngine.detectTemporalConflicts(
        timestamps.map(ts => new Date(ts)),
        60 // 60 minute threshold
      );

      if (conflicts.length > 0) {
        logger.debug(
          { conflictCount: conflicts.length },
          'Temporal conflicts detected in graph'
        );
      }
    }

    return {
      nodes: normalizedEvents,
      edges,
    };
  }

  /**
   * Build a temporal graph with causal inference hints
   * Adds "causes" relationships based on semantic similarity and temporal proximity
   */
  buildWithCausality(events: Event[]): TemporalGraph {
    const graph = this.build(events);

    // Enhance edges with causal hints
    const enhancedEdges = graph.edges.map(edge => {
      const sourceEvent = graph.nodes.find(n => n.id === edge.source);
      const targetEvent = graph.nodes.find(n => n.id === edge.target);

      if (!sourceEvent || !targetEvent) return edge;

      // Check if this could be a causal relationship
      if (
        (edge.relation === 'before' || edge.relation === 'meets') &&
        sourceEvent.embedding &&
        targetEvent.embedding &&
        sourceEvent.embedding.length === targetEvent.embedding.length
      ) {
        const semanticSimilarity = this.cosineSimilarity(
          sourceEvent.embedding,
          targetEvent.embedding
        );

        // If semantically similar and temporally close, might be causal
        if (semanticSimilarity > 0.6 && edge.confidence > 0.7) {
          return {
            ...edge,
            relation: 'causes' as const,
            confidence: Math.min(1.0, edge.confidence * semanticSimilarity),
            metadata: {
              ...edge.metadata,
              causalHint: true,
              semanticSimilarity,
            },
          };
        }
      }

      return edge;
    });

    return {
      nodes: graph.nodes,
      edges: enhancedEdges,
    };
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

