import { logger } from '../logger';
import { ActivityResolver } from '../services/activities/activityResolver';
import { AlternateSelfEngine } from '../services/alternateSelf';
import { ArchetypeEngine } from '../services/archetype/archetypeEngine';
import { BehaviorResolver } from '../services/behavior/behaviorResolver';
import { ChronologyEngine } from '../services/chronology';
import { continuityService } from '../services/continuity/continuityService';
import { CognitiveBiasEngine } from '../services/cognitiveBias';
import { ConflictResolver } from '../services/conflict/conflictResolver';
import { CreativeEngine } from '../services/creative/creativeEngine';
import { DecisionEngine } from '../services/decisions/decisionEngine';
import { DistortionEngine } from '../services/distortion';
import { DreamsEngine } from '../services/dreams/dreamsEngine';
import { EmotionResolver } from '../services/emotion/emotionResolver';
import { emotionalIntelligenceEngine } from '../services/emotionalIntelligence/emotionalEngine';
import { EntityResolver } from '../services/entities/entityResolver';
import { FinancialEngine } from '../services/financial/financialEngine';
import { GrowthEngine } from '../services/growth/growthEngine';
import { HabitEngine } from '../services/habits';
import { HealthEngine } from '../services/health/healthEngine';
import { IdentityCoreEngine } from '../services/identityCore/identityCoreEngine';
import { InfluenceEngine } from '../services/influence';
import { InnerDialogueEngine } from '../services/innerDialogue';
import { InnerMythologyEngine } from '../services/innerMythology/innerMythologyEngine';
import { LegacyEngine } from '../services/legacy/legacyEngine';
import { LocationResolver } from '../services/locations/locationResolver';
import { ParacosmEngine } from '../services/paracosm/paracosmEngine';
import { PersonalityEngine } from '../services/personality/personalityEngine';
import { RecommendationEngine } from '../services/recommendation/recommendationEngine';
import { ReflectionEngine } from '../services/reflection/reflectionEngine';
import { ResilienceEngine } from '../services/resilience/resilienceEngine';
import { SceneResolver } from '../services/scenes/sceneResolver';
import { ShadowEngine } from '../services/shadowEngine';
import { SocialNetworkEngine } from '../services/social/socialNetworkEngine';
import { SocialProjectionEngine } from '../services/socialProjection/projectionEngine';
import { StoryOfSelfEngine } from '../services/storyOfSelf';
import { TemporalEventResolver } from '../services/temporalEvents/eventResolver';
import { TimeEngine } from '../services/time/timeEngine';
import { ToxicityResolver } from '../services/toxicity';
import { ValuesEngine } from '../services/values/valuesEngine';
import { WillEngine } from '../services/will/willEngine';
import { IdentityPulseModule } from '../services/analytics/identityPulse';
import { InsightEngineModule } from '../services/analytics/insightEngine';
import { XpEngineModule } from '../services/analytics/xpEngine';
import { essenceProfileService } from '../services/essenceProfileService';
import { TimelineEngine as TimelineStorageEngine } from '../services/timeline/timelineEngine';

import type { EngineFunction, EngineContext } from './types';

/**
 * Engine Registry
 * Maps all engines by name → engine function
 * Engines auto-register here as you add them
 */
