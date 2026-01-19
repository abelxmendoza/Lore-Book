import { logger } from '../logger';

// Import engines
import { ActivityResolver } from '../services/activities/activityResolver';
import { ArchetypeEngine } from '../services/archetype/archetypeEngine';
import { BehaviorResolver } from '../services/behavior/behaviorResolver';
import { ConflictResolver } from '../services/conflict/conflictResolver';
import { CreativeEngine } from '../services/creative/creativeEngine';
import { EmotionResolver } from '../services/emotion/emotionResolver';
import { emotionalIntelligenceEngine } from '../services/emotionalIntelligence/emotionalEngine';
import { EntityResolver } from '../services/entities/entityResolver';
import { IdentityCoreEngine } from '../services/identityCore/identityCoreEngine';
import { InnerMythologyEngine } from '../services/innerMythology/innerMythologyEngine';
import { LocationResolver } from '../services/locations/locationResolver';
import { ParacosmEngine } from '../services/paracosm/paracosmEngine';
import { PersonalityEngine } from '../services/personality/personalityEngine';
import { ReflectionEngine } from '../services/reflection/reflectionEngine';
import { SceneResolver } from '../services/scenes/sceneResolver';
import { SocialNetworkEngine } from '../services/social/socialNetworkEngine';
import { SocialProjectionEngine } from '../services/socialProjection/projectionEngine';
import { TemporalEventResolver } from '../services/temporalEvents/eventResolver';
import { TimeEngine } from '../services/time/timeEngine';
import { ToxicityResolver } from '../services/toxicity';

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

  personality: async (userId: string, ctx: EngineContext) => {
    const engine = new PersonalityEngine();
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

  // Placeholder engines (to be implemented)
  chronology: async (userId: string, ctx: EngineContext) => {
    logger.warn({ engine: 'chronology' }, 'Engine not yet implemented');
    return { message: 'Engine not yet implemented' };
  },

  continuity: async (userId: string, ctx: EngineContext) => {
    logger.warn({ engine: 'continuity' }, 'Engine not yet implemented');
    return { message: 'Engine not yet implemented' };
  },

  implicitMotive: async (userId: string, ctx: EngineContext) => {
    logger.warn({ engine: 'implicitMotive' }, 'Engine not yet implemented');
    return { message: 'Engine not yet implemented' };
  },

  health: async (userId: string, ctx: EngineContext) => {
    logger.warn({ engine: 'health' }, 'Engine not yet implemented');
    return { message: 'Engine not yet implemented' };
  },

  financial: async (userId: string, ctx: EngineContext) => {
    logger.warn({ engine: 'financial' }, 'Engine not yet implemented');
    return { message: 'Engine not yet implemented' };
  },

  habits: async (userId: string, ctx: EngineContext) => {
    logger.warn({ engine: 'habits' }, 'Engine not yet implemented');
    return { message: 'Engine not yet implemented' };
  },

  decisions: async (userId: string, ctx: EngineContext) => {
    logger.warn({ engine: 'decisions' }, 'Engine not yet implemented');
    return { message: 'Engine not yet implemented' };
  },

  resilience: async (userId: string, ctx: EngineContext) => {
    logger.warn({ engine: 'resilience' }, 'Engine not yet implemented');
    return { message: 'Engine not yet implemented' };
  },

  influence: async (userId: string, ctx: EngineContext) => {
    logger.warn({ engine: 'influence' }, 'Engine not yet implemented');
    return { message: 'Engine not yet implemented' };
  },

  growth: async (userId: string, ctx: EngineContext) => {
    logger.warn({ engine: 'growth' }, 'Engine not yet implemented');
    return { message: 'Engine not yet implemented' };
  },

  legacy: async (userId: string, ctx: EngineContext) => {
    logger.warn({ engine: 'legacy' }, 'Engine not yet implemented');
    return { message: 'Engine not yet implemented' };
  },

  values: async (userId: string, ctx: EngineContext) => {
    logger.warn({ engine: 'values' }, 'Engine not yet implemented');
    return { message: 'Engine not yet implemented' };
  },

  dreams: async (userId: string, ctx: EngineContext) => {
    logger.warn({ engine: 'dreams' }, 'Engine not yet implemented');
    return { message: 'Engine not yet implemented' };
  },

  recommendation: async (userId: string, ctx: EngineContext) => {
    logger.warn({ engine: 'recommendation' }, 'Engine not yet implemented');
    return { message: 'Engine not yet implemented' };
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

