import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type {
  SocialNetworkOutput,
  SocialContext,
  SocialInsight,
} from './types';
import { RelationshipEdgeExtractor } from './relationshipEdgeExtractor';
import { SocialGraphBuilder } from './socialGraphBuilder';
import { InfluenceAnalyzer } from './influenceAnalyzer';
import { CommunityDetector } from './communityDetector';
import { ToxicityAnalyzer } from './toxicityAnalyzer';
import { CentralityCalculator } from './centralityCalculator';
import { DriftDetector } from './driftDetector';
import { NetworkScoreService } from './networkScore';

/**
 * Main Social Network Engine
 * Analyzes social relationships, influence, communities, and network health
 */
export class SocialNetworkEngine {
  private edgeExtractor: RelationshipEdgeExtractor;
  private graphBuilder: SocialGraphBuilder;
  private influenceAnalyzer: InfluenceAnalyzer;
  private communityDetector: CommunityDetector;
  private toxicityAnalyzer: ToxicityAnalyzer;
  private centralityCalculator: CentralityCalculator;
  private driftDetector: DriftDetector;
  private scoreService: NetworkScoreService;

  constructor() {
    this.edgeExtractor = new RelationshipEdgeExtractor();
    this.graphBuilder = new SocialGraphBuilder();
    this.influenceAnalyzer = new InfluenceAnalyzer();
    this.communityDetector = new CommunityDetector();
    this.toxicityAnalyzer = new ToxicityAnalyzer();
    this.centralityCalculator = new CentralityCalculator();
    this.driftDetector = new DriftDetector();
    this.scoreService = new NetworkScoreService();
  }

