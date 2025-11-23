/**
 * Personality Engine Type Definitions
 * Simple V1 - extracts personality traits from journal entries
 */

export interface PersonalityTrait {
  id?: string;
  user_id?: string;
  trait: string; // e.g., "introverted", "analytical", "creative"
  evidence: string; // Text that supports this trait
  confidence: number; // 0-1
  frequency: number; // How often this trait appears
  first_detected?: string;
  last_detected?: string;
  metadata?: Record<string, any>;
}

export interface PersonalityProfile {
  user_id: string;
  traits: PersonalityTrait[];
  dominant_traits: string[]; // Top 5 traits
  trait_evolution?: TraitEvolution[];
}

export interface TraitEvolution {
  trait: string;
  timeline: Array<{
    timestamp: string;
    confidence: number;
    evidence: string;
  }>;
}

export interface PersonalityInsight {
  id?: string;
  user_id?: string;
  type: 'trait_detected' | 'trait_evolution' | 'personality_shift' | 'dominant_trait';
  message: string;
  confidence: number;
  timestamp: string;
  trait?: string;
  metadata?: Record<string, any>;
}

export interface PersonalityOutput {
  profile: PersonalityProfile;
  insights?: PersonalityInsight[];
}

