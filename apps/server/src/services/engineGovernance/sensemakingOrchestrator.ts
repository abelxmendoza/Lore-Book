/**
 * SensemakingOrchestrator
 * Meta-orchestrator that decides when/why engines run
 * 
 * Core Principle: Restraint > Features, Orchestration > Intelligence
 */

import { logger } from '../../logger';
import type { EngineDescriptor, OrchestrationRule, OrchestrationDecision } from './types';
import { ENGINE_DESCRIPTORS, getEngineDescriptor } from './engineRegistry';
import { essenceProfileService } from '../essenceProfileService';
import { supabaseAdmin } from '../supabaseClient';

export interface OrchestrationContext {
  userId: string;
  trigger: 'entry_saved' | 'chat_message' | 'manual' | 'scheduled' | 'user_request';
  recentActivity?: {
    entryCount: number;
    volatility?: number; // Identity drift measure
    timeSinceLastRun?: number; // milliseconds
  };
  currentState?: {
    identityPulseConfidence?: number;
    essenceProfileConfidence?: number;
    hasRecentInsights?: boolean;
  };
}

export class SensemakingOrchestrator {
  private rules: OrchestrationRule[] = [];

  constructor() {
    this.initializeRules();
  }

  /**
   * Initialize orchestration rules
   * These rules decide when engines should run
   */
  private initializeRules(): void {
    this.rules = [
      // ShadowEngine: Only run if volatility is high
      {
        engineName: 'shadowEngine',
        condition: 'volatility > 0.5',
        action: 'run',
        priority: 5
      },
      {
        engineName: 'shadowEngine',
        condition: 'volatility <= 0.5',
        action: 'skip',
        priority: 1
      },

      // ArchetypeEngine: Only run if IdentityPulse confidence is high
      {
        engineName: 'archetypeEngine',
        condition: 'identityPulseConfidence > 0.7',
        action: 'run',
        priority: 6
      },
      {
        engineName: 'archetypeEngine',
        condition: 'identityPulseConfidence <= 0.7',
        action: 'skip',
        priority: 2
      },

      // PredictionEngine: Only run on explicit user request
      {
        engineName: 'predictionEngine',
        condition: 'trigger === "user_request"',
        action: 'run',
        priority: 7
      },
      {
        engineName: 'predictionEngine',
        condition: 'trigger !== "user_request"',
        action: 'skip',
        priority: 1
      },

      // InterventionEngine: Never run automatically
      {
        engineName: 'interventionEngine',
        condition: 'trigger === "manual"',
        action: 'run',
        priority: 8
      },
      {
        engineName: 'interventionEngine',
        condition: 'trigger !== "manual"',
        action: 'skip',
        priority: 1
      },

      // CognitiveBiasEngine: Reduce confidence if run too frequently
      {
        engineName: 'cognitiveBiasEngine',
        condition: 'timeSinceLastRun < 86400000', // Less than 24 hours
        action: 'skip',
        priority: 3
      },

      // RecommendationEngine: Run on event-driven triggers
      {
        engineName: 'recommendationEngine',
        condition: 'trigger === "entry_saved" || trigger === "chat_message"',
        action: 'run',
        priority: 4
      }
    ];
  }

  /**
   * Decide which engines should run given context
   */
  async decideEnginesToRun(context: OrchestrationContext): Promise<OrchestrationDecision[]> {
    const decisions: OrchestrationDecision[] = [];

    // Get current state if not provided
    const currentState = context.currentState || await this.getCurrentState(context.userId);

    // Evaluate each engine
    for (const [engineName, descriptor] of Object.entries(ENGINE_DESCRIPTORS)) {
      const decision = await this.evaluateEngine(engineName, descriptor, context, currentState);
      decisions.push(decision);
    }

    // Sort by priority (higher = more important)
    return decisions.sort((a, b) => {
      const aPriority = this.getPriorityForDecision(a);
      const bPriority = this.getPriorityForDecision(b);
      return bPriority - aPriority;
    });
  }

  /**
   * Evaluate whether an engine should run
   */
  private async evaluateEngine(
    engineName: string,
    descriptor: EngineDescriptor,
    context: OrchestrationContext,
    currentState: OrchestrationContext['currentState']
  ): Promise<OrchestrationDecision> {
    // Check run mode
    if (descriptor.runMode === 'manual' && context.trigger !== 'manual' && context.trigger !== 'user_request') {
      return {
        engineName,
        shouldRun: false,
        reason: 'Engine requires manual trigger',
        confidence: 1.0,
        dependencies: []
      };
    }

    // Check if engine is experimental and should be skipped
    if (descriptor.maturity === 'experimental' && context.trigger !== 'manual') {
      return {
        engineName,
        shouldRun: false,
        reason: 'Experimental engine, skipping automatic runs',
        confidence: 0.8,
        dependencies: []
      };
    }

    // Evaluate rules
    const applicableRules = this.rules.filter(r => r.engineName === engineName);
    let shouldRun = descriptor.runMode === 'auto'; // Default based on run mode

    let reason = `Default: ${descriptor.runMode} mode`;
    let confidence = 0.5;

    for (const rule of applicableRules) {
      const conditionMet = this.evaluateCondition(rule.condition, context, currentState);
      
      if (conditionMet) {
        if (rule.action === 'run') {
          shouldRun = true;
          reason = `Rule matched: ${rule.condition}`;
          confidence = 0.8;
        } else if (rule.action === 'skip') {
          shouldRun = false;
          reason = `Rule matched: ${rule.condition}`;
          confidence = 0.8;
        }
        break; // First matching rule wins
      }
    }

    // Check dependencies
    const dependencies = await this.checkDependencies(engineName, descriptor, context);

    return {
      engineName,
      shouldRun,
      reason,
      confidence,
      dependencies
    };
  }

