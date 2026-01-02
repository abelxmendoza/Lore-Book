/**
 * Toxicity & Red Flag Engine Type Definitions
 */

export interface ToxicitySignal {
  memoryId: string;
  text: string;
  timestamp: string;
}

export interface ToxicityEvent {
  id?: string;
  entityType: string;
  entityName: string;
  category: string;
  redFlags: string[];
  severity: number;
  pattern: string;
  prediction: string;
  summary: string;
  embedding: number[];
  timestamp: string;
  memory_id?: string;
  user_id?: string;
  created_at?: string;
}

