/**
 * Engine Registry with Governance Metadata
 * Central registry of all engines with their descriptors
 */

import type { EngineDescriptor } from './types';

/**
 * Engine Descriptors
 * Defines metadata for every engine in the system
 */
export const ENGINE_DESCRIPTORS: Record<string, EngineDescriptor> = {
  // ===== CORE IDENTITY ENGINES (UI-Worthy) =====
  identityPulse: {
    name: 'identityPulse',
    category: 'identity',
    maturity: 'critical',
    runMode: 'auto',
    visibility: 'panel',
    confidenceWeight: 0.9,
    downstreamConsumers: ['essenceProfile', 'insightEngine', 'recommendationEngine'],
    description: 'Short-term identity shifts, drift, motifs, snapshots',
    humanQuestion: 'How am I changing right now?',
    outputType: 'insight',
    riskLevel: 'low'
  },

  essenceProfile: {
    name: 'essenceProfile',
    category: 'identity',
    maturity: 'critical',
    runMode: 'auto',
    visibility: 'panel',
    confidenceWeight: 0.9,
    downstreamConsumers: ['identityPulse', 'insightEngine', 'recommendationEngine'],
    description: 'Long-term psychological essence: hopes, dreams, fears, strengths, values',
    humanQuestion: 'Who am I underneath the day-to-day noise?',
    outputType: 'insight',
    riskLevel: 'low'
  },

  timelineEngine: {
    name: 'timelineEngine',
    category: 'temporal',
    maturity: 'critical',
    runMode: 'auto',
    visibility: 'panel',
    confidenceWeight: 0.95,
    downstreamConsumers: ['chronologyEngine', 'sagaEngine', 'insightEngine'],
    description: 'Hierarchical timeline structure (Mythos → Epochs → Eras → Sagas → Arcs → Chapters)',
    humanQuestion: 'What is the structure of my life story?',
    outputType: 'metadata',
    riskLevel: 'low'
  },

  chronologyEngine: {
    name: 'chronologyEngine',
    category: 'temporal',
    maturity: 'stable',
    runMode: 'event-driven',
    visibility: 'supporting',
    confidenceWeight: 0.8,
    downstreamConsumers: ['timelineEngine', 'sagaEngine'],
    description: 'Builds temporal graphs, detects gaps, resolves ambiguities, infers causality',
    humanQuestion: 'What happened when, and why?',
    outputType: 'metadata',
    riskLevel: 'low'
  },

  xpEngine: {
    name: 'xpEngine',
    category: 'gamification',
    maturity: 'stable',
    runMode: 'auto',
    visibility: 'panel',
    confidenceWeight: 0.85,
    downstreamConsumers: [],
    description: 'Calculates XP, levels, streaks for skill tracking',
    humanQuestion: 'How am I progressing in my skills?',
    outputType: 'signal',
    riskLevel: 'low'
  },

  insightEngine: {
    name: 'insightEngine',
    category: 'analytics',
    maturity: 'critical',
    runMode: 'auto',
    visibility: 'panel',
    confidenceWeight: 0.9,
    downstreamConsumers: ['recommendationEngine'],
    description: 'Detects correlations, behavioral loops, and recurring patterns',
    humanQuestion: 'What patterns do I repeat?',
    outputType: 'insight',
    riskLevel: 'low'
  },

  // ===== SUPPORTING ENGINES (Feed Others, No Direct UI) =====
  archetypeEngine: {
    name: 'archetypeEngine',
    category: 'identity',
    maturity: 'stable',
    runMode: 'auto',
    visibility: 'supporting',
    confidenceWeight: 0.7,
    downstreamConsumers: ['identityPulse', 'insightEngine'],
    description: 'Detects 11 archetypes (Warrior, Rebel, Hermit, etc.)',
    humanQuestion: undefined, // Never direct UI
    outputType: 'signal',
    riskLevel: 'medium' // Can feel diagnostic if surfaced directly
  },

  personalityEngine: {
    name: 'personalityEngine',
    category: 'identity',
    maturity: 'stable',
    runMode: 'auto',
    visibility: 'supporting',
    confidenceWeight: 0.7,
    downstreamConsumers: ['essenceProfile', 'insightEngine'],
    description: 'Analyzes personality traits and patterns',
    humanQuestion: undefined,
    outputType: 'signal',
    riskLevel: 'medium'
  },

  shadowEngine: {
    name: 'shadowEngine',
    category: 'psychological',
    maturity: 'stable',
    runMode: 'event-driven',
    visibility: 'supporting',
    confidenceWeight: 0.6,
    downstreamConsumers: ['insightEngine', 'recommendationEngine'],
    description: 'Identifies suppressed topics, negative loops, shadow aspects',
    humanQuestion: undefined,
    outputType: 'signal',
    riskLevel: 'high' // Dangerous if misread
  },

  cognitiveBiasEngine: {
    name: 'cognitiveBiasEngine',
    category: 'psychological',
    maturity: 'stable',
    runMode: 'auto',
    visibility: 'hidden',
    confidenceWeight: 0.5,
    downstreamConsumers: ['insightEngine'],
    description: 'Detects cognitive biases in thinking patterns',
    humanQuestion: undefined,
    outputType: 'signal',
    riskLevel: 'high' // Therapist-only tool
  },

  distortionEngine: {
    name: 'distortionEngine',
    category: 'psychological',
    maturity: 'stable',
    runMode: 'auto',
    visibility: 'hidden',
    confidenceWeight: 0.5,
    downstreamConsumers: ['insightEngine'],
    description: 'Detects thought distortions and cognitive distortions',
    humanQuestion: undefined,
    outputType: 'signal',
    riskLevel: 'high' // Therapist-only tool
  },

  // ===== NARRATIVE ENGINES =====
  storyOfSelfEngine: {
    name: 'storyOfSelfEngine',
    category: 'narrative',
    maturity: 'stable',
    runMode: 'auto',
    visibility: 'supporting',
    confidenceWeight: 0.75,
    downstreamConsumers: ['timelineEngine', 'sagaEngine'],
    description: 'Extracts personal narrative structure (themes, turning points, arcs)',
    humanQuestion: undefined,
    outputType: 'insight',
    riskLevel: 'low'
  },

  paracosmEngine: {
    name: 'paracosmEngine',
    category: 'narrative',
    maturity: 'stable',
    runMode: 'auto',
    visibility: 'supporting',
    confidenceWeight: 0.7,
    downstreamConsumers: ['socialProjectionEngine', 'insightEngine'],
    description: 'Detects imagined worlds, fictional entities, creative universes',
    humanQuestion: undefined,
    outputType: 'signal',
    riskLevel: 'low'
  },

  innerDialogueEngine: {
    name: 'innerDialogueEngine',
    category: 'psychological',
    maturity: 'stable',
    runMode: 'auto',
    visibility: 'supporting',
    confidenceWeight: 0.65,
    downstreamConsumers: ['essenceProfile', 'insightEngine'],
    description: 'Extracts internal voices, self-talk, and inner conversations',
    humanQuestion: undefined,
    outputType: 'signal',
    riskLevel: 'medium'
  },

  // ===== RESOLUTION ENGINES (Data Normalization) =====
  entityResolver: {
    name: 'entityResolver',
    category: 'resolution',
    maturity: 'critical',
    runMode: 'auto',
    visibility: 'hidden',
    confidenceWeight: 0.95,
    downstreamConsumers: ['timelineEngine', 'insightEngine'],
    description: 'Resolves mentions of people to canonical records',
    humanQuestion: undefined,
    outputType: 'metadata',
    riskLevel: 'low'
  },

  emotionResolver: {
    name: 'emotionResolver',
    category: 'resolution',
    maturity: 'stable',
    runMode: 'auto',
    visibility: 'hidden',
    confidenceWeight: 0.85,
    downstreamConsumers: ['eqEngine', 'insightEngine'],
    description: 'Extracts and clusters emotions, computes intensity',
    humanQuestion: undefined,
    outputType: 'metadata',
    riskLevel: 'low'
  },

  // ===== RECOMMENDATION & GUIDANCE =====
  recommendationEngine: {
    name: 'recommendationEngine',
    category: 'guidance',
    maturity: 'stable',
    runMode: 'event-driven',
    visibility: 'supporting',
    confidenceWeight: 0.7,
    downstreamConsumers: [],
    description: 'Generates personalized recommendations based on all insights',
    humanQuestion: undefined,
    outputType: 'decision',
    riskLevel: 'medium' // Can feel pushy if overused
  },

  interventionEngine: {
    name: 'interventionEngine',
    category: 'guidance',
    maturity: 'experimental',
    runMode: 'manual',
    visibility: 'hidden',
    confidenceWeight: 0.5,
    downstreamConsumers: [],
    description: 'Suggests interventions based on patterns',
    humanQuestion: undefined,
    outputType: 'decision',
    riskLevel: 'high' // Must stay hidden
  },

  predictionEngine: {
    name: 'predictionEngine',
    category: 'analytics',
    maturity: 'experimental',
    runMode: 'manual',
    visibility: 'supporting',
    confidenceWeight: 0.6,
    downstreamConsumers: ['recommendationEngine'],
    description: 'Forecasts where your story is heading',
    humanQuestion: undefined,
    outputType: 'insight',
    riskLevel: 'medium' // Can feel deterministic
  },

  // ===== DOMAIN ENGINES =====
  valuesEngine: {
    name: 'valuesEngine',
    category: 'domain',
    maturity: 'stable',
    runMode: 'auto',
    visibility: 'supporting',
    confidenceWeight: 0.8,
    downstreamConsumers: ['essenceProfile', 'recommendationEngine'],
    description: 'Extracts and tracks core values',
    humanQuestion: undefined,
    outputType: 'insight',
    riskLevel: 'low'
  },

  growthEngine: {
    name: 'growthEngine',
    category: 'domain',
    maturity: 'stable',
    runMode: 'auto',
    visibility: 'supporting',
    confidenceWeight: 0.75,
    downstreamConsumers: ['insightEngine', 'recommendationEngine'],
    description: 'Tracks personal growth, development, and transformation',
    humanQuestion: undefined,
    outputType: 'insight',
    riskLevel: 'low'
  },

  eqEngine: {
    name: 'eqEngine',
    category: 'psychological',
    maturity: 'stable',
    runMode: 'auto',
    visibility: 'supporting',
    confidenceWeight: 0.75,
    downstreamConsumers: ['insightEngine', 'recommendationEngine'],
    description: 'Analyzes emotional patterns, triggers, and regulation',
    humanQuestion: undefined,
    outputType: 'insight',
    riskLevel: 'medium'
  },

  // ===== TOXICITY (Must Stay Hidden) =====
  toxicityResolver: {
    name: 'toxicityResolver',
    category: 'safety',
    maturity: 'stable',
    runMode: 'auto',
    visibility: 'hidden',
    confidenceWeight: 0.8,
    downstreamConsumers: ['insightEngine'],
    description: 'Identifies toxic dynamics, red flags, dangerous patterns',
    humanQuestion: undefined,
    outputType: 'signal',
    riskLevel: 'high' // Therapist-only tool
  }
};

/**
 * Get descriptor for an engine
 */
export function getEngineDescriptor(engineName: string): EngineDescriptor | null {
  return ENGINE_DESCRIPTORS[engineName] || null;
}

/**
 * Get all engines by visibility level
 */
export function getEnginesByVisibility(visibility: EngineDescriptor['visibility']): EngineDescriptor[] {
  return Object.values(ENGINE_DESCRIPTORS).filter(e => e.visibility === visibility);
}

/**
 * Get all UI-worthy engines (panel visibility)
 */
export function getUIWorthyEngines(): EngineDescriptor[] {
  return getEnginesByVisibility('panel');
}

/**
 * Get all hidden engines (never show to users)
 */
export function getHiddenEngines(): EngineDescriptor[] {
  return getEnginesByVisibility('hidden');
}

/**
 * Get engines that answer human questions (for UI panels)
 */
export function getHumanQuestionEngines(): EngineDescriptor[] {
  return Object.values(ENGINE_DESCRIPTORS).filter(e => e.humanQuestion !== undefined);
}
