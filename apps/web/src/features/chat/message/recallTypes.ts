/**
 * Memory Recall UI Types
 */

export type RecallSource = {
  entry_id: string;
  timestamp: string;
  summary: string;
  confidence: number;
  emotions?: string[];
  themes?: string[];
  entities?: string[];
};

export type RecallMeta = {
  recall_type?: 'EMOTIONAL_SIMILARITY' | 'TEMPORAL_COMPARISON' | 'PATTERN_LOOKBACK' | 'GENERAL_RECALL';
  persona?: 'ARCHIVIST' | 'DEFAULT';
};

export type RecallChatPayload = {
  mode: 'RECALL' | 'SILENCE';
  confidence_label?: 'Strong match' | 'Tentative';
  recall_sources?: RecallSource[];
  recall_meta?: RecallMeta;
  explanation?: string; // "Why this was shown"
};

