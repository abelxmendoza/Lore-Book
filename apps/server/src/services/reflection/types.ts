/**
 * Reflection Engine Type Definitions
 * Simple V1 - extracts reflections from journal entries
 */

export interface Reflection {
  id?: string;
  user_id?: string;
  entry_id?: string;
  text: string;
  type: 'insight' | 'realization' | 'lesson' | 'question' | 'gratitude' | 'growth';
  confidence: number; // 0-1
  timestamp?: string;
  metadata?: Record<string, any>;
}

export interface ReflectionInsight {
  id?: string;
  user_id?: string;
  type: 'reflection_detected' | 'pattern_in_reflections' | 'growth_moment';
  message: string;
  confidence: number;
  timestamp: string;
  reflection_ids?: string[];
  metadata?: Record<string, any>;
}

export interface ReflectionOutput {
  reflections: Reflection[];
  insights?: ReflectionInsight[];
}

