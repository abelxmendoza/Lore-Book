/**
 * Prediction Engine Type Definitions
 */

export type PredictionType =
  | 'event'
  | 'pattern'
  | 'mood'
  | 'relationship'
  | 'goal'
  | 'behavior'
  | 'trend'
  | 'recurrence';

export type PredictionConfidence = 'low' | 'medium' | 'high' | 'very_high';

export type PredictionStatus = 'pending' | 'confirmed' | 'refuted' | 'partial' | 'expired';

export interface Prediction {
  id?: string;
  user_id: string;
  type: PredictionType;
  title: string;
  description: string;
  predicted_value?: string | number | boolean;
  predicted_date?: string; // ISO date
  predicted_date_range?: {
    start: string;
    end: string;
  };
  confidence: PredictionConfidence;
  confidence_score: number; // 0-1
  status: PredictionStatus;
  source_patterns: string[]; // Pattern IDs or descriptions
  source_data: Record<string, any>; // Historical data used
  metadata: Record<string, any>;
  created_at?: string;
  updated_at?: string;
  expires_at?: string;
}

export interface PatternAnalysis {
  pattern_id: string;
  pattern_type: string;
  frequency: number; // How often it occurs
  periodicity?: number; // Days between occurrences
  strength: number; // 0-1, how strong the pattern is
  examples: string[]; // Entry IDs or dates
  trend?: 'increasing' | 'decreasing' | 'stable' | 'cyclical';
  metadata: Record<string, any>;
}

export interface Forecast {
  predictions: Prediction[];
  patterns_analyzed: PatternAnalysis[];
  forecast_horizon_days: number;
  generated_at: string;
  confidence_summary: {
    high: number;
    medium: number;
    low: number;
  };
}

export interface PredictionStats {
  total_predictions: number;
  by_type: Record<PredictionType, number>;
  by_status: Record<PredictionStatus, number>;
  by_confidence: Record<PredictionConfidence, number>;
  accuracy_rate?: number; // If we have confirmed/refuted predictions
  average_confidence: number;
}