  /**
   * Evaluate a condition string
   */
  private evaluateCondition(
    condition: string,
    context: OrchestrationContext,
    currentState: OrchestrationContext['currentState']
  ): boolean {
    try {
      // Simple condition evaluator
      // Supports: >, <, ===, !==, &&, ||
      
      // Replace variables with actual values
      let evalString = condition
        .replace(/volatility/g, String(context.recentActivity?.volatility || 0))
        .replace(/identityPulseConfidence/g, String(currentState?.identityPulseConfidence || 0))
        .replace(/essenceProfileConfidence/g, String(currentState?.essenceProfileConfidence || 0))
        .replace(/timeSinceLastRun/g, String(context.recentActivity?.timeSinceLastRun || 0))
        .replace(/trigger === "([^"]+)"/g, (match, trigger) => {
          return context.trigger === trigger ? 'true' : 'false';
        })
        .replace(/trigger !== "([^"]+)"/g, (match, trigger) => {
          return context.trigger !== trigger ? 'true' : 'false';
        });

      // Evaluate (simple, could be enhanced with a proper expression parser)
      return eval(evalString);
    } catch (error) {
      logger.warn({ error, condition }, 'Failed to evaluate condition');
      return false;
    }
  }

  /**
   * Check if engine dependencies are met
   */
  private async checkDependencies(
    engineName: string,
    descriptor: EngineDescriptor,
    context: OrchestrationContext
  ): Promise<string[]> {
    const dependencies: string[] = [];

    if (descriptor.requiresContext) {
      for (const required of descriptor.requiresContext) {
        // Check if required engine/data exists
        // For now, just return the list
        dependencies.push(required);
      }
    }

    // Check downstream consumers (engines that need this one)
    const consumers = descriptor.downstreamConsumers;
    if (consumers.length > 0) {
      // If this engine feeds others, it's more important
      dependencies.push(...consumers);
    }

    return dependencies;
  }

  /**
   * Get current state for orchestration decisions
   */
  private async getCurrentState(userId: string): Promise<OrchestrationContext['currentState']> {
    try {
      // Get essence profile confidence
      const profile = await essenceProfileService.getProfile(userId);
      const essenceProfileConfidence = this.calculateProfileConfidence(profile);

      // Get identity pulse confidence (would need to fetch from identityPulse service)
      // For now, use essence profile as proxy
      const identityPulseConfidence = essenceProfileConfidence;

      return {
        identityPulseConfidence,
        essenceProfileConfidence,
        hasRecentInsights: Object.keys(profile).length > 0
      };
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to get current state');
      return {};
    }
  }

  /**
   * Calculate overall confidence of essence profile
   */
  private calculateProfileConfidence(profile: any): number {
    if (!profile || Object.keys(profile).length === 0) {
      return 0.0;
    }

    const categories = ['hopes', 'dreams', 'fears', 'strengths', 'weaknesses', 'coreValues', 'personalityTraits', 'relationshipPatterns'];
    let totalConfidence = 0;
    let count = 0;

    for (const category of categories) {
      const items = profile[category] || [];
      for (const item of items) {
        totalConfidence += item.confidence || 0;
        count++;
      }
    }

    // Add skills
    if (profile.topSkills) {
      for (const skill of profile.topSkills) {
        totalConfidence += skill.confidence || 0;
        count++;
      }
    }

    return count > 0 ? totalConfidence / count : 0.0;
  }

  /**
   * Get priority for a decision (for sorting)
   */
  private getPriorityForDecision(decision: OrchestrationDecision): number {
    const descriptor = getEngineDescriptor(decision.engineName);
    if (!descriptor) return 0;

    let priority = 0;

    // Critical engines get higher priority
    if (descriptor.maturity === 'critical') priority += 10;
    if (descriptor.maturity === 'stable') priority += 5;

    // Panel visibility engines get higher priority
    if (descriptor.visibility === 'panel') priority += 5;

    // Engines that should run get higher priority
    if (decision.shouldRun) priority += 3;

    // Higher confidence decisions get higher priority
    priority += decision.confidence * 2;

    return priority;
  }

  /**
   * Get engines that should be visible in UI
   */
  getVisibleEngines(): string[] {
    return Object.values(ENGINE_DESCRIPTORS)
      .filter(e => e.visibility === 'panel')
      .map(e => e.name);
  }

  /**
   * Get engines that should never be visible
   */
  getHiddenEngines(): string[] {
    return Object.values(ENGINE_DESCRIPTORS)
      .filter(e => e.visibility === 'hidden')
      .map(e => e.name);
  }
}

export const sensemakingOrchestrator = new SensemakingOrchestrator();
