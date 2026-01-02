/**
 * Health & Wellness Engine Type Definitions
 */

export type SymptomType =
  | 'fatigue'
  | 'headache'
  | 'tightness'
  | 'soreness'
  | 'pain'
  | 'injury'
  | 'stress_somatic'
  | 'sleep_issue'
  | 'digestion'
  | 'immune'
  | 'unknown';

export interface SymptomEvent {
  id?: string;
  user_id?: string;
  type: SymptomType;
  intensity: number; // 0-1
  timestamp: string;
  evidence: string;
  weight: number; // 0-1 extraction confidence
  entry_id?: string;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface SleepEvent {
  id?: string;
  user_id?: string;
  hours: number | null;
  quality: number | null; // 0-1
  timestamp: string;
  evidence: string;
  entry_id?: string;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface EnergyEvent {
  id?: string;
  user_id?: string;
  level: number; // 0-1
  timestamp: string;
  evidence: string;
  entry_id?: string;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface StressCorrelation {
  stressLevel: number;
  symptomCorrelation: number; // -1 to 1
  sleepCorrelation: number; // -1 to 1
  energyCorrelation: number; // -1 to 1
  confidence: number; // 0-1
}

export interface WellnessCycle {
  cycleType: 'stress' | 'energy' | 'mood' | 'physical';
  phases: {
    rising: string[];
    peak: string[];
    falling: string[];
    recovery: string[];
  };
  period_days?: number;
  confidence?: number;
}

export interface RecoveryPrediction {
  expectedDaysToRecover: number;
  confidence: number; // 0-1
  predictedCurve: number[];
  currentIntensity?: number;
}

export interface WellnessScore {
  physical: number; // 0-1 energy + symptoms
  mental: number; // 0-1 mood + stress
  sleep: number; // 0-1 hrs + quality
  recovery: number; // 0-1 recovery model
  overall: number; // 0-1 weighted score
}

export interface HealthOutput {
  symptoms: SymptomEvent[];
  sleep: SleepEvent[];
  energy: EnergyEvent[];
  correlations: StressCorrelation;
  cycles: WellnessCycle[];
  recovery: RecoveryPrediction;
  score: WellnessScore;
  insights?: HealthInsight[];
}

export interface HealthInsight {
  id?: string;
  user_id?: string;
  type:
    | 'symptom_detected'
    | 'sleep_issue'
    | 'low_energy'
    | 'stress_correlation'
    | 'cycle_detected'
    | 'recovery_needed'
    | 'wellness_improvement'
    | 'wellness_decline';
  message: string;
  timestamp: string;
  confidence: number; // 0-1
  metadata?: Record<string, any>;
}

export interface HealthContext {
  entries?: any[];
  chronology?: any;
  identity_pulse?: any;
  resilience?: any;
  emotional_intelligence?: any;
}

export interface HealthStats {
  total_symptoms: number;
  symptoms_by_type: Record<SymptomType, number>;
  average_sleep_hours: number;
  average_sleep_quality: number;
  average_energy: number;
  wellness_score: number;
  top_symptoms: Array<{ type: SymptomType; count: number }>;
}

