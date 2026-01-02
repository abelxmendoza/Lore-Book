/**
 * Behavior Loop Resolution Engine Type Definitions
 */

export interface RawBehaviorSignal {
  memoryId: string;
  text: string;
  behavior: string;
  timestamp: string;
}

export interface NormalizedBehavior {
  behavior: string;
  subtype?: string;
  intensity: number;
  polarity: 'positive' | 'negative' | 'neutral';
  embedding: number[];
  timestamp: string;
  evidence: string;
  confidence: number;
}

export interface BehaviorLoop {
  id?: string;
  loopName: string;
  category: string;
  behaviors: string[];
  triggers: string[];
  consequences: string[];
  occurrences: number;
  loopLength: number;
  confidence: number;
  firstSeen: string;
  lastSeen: string;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface BehaviorStats {
  [behavior: string]: number;
}


