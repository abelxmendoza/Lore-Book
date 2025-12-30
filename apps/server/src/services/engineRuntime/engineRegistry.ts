import { logger } from '../../logger';
import type { EngineContext } from './contextBuilder';

// Import all engines
import { StoryOfSelfEngine } from '../storyOfSelf';
import { ParacosmEngine } from '../paracosm';
import { InnerDialogueEngine } from '../innerDialogue';
import { AlternateSelfEngine } from '../alternateSelf';
import { CognitiveBiasEngine } from '../cognitiveBias';
import { DistortionEngine } from '../distortion';
import { ShadowEngine } from '../shadowEngine';
import { ArchetypeEngine } from '../archetype';
import { ChronologyEngine } from '../chronology';
import { IdentityCoreEngine } from '../identityCore';
import { SocialProjectionEngine } from '../socialProjection';
import { ReflectionEngine } from '../reflection';
import { EQEngine } from '../emotionalIntelligence';
import { CreativeEngine } from '../creative';
import { HealthEngine } from '../health';
import { FinancialEngine } from '../financial';
import { HabitsEngine } from '../habits';
import { DecisionEngine } from '../decisions';
import { ResilienceEngine } from '../resilience';
import { InfluenceEngine } from '../influence';
import { GrowthEngine } from '../growth';
import { LegacyEngine } from '../legacy';
import { ValuesEngine } from '../values';
import { DreamsEngine } from '../dreams';
import { RecommendationEngine } from '../recommendation';

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
};

