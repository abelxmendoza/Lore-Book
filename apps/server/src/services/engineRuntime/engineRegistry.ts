import { logger } from '../../logger';


// Import all engines
import { AlternateSelfEngine } from '../alternateSelf';
import { ArchetypeEngine } from '../archetype';
import { ChronologyEngine } from '../chronology';
import { CognitiveBiasEngine } from '../cognitiveBias';
import { CreativeEngine } from '../creative';
import { HealthEngine } from '../health';
import { FinancialEngine } from '../financial';
import { HabitsEngine } from '../habits';
import { DecisionEngine } from '../decisions';
import { DistortionEngine } from '../distortion';
import { ResilienceEngine } from '../resilience';
import { GrowthEngine } from '../growth';
import { LegacyEngine } from '../legacy';
import { ValuesEngine } from '../values';
import { DreamsEngine } from '../dreams';
import { EQEngine } from '../emotionalIntelligence';
import { IdentityCoreEngine } from '../identityCore';
import { InfluenceEngine } from '../influence';
import { InnerDialogueEngine } from '../innerDialogue';
import { ParacosmEngine } from '../paracosm';
import { RecommendationEngine } from '../recommendation';
import { ReflectionEngine } from '../reflection';
import { ShadowEngine } from '../shadowEngine';
import { SocialProjectionEngine } from '../socialProjection';
import { StoryOfSelfEngine } from '../storyOfSelf';
import { WillEngine } from '../will';

import type { EngineContext } from './contextBuilder';

export type EngineFunction = (userId: string, ctx: EngineContext) => Promise<any>;

/**
 * Engine Registry
 * Maps all engines by name → engine function
 * Engines auto-register here as you add them
 */
export const ENGINE_REGISTRY: Record<string, EngineFunction> = {
  storyOfSelf: async (userId, ctx) => {
    const engine = new StoryOfSelfEngine();
    return await engine.process({ entries: ctx.entries });
  },

  paracosm: async (userId, ctx) => {
    const engine = new ParacosmEngine();
    return await engine.process({ entries: ctx.entries });
  },

  innerDialogue: async (userId, ctx) => {
    const engine = new InnerDialogueEngine();
    return await engine.process({ entries: ctx.entries });
  },

  alternateSelf: async (userId, ctx) => {
    const engine = new AlternateSelfEngine();
    return await engine.process({ entries: ctx.entries });
  },

  cognitiveBias: async (userId, ctx) => {
    const engine = new CognitiveBiasEngine();
    return await engine.process({ entries: ctx.entries });
  },

  distortion: async (userId, ctx) => {
    const engine = new DistortionEngine();
    return await engine.process({ entries: ctx.entries });
  },

  shadow: async (userId, ctx) => {
    const engine = new ShadowEngine();
    return await engine.process(userId, ctx.entries, true);
  },

  archetype: async (userId, ctx) => {
    const engine = new ArchetypeEngine();
    return await engine.process(userId);
  },

  chronology: async (userId, ctx) => {
    // Chronology engine needs events, not just userId
    // For now, return empty result - can be enhanced later
    logger.warn({ userId }, 'Chronology engine requires events array, skipping');
    return { error: 'Chronology engine requires events array' };
  },

  identityCore: async (userId, ctx) => {
    const engine = new IdentityCoreEngine();
    return await engine.process(userId);
  },

  socialProjection: async (userId, ctx) => {
    const engine = new SocialProjectionEngine();
    return await engine.process(userId);
  },

  reflection: async (userId, ctx) => {
    const engine = new ReflectionEngine();
    return await engine.process(userId);
  },

  eq: async (userId, ctx) => {
    const engine = new EQEngine();
    return await engine.process(userId);
  },

  creative: async (userId, ctx) => {
    const engine = new CreativeEngine();
    return await engine.process(userId);
  },

  health: async (userId, ctx) => {
    const engine = new HealthEngine();
    return await engine.process(userId);
  },

  financial: async (userId, ctx) => {
    const engine = new FinancialEngine();
    return await engine.process(userId);
  },

  habits: async (userId, ctx) => {
    const engine = new HabitsEngine();
    return await engine.process(userId);
  },

  decisions: async (userId, ctx) => {
    const engine = new DecisionEngine();
    return await engine.process(userId);
  },

  resilience: async (userId, ctx) => {
    const engine = new ResilienceEngine();
    return await engine.process(userId);
  },

  influence: async (userId, ctx) => {
    const engine = new InfluenceEngine();
    return await engine.process(userId);
  },

  growth: async (userId, ctx) => {
    const engine = new GrowthEngine();
    return await engine.process(userId);
  },

  legacy: async (userId, ctx) => {
    const engine = new LegacyEngine();
    return await engine.process(userId);
  },

  values: async (userId, ctx) => {
    const engine = new ValuesEngine();
    return await engine.process(userId);
  },

  dreams: async (userId, ctx) => {
    const engine = new DreamsEngine();
    return await engine.process(userId);
  },

  recommendation: async (userId, ctx) => {
    const engine = new RecommendationEngine();
    return await engine.generateRecommendations(userId);
  },

  will: async (userId, ctx) => {
    const engine = new WillEngine();
    // Process latest entry with context from emotion and identity
    if (ctx.entries.length === 0) {
      return { will_events: [] };
    }
    
    const latestEntry = ctx.entries[0]; // Most recent entry
    
    try {
      // Fetch emotion and identity context
      const { EmotionResolver } = await import('../emotion/emotionResolver');
      const { IdentityCoreEngine } = await import('../identityCore');
      const emotionResolver = new EmotionResolver();
      const identityEngine = new IdentityCoreEngine();
      
      // Get emotion events for recent entries
      const recentEntries = ctx.entries.slice(0, 10);
      const emotionEvents = await emotionResolver.process({
        entries: recentEntries,
        user: { id: userId },
      }).catch(() => []);
      
      // Get identity statements (simplified - can be enhanced)
      const identityData = await identityEngine.process(userId).catch(() => null);
      const identityStatements = identityData?.identity_statements || [];
      
      // Get follow-up entries (next few entries after latest)
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
};

