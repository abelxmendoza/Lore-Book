/**
 * Emotional Intelligence Engine Type Definitions
 */

export type EmotionType =
  | 'anger'
  | 'fear'
  | 'sadness'
  | 'joy'
  | 'surprise'
  | 'shame'
  | 'guilt'
  | 'stress'
  | 'calm'
  | 'anxiety'
  | 'excitement'
  | 'disgust'
  | 'contempt'
  | 'love'
  | 'gratitude'
  | 'pride'
  | 'envy'
  | 'other';

export type TriggerType =
  | 'relationship'
  | 'conflict'
  | 'failure'
  | 'rejection'
  | 'stress_load'
  | 'identity_threat'
  | 'rumination'
  | 'social_comparison'
  | 'loss'
  | 'change'
  | 'uncertainty'
  | 'criticism'
  | 'other';

export type ReactionType =
  | 'reactive'
  | 'responsive'
  | 'avoidant'
  | 'impulsive'
  | 'ruminative'
  | 'adaptive'
  | 'suppressed'
  | 'other';

export type EQInsightType =
  | 'trigger_detected'
  | 'high_intensity'
  | 'low_regulation'
  | 'emotional_growth'
  | 'reaction_pattern'
  | 'instability_risk'
  | 'regulation_improvement'
  | 'recovery_slow'
  | 'trigger_pattern'
  | 'emotional_awareness';

export interface EmotionSignal {
  id?: string;
  user_id?: string;
  timestamp: string;
  emotion: EmotionType;
  intensity: number; // 0.0-1.0
  evidence: string; // memory excerpt
  weight: number; // extraction confidence (0-1)
  entry_id?: string;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface TriggerEvent {
  id?: string;
  user_id?: string;
  emotion: EmotionSignal;
  triggerType: TriggerType;
  pattern: string; // what pattern caused the reaction
  confidence: number; // 0-1
  timestamp: string;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface RegulationScore {
  stability: number; // 0-1 emotional stability
  modulation: number; // 0-1 ability to reduce intensity
  delay: number; // 0-1 reaction delay before escalation
  resilience: number; // 0-1 recovery speed
  emotionalFlexibility: number; // 0-1 adaptive emotional response
  overall: number; // 0-1 overall EQ score
}

export interface ReactionPattern {
  id?: string;
  user_id?: string;
  type: ReactionType;
  evidence: string;
  confidence: number; // 0-1
  timestamp: string;
  emotion?: EmotionType;
  metadata?: Record<string, any>;
}

export interface RecoveryPoint {
  day: string;
  avg: number;
  count: number;
}

export interface EQGrowthMetrics {
  growthPotential: number; // 0-1
  riskZones: {
    instability: boolean;
    impulsivity: boolean;
    emotionalRigidity: boolean;
    slowRecovery: boolean;
  };
  trends: {
    stability_trend: 'improving' | 'declining' | 'stable';
    resilience_trend: 'improving' | 'declining' | 'stable';
    flexibility_trend: 'improving' | 'declining' | 'stable';
  };
}

export interface EQInsight {
  id?: string;
  user_id?: string;
  type: EQInsightType;
  message: string;
  timestamp: string;
  confidence: number; // 0-1
  emotion?: EmotionType;
  triggerType?: TriggerType;
  metadata?: Record<string, any>;
}

export interface EQOutput {
  signals: EmotionSignal[];
  triggers: TriggerEvent[];
  reactions: ReactionPattern[];
  regulation: RegulationScore;
  recovery: RecoveryPoint[];
  growth: EQGrowthMetrics;
  insights: EQInsight[];
}

export interface EQContext {
  entries?: any[];
  chronology?: any;
  continuity?: any;
  identity_pulse?: any;
  resilience?: any;
}

export interface EQStats {
  total_emotions: number;
  emotions_by_type: Record<EmotionType, number>;
  total_triggers: number;
  triggers_by_type: Record<TriggerType, number>;
  average_intensity: number;
  regulation_score: number;
  top_emotions: Array<{ emotion: EmotionType; count: number }>;
  top_triggers: Array<{ trigger: TriggerType; count: number }>;
}

