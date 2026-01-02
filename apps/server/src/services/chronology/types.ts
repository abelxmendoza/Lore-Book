import type { MemoryEntry, MemoryComponent } from '../../types';

/**
 * Core event type for Chronology Engine
 * Maps from MemoryEntry or MemoryComponent
 */
export interface Event {
  id: string;
  timestamp: string | null;
  endTimestamp?: string | null;
  content: string;
  embedding: number[];
  metadata?: Record<string, any>;
}

/**
 * Temporal relationship types based on Allen's interval algebra
 */
export type TemporalRelation =
  | 'before'
  | 'after'
  | 'overlaps'
  | 'meets'
  | 'causes'
  | 'contains'
  | 'during'
  | 'starts'
  | 'finishes'
  | 'equals';

/**
 * Temporal edge connecting two events
 */
export interface TemporalEdge {
  source: string;
  target: string;
  relation: TemporalRelation;
  confidence: number;
  metadata?: Record<string, any>;
}

/**
 * Temporal graph structure
 */
export interface TemporalGraph {
  nodes: Event[];
  edges: TemporalEdge[];
}

/**
 * Detected temporal gap
 */
export interface Gap {
  start: string;
  end: string;
  durationDays: number;
  missingEstimate: number;
  metadata?: Record<string, any>;
}

/**
 * Causal chain of events
 */
export interface CausalChain {
  rootEvent: string;
  chain: string[];
  confidence: number;
  metadata?: Record<string, any>;
}

/**
 * Narrative sequence with summary
 */
export interface NarrativeSequence {
  sequence: Event[];
  summary: string;
  metadata?: Record<string, any>;
}

/**
 * Detected temporal pattern
 */
export interface TemporalPattern {
  patternType: string;
  score: number;
  exampleEvents: string[];
  metadata?: Record<string, any>;
}

/**
 * Python analytics result
 */
export interface PythonAnalyticsResult {
  clusters?: {
    labels: number[];
    metadata?: Record<string, any>;
  };
  causality?: {
    causal_links: Array<{
      source: string;
      target: string;
      confidence: number;
    }>;
  };
  alignment?: {
    alignment_score: number;
    metadata?: Record<string, any>;
  };
  patterns?: Array<{
    type: string;
    score: number;
    events: string[];
  }>;
}

/**
 * Complete chronology analysis result
 */
export interface ChronologyResult {
  graph: TemporalGraph;
  causalChains: CausalChain[];
  gaps: Gap[];
  patterns: TemporalPattern[];
  pythonAnalytics?: PythonAnalyticsResult;
  metadata?: Record<string, any>;
}

