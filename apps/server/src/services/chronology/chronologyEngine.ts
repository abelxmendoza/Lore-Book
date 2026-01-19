import { logger } from '../../logger';

import { AmbiguityResolver } from './ambiguityResolver';
import { CausalInference } from './causalInference';
import { GapDetector } from './gapDetector';
import { NarrativeBuilder } from './narrativeBuilder';
import { PatternDetector } from './patternDetector';
import { PythonAnalyticsClient } from './pythonClient';
import { TemporalGraphBuilder } from './temporalGraph';
import type { Event, ChronologyResult } from './types';

/**
 * Main Chronology Engine orchestrator
 */
export class ChronologyEngine {
  private graphBuilder: TemporalGraphBuilder;
  private causal: CausalInference;
  private gaps: GapDetector;
  private ambiguous: AmbiguityResolver;
  private narrative: NarrativeBuilder;
  private patterns: PatternDetector;
  private python: PythonAnalyticsClient;

  constructor() {
    this.graphBuilder = new TemporalGraphBuilder();
    this.causal = new CausalInference();
    this.gaps = new GapDetector();
    this.ambiguous = new AmbiguityResolver();
    this.narrative = new NarrativeBuilder();
    this.patterns = new PatternDetector();
    this.python = new PythonAnalyticsClient();
  }

  /**
   * Process events through the full chronology pipeline
   */
  async process(events: Event[]): Promise<ChronologyResult> {
    if (events.length === 0) {
      return {
        graph: { nodes: [], edges: [] },
        causalChains: [],
        gaps: [],
        patterns: [],
        metadata: { eventCount: 0 },
      };
    }

    try {
      // Step 1: Resolve temporal ambiguities
      logger.debug({ eventCount: events.length }, 'Resolving temporal ambiguities');
      const resolved = this.ambiguous.resolve(events);

      // Step 2: Build temporal graph
      logger.debug({ resolvedCount: resolved.length }, 'Building temporal graph');
      const graph = this.graphBuilder.buildWithCausality(resolved);

      // Step 3: Infer causal chains
      logger.debug({ edgeCount: graph.edges.length }, 'Inferring causal chains');
      const causalChains = this.causal.infer(graph);

      // Step 4: Detect gaps
      logger.debug('Detecting temporal gaps');
      const gaps = this.gaps.detect(resolved);

      // Step 5: Detect patterns (basic)
      logger.debug('Detecting temporal patterns');
      const patterns = this.patterns.detect(resolved);

      // Step 6: Run Python analytics (async, non-blocking)
      logger.debug('Running Python analytics');
      let pythonAnalytics;
      try {
        pythonAnalytics = await this.python.runAdvancedAnalytics(resolved);
      } catch (error) {
        logger.warn({ error }, 'Python analytics failed, continuing without it');
        pythonAnalytics = undefined;
      }

      return {
        graph,
        causalChains,
        gaps,
        patterns,
        pythonAnalytics,
        metadata: {
          eventCount: events.length,
          resolvedCount: resolved.length,
          edgeCount: graph.edges.length,
          chainCount: causalChains.length,
          gapCount: gaps.length,
          patternCount: patterns.length,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Chronology engine processing failed');
      // Return empty result on failure
      return {
        graph: { nodes: events, edges: [] },
        causalChains: [],
        gaps: [],
        patterns: [],
        metadata: {
          eventCount: events.length,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Build narrative sequence from events
   */
  async buildNarrative(root: Event, events: Event[]): Promise<ChronologyResult & { narrative?: any }> {
    const result = await this.process(events);
    const narrative = await this.narrative.build(root, events);
    return {
      ...result,
      narrative,
    };
  }
}

