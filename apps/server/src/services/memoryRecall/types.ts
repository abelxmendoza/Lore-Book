/**
 * Memory Recall Engine (MRE) Types
 * 
 * Core types for natural-language recall of past moments,
 * emotions, patterns, and contexts with confidence gating.
 */

export type PersonaMode = 'DEFAULT' | 'ARCHIVIST';

export type TimeRange = {
  start?: string;
  end?: string;
};

export type RecallQuery = {
  raw_text: string;
  user_id: string;
  persona?: PersonaMode;
  timeframe?: TimeRange;
};

export type RecallIntentType =
  | 'EMOTIONAL_SIMILARITY'
  | 'PATTERN_LOOKBACK'
  | 'EVENT_LOOKUP'
  | 'ENTITY_LOOKUP'
  | 'TEMPORAL_COMPARISON'
  | 'GENERAL_RECALL';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type RecallIntent = {
  type: RecallIntentType;
  emotions?: string[];
  entities?: string[];
  themes?: string[];
  confidence_level: ConfidenceLevel;
};

export type RecallEntry = {
  id: string;
  content: string;
  date: string;
  emotions?: string[];
  themes?: string[];
  people?: string[];
  confidence: number;
  similarity_score: number;
  rank_score: number;
  metadata?: Record<string, unknown>;
};

export type RecallEvent = {
  id: string;
  title: string;
  when: string;
  confidence: number;
  similarity_score: number;
  rank_score: number;
  metadata?: Record<string, unknown>;
};

export type RecallSilenceResponse = {
  message: string;
  reason: string;
  confidence: number;
};

export type RecallResult = {
  entries: RecallEntry[];
  events: RecallEvent[];
  confidence: number;
  explanation: string;
  silence?: RecallSilenceResponse;
};

