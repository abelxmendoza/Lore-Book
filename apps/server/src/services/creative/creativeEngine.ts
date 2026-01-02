import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type {
  CreativeOutput,
  CreativeContext,
  CreativeInsight,
  CreativeMedium,
} from './types';
import { CreativeExtractor } from './creativeExtractor';
import { MediumClassifier } from './mediumClassifier';
import { FlowDetector } from './flowDetector';
import { BlockDetector } from './blockDetector';
import { InspirationSourceExtractor } from './inspirationSources';
import { CreativeCycleDetector } from './cycleDetector';
import { ProjectLifecycleEngine } from './projectLifecycle';
import { CreativeScoreService } from './creativeScore';

/**
 * Main Creative Output Engine
 * Tracks creativity, output pacing, flow states, blocks, and project lifecycles
 */
export class CreativeEngine {
  private extractor: CreativeExtractor;
  private mediumClassifier: MediumClassifier;
  private flowDetector: FlowDetector;
  private blockDetector: BlockDetector;
  private inspirationExtractor: InspirationSourceExtractor;
  private cycleDetector: CreativeCycleDetector;
  private projectEngine: ProjectLifecycleEngine;
  private scoreService: CreativeScoreService;

  constructor() {
    this.extractor = new CreativeExtractor();
    this.mediumClassifier = new MediumClassifier();
    this.flowDetector = new FlowDetector();
    this.blockDetector = new BlockDetector();
    this.inspirationExtractor = new InspirationSourceExtractor();
    this.cycleDetector = new CreativeCycleDetector();
    this.projectEngine = new ProjectLifecycleEngine();
    this.scoreService = new CreativeScoreService();
  }

