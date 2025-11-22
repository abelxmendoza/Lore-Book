/**
 * Memory Consolidation Engine Type Definitions
 */

export type SimilarityType = 'exact' | 'near_duplicate' | 'similar_content' | 'temporal_proximity' | 'semantic';

export type ConsolidationStrategy = 'merge' | 'link' | 'keep_separate' | 'flag';

export interface SimilarityScore {
  entry1_id: string;
  entry2_id: string;
  similarity_type: SimilarityType;
  score: number; // 0-1
  confidence: number; // 0-1
  reasons: string[]; // Why they're similar
  metadata: Record<string, any>;
}

export interface ConsolidationCandidate {
  entries: string[]; // Entry IDs to consolidate
  similarity_scores: SimilarityScore[];
  strategy: ConsolidationStrategy;
  confidence: number;
  suggested_action: string;
  metadata: Record<string, any>;
}

export interface ConsolidationResult {
  original_ids: string[];
  consolidated_id: string;
  strategy: ConsolidationStrategy;
  merged_content: string;
  merged_metadata: Record<string, any>;
  preserved_fields: string[]; // Fields preserved from original entries
}

export interface ConsolidationPayload {
  candidates: ConsolidationCandidate[];
  total_candidates: number;
  by_type: Record<SimilarityType, number>;
  metadata?: {
    analyzed_at: string;
    entries_analyzed: number;
  };
}

export interface ConsolidationStats {
  total_duplicates: number;
  exact_duplicates: number;
  near_duplicates: number;
  similar_content: number;
  consolidated_count: number;
  potential_savings: number; // Estimated entries that could be consolidated
}