  /**
   * Process social network for a user
   */
  async process(userId: string): Promise<SocialNetworkOutput> {
    try {
      logger.debug({ userId }, 'Processing social network');

      // Build context
      const context = await this.buildContext(userId);

      // Extract edges
      const edges = this.edgeExtractor.extract(context.entries || []);
      edges.forEach(e => { e.user_id = userId; });

      // Build graph
      const nodes = this.graphBuilder.build(edges);
      Object.values(nodes).forEach(n => {
        n.metadata = { ...n.metadata, user_id: userId };
      });

      // Analyze influence
      const influence = this.influenceAnalyzer.rank(nodes);
      influence.forEach(i => { i.user_id = userId; });

      // Detect communities
      const communities = this.communityDetector.detect(edges);
      communities.forEach(c => { c.user_id = userId; });

      // Detect toxicity
      const toxic = this.toxicityAnalyzer.detect(edges);
      toxic.forEach(t => { t.user_id = userId; });

      // Calculate centrality
      const centrality = this.centralityCalculator.compute(edges);

      // Detect drift
      const drift = this.driftDetector.detect(context.entries || []);
      drift.forEach(d => { d.user_id = userId; });

      // Compute network score
      const score = this.scoreService.compute({
        communities,
        drift,
        influence,
        toxic,
        nodes: Object.keys(nodes).length,
        edges: edges.length,
      });

      // Generate insights
      const insights: SocialInsight[] = [];

      // Relationship insights
      if (edges.length > 0) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'relationship_detected',
          message: `${edges.length} relationships detected in your social network.`,
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          user_id: userId,
          metadata: {
            edge_count: edges.length,
            node_count: Object.keys(nodes).length,
          },
        });
      }

      // Influence insights
      if (influence.length > 0) {
        const topInfluencers = this.influenceAnalyzer.getTopInfluencers(influence, 3);
        insights.push({
          id: crypto.randomUUID(),
          type: 'influence_identified',
          message: `Top influencers: ${topInfluencers.map(i => i.person).join(', ')}`,
          timestamp: new Date().toISOString(),
          confidence: 0.85,
          user_id: userId,
          metadata: {
            top_influencers: topInfluencers,
          },
        });
      }

      // Community insights
      if (communities.length > 0) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'community_detected',
          message: `${communities.length} communities detected: ${communities.map(c => c.theme).join(', ')}`,
          timestamp: new Date().toISOString(),
          confidence: 0.8,
          user_id: userId,
          metadata: {
            communities: communities.map(c => ({ id: c.id, theme: c.theme, size: c.size })),
          },
        });
      }

      // Toxicity insights
      if (toxic.length > 0) {
        const mostToxic = this.toxicityAnalyzer.getMostToxic(toxic, 3);
        insights.push({
          id: crypto.randomUUID(),
          type: 'toxicity_detected',
          message: `${toxic.length} toxic relationship signals detected. Most concerning: ${mostToxic.map(t => t.person).join(', ')}`,
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          user_id: userId,
          metadata: {
            toxic_count: toxic.length,
            most_toxic: mostToxic,
          },
        });
      }

      // Drift insights
      const fading = drift.filter(d => d.trend === 'fading');
      const growing = drift.filter(d => d.trend === 'growing');
      if (fading.length > 0 || growing.length > 0) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'drift_detected',
          message: `${fading.length} relationships fading, ${growing.length} relationships growing.`,
          timestamp: new Date().toISOString(),
          confidence: 0.8,
          user_id: userId,
          metadata: {
            fading: fading.map(d => d.person),
            growing: growing.map(d => d.person),
          },
        });
      }

      // Centrality insights
      const mostCentral = this.centralityCalculator.getMostCentral(centrality, 3);
      if (mostCentral.length > 0) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'centrality_identified',
          message: `Most central relationships: ${mostCentral.map(c => c.person).join(', ')}`,
          timestamp: new Date().toISOString(),
          confidence: 0.85,
          user_id: userId,
          metadata: {
            most_central: mostCentral,
          },
        });
      }

      // Network health insights
      const healthCategory = this.scoreService.getCategory(score.overall);
      insights.push({
        id: crypto.randomUUID(),
        type: 'network_health',
        message: `Network health: ${healthCategory} (${(score.overall * 100).toFixed(0)}%)`,
        timestamp: new Date().toISOString(),
        confidence: 0.9,
        user_id: userId,
        metadata: {
          score: score.overall,
          category: healthCategory,
          breakdown: {
            cohesion: score.cohesion,
            stability: score.stability,
            influenceBalance: score.influenceBalance,
            toxicityLevel: score.toxicityLevel,
          },
        },
      });

      // Add user_id to all insights
      insights.forEach(i => { i.user_id = userId; });

      logger.info(
        {
          userId,
          nodes: Object.keys(nodes).length,
          edges: edges.length,
          communities: communities.length,
          influence: influence.length,
          toxic: toxic.length,
          drift: drift.length,
          networkScore: score.overall,
          insights: insights.length,
        },
        'Processed social network'
      );

      return {
        nodes,
        edges,
        influence,
        communities,
        toxic,
        centrality,
        drift,
        score,
        insights,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to process social network');
      return {
        nodes: {},
        edges: [],
        influence: [],
        communities: [],
        toxic: [],
        centrality: {},
        drift: [],
        score: {
          cohesion: 0.5,
          stability: 0.5,
          influenceBalance: 0.5,
          toxicityLevel: 0.5,
          overall: 0.5,
          timestamp: new Date().toISOString(),
        },
        insights: [],
      };
    }
  }

  /**
   * Build social context from entries
   */
  private async buildContext(userId: string): Promise<SocialContext> {
    const context: SocialContext = {};

    try {
      // Get recent entries
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1000); // More entries for social network analysis

      context.entries = entries || [];

      // Get relationship data if available
      // TODO: Fetch from relationship analytics if needed

      // Get identity pulse data if available
      // TODO: Fetch from identity pulse service if needed

      // Get chronology data if available
      // TODO: Fetch from chronology engine if needed

    } catch (error) {
      logger.error({ error }, 'Failed to build social context');
    }

    return context;
  }
}