  /**
   * Process creative intelligence for a user
   */
  async process(userId: string): Promise<CreativeOutput> {
    try {
      logger.debug({ userId }, 'Processing creative intelligence');

      // Build context
      const context = await this.buildContext(userId);

      // Extract creative events
      const events = this.extractor.extract(context.entries || []);
      events.forEach(e => { e.user_id = userId; });

      // Classify by medium
      const mediums = this.mediumClassifier.classify(events);

      // Detect flow states
      const flowStates = this.flowDetector.detect(context.entries || []);
      flowStates.forEach(f => { f.user_id = userId; });

      // Detect creative blocks
      const blocks = this.blockDetector.detect(context.entries || []);
      blocks.forEach(b => { b.user_id = userId; });

      // Extract inspiration sources
      const inspiration = this.inspirationExtractor.extract(context.entries || []);
      inspiration.forEach(i => { i.user_id = userId; });

      // Detect cycles
      const cycles = this.cycleDetector.detect(events, flowStates);

      // Detect project lifecycles
      const projectStages = this.projectEngine.detect(events);
      projectStages.forEach(p => { p.user_id = userId; });

      // Compute creative score
      const score = this.scoreService.compute(events, flowStates, inspiration);

      // Generate insights
      const insights: CreativeInsight[] = [];

      // Creative event insights
      if (events.length > 0) {
        const topMediums = this.mediumClassifier.getTopMediums(events, 3);
        insights.push({
          id: crypto.randomUUID(),
          type: 'creative_event_detected',
          message: `${events.length} creative events detected. Top mediums: ${topMediums.map(m => m.medium).join(', ')}`,
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          user_id: userId,
          metadata: {
            event_count: events.length,
            top_mediums: topMediums,
          },
        });
      }

      // Flow state insights
      if (flowStates.length > 0) {
        const avgFlow = this.flowDetector.getAverageFlowLevel(flowStates);
        insights.push({
          id: crypto.randomUUID(),
          type: 'flow_state_detected',
          message: `${flowStates.length} flow states detected. Average flow level: ${(avgFlow * 100).toFixed(0)}%`,
          timestamp: new Date().toISOString(),
          confidence: 0.85,
          user_id: userId,
          metadata: {
            flow_count: flowStates.length,
            average_flow: avgFlow,
          },
        });
      }

      // Creative block insights
      if (blocks.length > 0) {
        const unresolvedBlocks = blocks.filter(b => !b.resolved);
        if (unresolvedBlocks.length > 0) {
          const blockTypes = [...new Set(unresolvedBlocks.map(b => b.type))];
          insights.push({
            id: crypto.randomUUID(),
            type: 'creative_block_detected',
            message: `${unresolvedBlocks.length} unresolved creative blocks detected. Types: ${blockTypes.join(', ')}`,
            timestamp: new Date().toISOString(),
            confidence: 0.8,
            user_id: userId,
            metadata: {
              block_count: unresolvedBlocks.length,
              block_types: blockTypes,
            },
          });
        }
      }

      // Inspiration insights
      if (inspiration.length > 0) {
        const inspirationDist = this.inspirationExtractor.getInspirationDistribution(inspiration);
        const topSources = Object.entries(inspirationDist)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([type]) => type);

        insights.push({
          id: crypto.randomUUID(),
          type: 'inspiration_source',
          message: `Top inspiration sources: ${topSources.join(', ')}`,
          timestamp: new Date().toISOString(),
          confidence: 0.75,
          user_id: userId,
          metadata: {
            inspiration_count: inspiration.length,
            top_sources: topSources,
          },
        });
      }

      // Cycle insights
      cycles.forEach(cycle => {
        insights.push({
          id: crypto.randomUUID(),
          type: 'cycle_detected',
          message: `${cycle.cycleType} cycle detected.`,
          timestamp: new Date().toISOString(),
          confidence: cycle.confidence || 0.6,
          user_id: userId,
          metadata: {
            cycle_type: cycle.cycleType,
            phases: cycle.phases,
          },
        });
      });

      // Project stage change insights
      const activeProjects = projectStages.filter(p => 
        p.stage !== 'dormant' && p.stage !== 'abandoned'
      );
      if (activeProjects.length > 0) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'project_stage_change',
          message: `${activeProjects.length} active projects: ${activeProjects.map(p => `${p.projectName} (${p.stage})`).join(', ')}`,
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          user_id: userId,
          metadata: {
            active_projects: activeProjects.map(p => ({
              name: p.projectName,
              stage: p.stage,
            })),
          },
        });
      }

      // Output increase/decrease insights
      if (events.length > 5) {
        const sorted = [...events].sort((a, b) => {
          const dateA = new Date(a.timestamp).getTime();
          const dateB = new Date(b.timestamp).getTime();
          return dateA - dateB;
        });

        const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
        const secondHalf = sorted.slice(Math.floor(sorted.length / 2));

        if (secondHalf.length > firstHalf.length * 1.5) {
          insights.push({
            id: crypto.randomUUID(),
            type: 'output_increase',
            message: `Creative output increased by ${((secondHalf.length / firstHalf.length - 1) * 100).toFixed(0)}%`,
            timestamp: new Date().toISOString(),
            confidence: 0.8,
            user_id: userId,
            metadata: {
              first_half: firstHalf.length,
              second_half: secondHalf.length,
            },
          });
        } else if (secondHalf.length < firstHalf.length * 0.7) {
          insights.push({
            id: crypto.randomUUID(),
            type: 'output_decrease',
            message: `Creative output decreased by ${((1 - secondHalf.length / firstHalf.length) * 100).toFixed(0)}%`,
            timestamp: new Date().toISOString(),
            confidence: 0.8,
            user_id: userId,
            metadata: {
              first_half: firstHalf.length,
              second_half: secondHalf.length,
            },
          });
        }
      }

      // Medium shift insights
      const mediumCounts = this.mediumClassifier.classify(events);
      const topMediums = Object.entries(mediumCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2);

      if (topMediums.length === 2 && topMediums[0][1] > topMediums[1][1] * 2) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'medium_shift',
          message: `Primary creative medium: ${topMediums[0][0]} (${topMediums[0][1]} events)`,
          timestamp: new Date().toISOString(),
          confidence: 0.75,
          user_id: userId,
          medium: topMediums[0][0] as CreativeMedium,
          metadata: {
            primary_medium: topMediums[0][0],
            count: topMediums[0][1],
          },
        });
      }

      // Add user_id to all insights
      insights.forEach(i => { i.user_id = userId; });

      logger.info(
        {
          userId,
          events: events.length,
          flowStates: flowStates.length,
          blocks: blocks.length,
          inspiration: inspiration.length,
          projects: projectStages.length,
          creativeScore: score.overall,
          insights: insights.length,
        },
        'Processed creative intelligence'
      );

      return {
        events,
        mediums,
        flowStates,
        blocks,
        inspiration,
        cycles,
        projectStages,
        score,
        insights,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to process creative intelligence');
      return {
        events: [],
        mediums: {
          coding: 0,
          art: 0,
          music: 0,
          writing: 0,
          video: 0,
          robotics: 0,
          design: 0,
          performance: 0,
          unknown: 0,
        },
        flowStates: [],
        blocks: [],
        inspiration: [],
        cycles: [],
        projectStages: [],
        score: {
          output: 0.5,
          consistency: 0.5,
          flow: 0.5,
          inspiration: 0.5,
          overall: 0.5,
        },
        insights: [],
      };
    }
  }

  /**
   * Build creative context from entries
   */
  private async buildContext(userId: string): Promise<CreativeContext> {
    const context: CreativeContext = {};

    try {
      // Get recent entries
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1000); // More entries for creative analysis

      context.entries = entries || [];

      // Get chronology data if available
      // TODO: Fetch from chronology engine if needed

      // Get identity pulse data if available
      // TODO: Fetch from identity pulse service if needed

      // Get emotional intelligence data if available
      // TODO: Fetch from EQ engine if needed

    } catch (error) {
      logger.error({ error }, 'Failed to build creative context');
    }

    return context;
  }
}

