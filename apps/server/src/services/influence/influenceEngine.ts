import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import { BehavioralImpact } from './behavioralImpact';
import { EmotionalImpact } from './emotionalImpact';
import { InfluenceExtractor } from './influenceExtractor';
import { InfluenceScorer } from './influenceScorer';
import { InfluenceTimeline } from './influenceTimeline';
import { InteractionAnalyzer } from './interactionAnalyzer';
import { RiskZones } from './riskZones';
import type { PersonInfluence, InfluenceEvent, InfluenceInsight, InfluenceContext } from './types';

/**
 * Main Influence Engine
 * Analyzes how people influence emotional state and behavior
 */
export class InfluenceEngine {
  private extractor: InfluenceExtractor;
  private analyzer: InteractionAnalyzer;
  private emotional: EmotionalImpact;
  private behavioral: BehavioralImpact;
  private risk: RiskZones;
  private scorer: InfluenceScorer;
  private timeline: InfluenceTimeline;

  constructor() {
    this.extractor = new InfluenceExtractor();
    this.analyzer = new InteractionAnalyzer();
    this.emotional = new EmotionalImpact();
    this.behavioral = new BehavioralImpact();
    this.risk = new RiskZones();
    this.scorer = new InfluenceScorer();
    this.timeline = new InfluenceTimeline();
  }

  /**
   * Process influence for a user
   */
  async process(userId: string): Promise<{
    profiles: PersonInfluence[];
    insights: InfluenceInsight[];
    events: InfluenceEvent[];
  }> {
    try {
      logger.debug({ userId }, 'Processing influence');

      // Build influence context
      const context = await this.buildContext(userId);

      // Extract influence events
      const events = this.extractor.extract(context);
      
      // Add user_id to all events
      events.forEach(e => { e.user_id = userId; });

      // Build profiles by person
      const profilesByPerson = this.analyzer.buildProfiles(events);

      // Process each person's profile
      const finalProfiles: PersonInfluence[] = [];
      const insights: InfluenceInsight[] = [];

      for (const [person, personEvents] of Object.entries(profilesByPerson)) {
        const emotionalImpact = this.emotional.compute(personEvents);
        const behavioralImpact = this.behavioral.compute(personEvents);
        const toxicityScore = this.risk.compute(emotionalImpact, behavioralImpact);
        const upliftScore = this.risk.computeUplift(emotionalImpact, behavioralImpact);
        const frequency = this.analyzer.getFrequency(personEvents);
        const netInfluence = this.scorer.compute({
          emotionalImpact,
          behavioralImpact,
          toxicityScore,
          upliftScore,
          frequency,
        });

        // Get first and last interaction
        const sortedEvents = [...personEvents].sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        const profile: PersonInfluence = {
          id: `profile_${person}_${userId}`,
          user_id: userId,
          person,
          emotional_impact: emotionalImpact,
          behavioral_impact: behavioralImpact,
          frequency,
          toxicity_score: toxicityScore,
          uplift_score: upliftScore,
          net_influence: netInfluence,
          interaction_count: personEvents.length,
          first_interaction: sortedEvents[0]?.timestamp,
          last_interaction: sortedEvents[sortedEvents.length - 1]?.timestamp,
          metadata: {
            trend: this.timeline.detectTrend(personEvents),
            recent_influence: this.timeline.getRecentInfluence(personEvents),
            behavior_breakdown: this.behavioral.getBehaviorBreakdown(personEvents),
            emotional_volatility: this.emotional.computeVolatility(personEvents),
            timeline: this.timeline.buildTimeline(personEvents),
          },
        };

        finalProfiles.push(profile);

        // Generate insights
        const personInsights = this.generateInsights(profile, personEvents);
        insights.push(...personInsights);
      }

      // Add user_id to insights
      insights.forEach(i => { i.user_id = userId; });

      // Sort profiles by net influence
      finalProfiles.sort((a, b) => b.net_influence - a.net_influence);

      logger.info(
        { userId, profiles: finalProfiles.length, insights: insights.length, events: events.length },
        'Processed influence'
      );

      return { profiles: finalProfiles, insights, events };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to process influence');
      return { profiles: [], insights: [], events: [] };
    }
  }

  /**
   * Generate insights for a person's profile
   */
  private generateInsights(profile: PersonInfluence, events: InfluenceEvent[]): InfluenceInsight[] {
    const insights: InfluenceInsight[] = [];

    // High risk person
    if (profile.toxicity_score > 0.7) {
      insights.push({
        id: crypto.randomUUID(),
        type: 'high_risk_person',
        person: profile.person,
        message: `${profile.person} is having a strong negative effect on your mood and behavior.`,
        timestamp: new Date().toISOString(),
        confidence: 0.9,
        metadata: {
          toxicity_score: profile.toxicity_score,
          emotional_impact: profile.emotional_impact,
          behavioral_impact: profile.behavioral_impact,
        },
      });
    }

    // Uplifting person
    if (profile.net_influence > 0.5) {
      insights.push({
        id: crypto.randomUUID(),
        type: 'uplifting_person',
        person: profile.person,
        message: `${profile.person} consistently improves your mood and habits.`,
        timestamp: new Date().toISOString(),
        confidence: 0.85,
        metadata: {
          net_influence: profile.net_influence,
          uplift_score: profile.uplift_score,
        },
      });
    }

    // Toxic pattern
    if (profile.toxicity_score > 0.5 && profile.frequency > 2) {
      insights.push({
        id: crypto.randomUUID(),
        type: 'toxic_pattern',
        person: profile.person,
        message: `Recurring negative pattern detected with ${profile.person}.`,
        timestamp: new Date().toISOString(),
        confidence: 0.8,
        metadata: {
          toxicity_score: profile.toxicity_score,
          frequency: profile.frequency,
        },
      });
    }

    // Positive influence
    if (profile.uplift_score > 0.6 && profile.frequency > 2) {
      insights.push({
        id: crypto.randomUUID(),
        type: 'positive_influence',
        person: profile.person,
        message: `${profile.person} has a consistently positive influence on your life.`,
        timestamp: new Date().toISOString(),
        confidence: 0.85,
        metadata: {
          uplift_score: profile.uplift_score,
          frequency: profile.frequency,
        },
      });
    }

    // Dominant influence (high frequency and significant impact)
    if (profile.frequency > 5 && Math.abs(profile.net_influence) > 0.4) {
      insights.push({
        id: crypto.randomUUID(),
        type: 'dominant_influence',
        person: profile.person,
        message: `${profile.person} has a dominant ${profile.net_influence > 0 ? 'positive' : 'negative'} influence in your life.`,
        timestamp: new Date().toISOString(),
        confidence: 0.75,
        metadata: {
          net_influence: profile.net_influence,
          frequency: profile.frequency,
        },
      });
    }

    return insights;
  }

  /**
   * Build influence context from entries
   */
  private async buildContext(userId: string): Promise<InfluenceContext> {
    const context: InfluenceContext = {};

    try {
      // Get recent entries
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(500);

      context.entries = entries || [];

      // Get relationships data if available
      // TODO: Fetch from relationship analytics if needed

      // Get identity pulse data if available
      // TODO: Fetch from identity pulse service if needed

      // Get timeline data if available
      // TODO: Fetch from timeline service if needed

    } catch (error) {
      logger.error({ error }, 'Failed to build influence context');
    }

    return context;
  }
}