export const ENGINE_REGISTRY: Record<string, EngineFunction> = {
  // Core Identity Engines
  identityCore: async (userId: string, ctx: EngineContext) => {
    const engine = new IdentityCoreEngine();
    return await engine.process(ctx);
  },

  archetype: async (userId: string, ctx: EngineContext) => {
    const engine = new ArchetypeEngine();
    return await engine.process(ctx);
  },

  personality: async (userId: string, ctx: EngineContext) => {
    const engine = new PersonalityEngine();
    return await engine.process(ctx);
  },

  // Emotional Intelligence
  eq: async (userId: string, ctx: EngineContext) => {
    // Process all entries for emotional intelligence
    const results = [];
    for (const entry of ctx.entries) {
      const result = await emotionalIntelligenceEngine(entry, userId);
      results.push(result);
    }
    return results[results.length - 1] || {}; // Return latest pattern summary
  },

  // Creative & Output
  creative: async (userId: string, ctx: EngineContext) => {
    const engine = new CreativeEngine();
    return await engine.process(userId);
  },

  // Time Management
  time: async (userId: string, ctx: EngineContext) => {
    const engine = new TimeEngine();
    return await engine.process(userId);
  },

  // Social
  social: async (userId: string, ctx: EngineContext) => {
    const engine = new SocialNetworkEngine();
    return await engine.process(userId);
  },

  reflection: async (userId: string, ctx: EngineContext) => {
    const engine = new ReflectionEngine();
    return await engine.process(userId);
  },

  // Resolution Engines
  entityResolution: async (userId: string, ctx: EngineContext) => {
    const resolver = new EntityResolver();
    return await resolver.process(ctx);
  },

  eventResolution: async (userId: string, ctx: EngineContext) => {
    const resolver = new TemporalEventResolver();
    return await resolver.process(ctx);
  },

  locationResolution: async (userId: string, ctx: EngineContext) => {
    const resolver = new LocationResolver();
    return await resolver.process(ctx);
  },

  activityResolution: async (userId: string, ctx: EngineContext) => {
    const resolver = new ActivityResolver();
    return await resolver.process(ctx);
  },

  emotionResolution: async (userId: string, ctx: EngineContext) => {
    const resolver = new EmotionResolver();
    return await resolver.process(ctx);
  },

  behaviorResolution: async (userId: string, ctx: EngineContext) => {
    const resolver = new BehaviorResolver();
    return await resolver.process(ctx);
  },

  // Scene & Conflict
  scenes: async (userId: string, ctx: EngineContext) => {
    const resolver = new SceneResolver();
    return await resolver.process(ctx);
  },

  conflicts: async (userId: string, ctx: EngineContext) => {
    const resolver = new ConflictResolver();
    return await resolver.process(ctx);
  },

  toxicity: async (userId: string, ctx: EngineContext) => {
    const resolver = new ToxicityResolver();
    return await resolver.process(ctx);
  },

  // Paracosm & Mythology
  paracosm: async (userId: string, ctx: EngineContext) => {
    const engine = new ParacosmEngine();
    return await engine.process(ctx);
  },

  socialProjection: async (userId: string, ctx: EngineContext) => {
    const engine = new SocialProjectionEngine();
    return await engine.process(ctx);
  },

  innerMythology: async (userId: string, ctx: EngineContext) => {
    const engine = new InnerMythologyEngine();
    return await engine.process(ctx);
  },

  // Additional Identity & Self Engines
  storyOfSelf: async (userId: string, ctx: EngineContext) => {
    const engine = new StoryOfSelfEngine();
    return await engine.process({ entries: ctx.entries });
  },

  innerDialogue: async (userId: string, ctx: EngineContext) => {
    const engine = new InnerDialogueEngine();
    return await engine.process({ entries: ctx.entries });
  },

  alternateSelf: async (userId: string, ctx: EngineContext) => {
    const engine = new AlternateSelfEngine();
    return await engine.process({ entries: ctx.entries });
  },

  cognitiveBias: async (userId: string, ctx: EngineContext) => {
    const engine = new CognitiveBiasEngine();
    return await engine.process({ entries: ctx.entries });
  },

  distortion: async (userId: string, ctx: EngineContext) => {
    const engine = new DistortionEngine();
    return await engine.process({ entries: ctx.entries });
  },

  shadow: async (userId: string, ctx: EngineContext) => {
    const engine = new ShadowEngine();
    return await engine.process(userId, ctx.entries, true);
  },

  will: async (userId: string, ctx: EngineContext) => {
    const engine = new WillEngine();
    if (ctx.entries.length === 0) {
      return { will_events: [] };
    }
    
    const latestEntry = ctx.entries[0];
    
    try {
      const { EmotionResolver } = await import('../services/emotion/emotionResolver');
      const { IdentityCoreEngine } = await import('../services/identityCore/identityCoreEngine');
      const emotionResolver = new EmotionResolver();
      const identityEngine = new IdentityCoreEngine();
      
      const recentEntries = ctx.entries.slice(0, 10);
      const emotionEvents = await emotionResolver.process({
        entries: recentEntries,
        user: { id: userId },
      }).catch(() => []);
      
      const identityData = await identityEngine.process(ctx).catch(() => null);
      const identityStatements = identityData?.identity_statements || [];
      
      const followUpEntries = ctx.entries.slice(1, 4).map(e => ({
        content: e.content,
        date: e.date,
      }));
      
      const willEvents = await engine.process(
        {
          id: latestEntry.id,
          content: latestEntry.content,
          date: latestEntry.date,
          user_id: userId,
        },
        {
          entry: latestEntry,
          emotion_events: emotionEvents.map(e => ({
            emotion: e.emotion,
            intensity: e.intensity,
            polarity: e.polarity,
          })),
          identity_statements: identityStatements.map((s: any) => ({
            claim: s.text || s.claim || s,
            confidence: s.confidence || 0.7,
          })),
          past_patterns: [],
          follow_up_entries: followUpEntries,
        }
      );
      
      return { will_events: willEvents };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to process will events');
      return { will_events: [] };
    }
  },

  // Life Domain Engines
  health: async (userId: string, ctx: EngineContext) => {
    const engine = new HealthEngine();
    return await engine.process(userId);
  },

  financial: async (userId: string, ctx: EngineContext) => {
    const engine = new FinancialEngine();
    return await engine.process(userId);
  },

  habits: async (userId: string, ctx: EngineContext) => {
    const engine = new HabitEngine();
    return await engine.process(userId);
  },

  decisions: async (userId: string, ctx: EngineContext) => {
    const engine = new DecisionEngine();
    return await engine.process(userId);
  },

  resilience: async (userId: string, ctx: EngineContext) => {
    const engine = new ResilienceEngine();
    return await engine.process(userId);
  },

  influence: async (userId: string, ctx: EngineContext) => {
    const engine = new InfluenceEngine();
    return await engine.process(userId);
  },

  growth: async (userId: string, ctx: EngineContext) => {
    const engine = new GrowthEngine();
    return await engine.process(userId);
  },

  legacy: async (userId: string, ctx: EngineContext) => {
    const engine = new LegacyEngine();
    return await engine.process(userId);
  },

  values: async (userId: string, ctx: EngineContext) => {
    const engine = new ValuesEngine();
    return await engine.process(userId);
  },

  dreams: async (userId: string, ctx: EngineContext) => {
    const engine = new DreamsEngine();
    return await engine.process(userId);
  },

  recommendation: async (userId: string, ctx: EngineContext) => {
    const engine = new RecommendationEngine();
    return await engine.generateRecommendations(userId);
  },

  chronology: async (userId: string, ctx: EngineContext) => {
    try {
      const engine = new ChronologyEngine();
      if (ctx.entries.length === 0) {
        return { graph: { nodes: [], edges: [] }, causalChains: [], gaps: [], patterns: [], metadata: { eventCount: 0 } };
      }
      const events = ctx.entries.map(entry => ({
        id: entry.id || '',
        content: entry.content,
        date: entry.date,
        type: 'journal_entry' as const,
        metadata: entry.metadata || {},
        timestamp: entry.date || new Date().toISOString(),
        embedding: [] as number[],
      }));
      const result = await engine.process(events);
      const { chronologyStorageService } = await import('../services/chronology/storageService');
      await chronologyStorageService.saveChronologyResult(userId, result);
      return result;
    } catch (error) {
      logger.warn({ engine: 'chronology', error }, 'Chronology engine error');
      return { message: 'Chronology engine error', error: String(error) };
    }
  },

  // ── Governance engines (were in ENGINE_DESCRIPTORS but had no runtime handler) ──

  identityPulse: async (userId: string, _ctx: EngineContext) => {
    try {
      const module = new IdentityPulseModule();
      return await module.run(userId);
    } catch (error) {
      logger.warn({ error, userId }, 'identityPulse engine failed');
      return { metrics: {}, charts: [], insights: [], metadata: {} };
    }
  },

  essenceProfile: async (userId: string, _ctx: EngineContext) => {
    try {
      return await essenceProfileService.getProfile(userId);
    } catch (error) {
      logger.warn({ error, userId }, 'essenceProfile engine failed');
      return { hopes: [], dreams: [], fears: [], strengths: [], weaknesses: [], topSkills: [], coreValues: [], personalityTraits: [], relationshipPatterns: [], evolution: [] };
    }
  },

  insightEngine: async (userId: string, _ctx: EngineContext) => {
    try {
      const module = new InsightEngineModule();
      return await module.run(userId);
    } catch (error) {
      logger.warn({ error, userId }, 'insightEngine engine failed');
      return { metrics: {}, charts: [], insights: [], metadata: {} };
    }
  },

  timelineEngine: async (userId: string, _ctx: EngineContext) => {
    try {
      const engine = new TimelineStorageEngine();
      const events = await engine.getTimeline(userId, { limit: 200 });
      return { events, count: events.length };
    } catch (error) {
      logger.warn({ error, userId }, 'timelineEngine engine failed');
      return { events: [], count: 0 };
    }
  },

  xpEngine: async (userId: string, _ctx: EngineContext) => {
    try {
      const module = new XpEngineModule();
      return await module.run(userId);
    } catch (error) {
      logger.warn({ error, userId }, 'xpEngine engine failed');
      return { metrics: {}, charts: [], insights: [], metadata: {} };
    }
  },

  continuity: async (userId: string, ctx: EngineContext) => {
    try {
      const result = await continuityService.runContinuityAnalysis(userId);
      return {
        events: result.events,
        summary: result.summary,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Continuity engine failed');
      return {
        events: [],
        summary: {
          contradictions: 0,
          abandonedGoals: 0,
          arcShifts: 0,
          identityDrifts: 0,
          emotionalTransitions: 0,
          thematicDrifts: 0,
        },
        error: String(error),
      };
    }
  },
};

/**
 * Get all registered engine names
 */
export function getEngineNames(): string[] {
  return Object.keys(ENGINE_REGISTRY);
}

/**
 * Check if an engine is registered
 */
export function hasEngine(name: string): boolean {
  return name in ENGINE_REGISTRY;
}

