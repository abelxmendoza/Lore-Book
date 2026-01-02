/**
 * Engine Governance System
 * Provides metadata and orchestration rules for all engines
 */

export type EngineMaturity = 'experimental' | 'stable' | 'critical';
export type EngineRunMode = 'manual' | 'auto' | 'event-driven';
export type EngineVisibility = 'hidden' | 'supporting' | 'panel';

export interface EngineDescriptor {
  name: string;
  category: string;
  maturity: EngineMaturity;
  runMode: EngineRunMode;
  visibility: EngineVisibility;
  confidenceWeight: number; // 0.0 - 1.0, how much to trust this engine's output
  downstreamConsumers: string[]; // Other engines that consume this output
  description: string;
  humanQuestion?: string; // What human question does this answer? (for UI-worthy engines)
  requiresContext?: string[]; // What other engines/data this needs
  outputType: 'signal' | 'insight' | 'decision' | 'metadata';
  riskLevel: 'low' | 'medium' | 'high'; // Risk if misread by user
}

export interface EngineHealth {
  engineName: string;
  lastRunTime: Date | null;
  lastRunDuration: number | null; // milliseconds
  successRate: number; // 0.0 - 1.0
  errorCount: number;
  outputVolume: number; // Average outputs per run
  confidenceDistribution: {
    high: number; // > 0.7
    medium: number; // 0.4 - 0.7
    low: number; // < 0.4
  };
  isHealthy: boolean;
}

export interface OrchestrationRule {
  engineName: string;
  condition: string; // e.g., "volatility > 0.5", "identityPulse.confidence > 0.7"
  action: 'run' | 'skip' | 'reduce' | 'increase_confidence';
  priority: number; // Higher = more important
}

export interface OrchestrationDecision {
  engineName: string;
  shouldRun: boolean;
  reason: string;
  confidence: number;
  dependencies: string[];
}
