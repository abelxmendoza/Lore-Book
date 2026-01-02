/**
 * Conflict Detection Engine Type Definitions
 */

export interface RawConflictSignal {
  memoryId: string;
  text: string;
  timestamp: string;
}

export interface Conflict {
  id?: string;
  type: string;
  setting: string;
  trigger: string;
  escalation: string;
  participants: ConflictParticipant[];
  intensity: number;
  conflictBeats: ConflictBeat[];
  emotionalImpact: {
    before: string;
    during: string;
    after: string;
  };
  outcome: string;
  summary: string;
  embedding: number[];
  timestamp: string;
  memory_id?: string;
  user_id?: string;
  created_at?: string;
}

export interface ConflictBeat {
  stage: string; // "verbal escalation", "push", "swing", "retreat"
  intensity: number; // 0-1
}

export interface ConflictParticipant {
  name: string;
  role: string; // antagonist, ally, bystander, victim
}

