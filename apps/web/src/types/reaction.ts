// Reaction Entry Types
// Third first-class concept: How you responded internally or behaviorally

export type ReactionTriggerType = 'memory' | 'perception';
export type ReactionType = 'emotional' | 'behavioral' | 'cognitive' | 'physical';

export interface ReactionEntry {
  id: string;
  user_id: string;
  trigger_type: ReactionTriggerType;
  trigger_id: string;
  reaction_type: ReactionType;
  reaction_label: string;
  intensity: number | null;
  duration: string | null;
  description: string | null;
  automatic: boolean;
  coping_response: string | null;
  timestamp_started: string;
  timestamp_resolved: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateReactionInput {
  trigger_type: ReactionTriggerType;
  trigger_id: string;
  reaction_type: ReactionType;
  reaction_label: string;
  intensity?: number; // 0.0 to 1.0
  duration?: string;
  description?: string;
  automatic?: boolean;
  coping_response?: string;
  timestamp_started?: string;
  timestamp_resolved?: string | null;
}

export interface UpdateReactionInput {
  reaction_type?: ReactionType;
  reaction_label?: string;
  intensity?: number;
  duration?: string;
  description?: string;
  automatic?: boolean;
  coping_response?: string;
  timestamp_started?: string;
  timestamp_resolved?: string | null;
}

export interface ReactionPatterns {
  byTrigger: Record<string, number>;
  byLabel: Record<string, number>;
  byType: Record<ReactionType, number>;
  intensityAverages: Record<string, number>;
  commonPatterns: Array<{
    trigger_type: ReactionTriggerType;
    reaction_label: string;
    count: number;
    avg_intensity: number;
  }>;
}

// Common reaction labels by type
export const REACTION_LABELS: Record<ReactionType, string[]> = {
  emotional: [
    'anxiety',
    'anger',
    'sadness',
    'fear',
    'shame',
    'guilt',
    'joy',
    'relief',
    'disgust',
    'contempt',
    'envy',
    'jealousy'
  ],
  behavioral: [
    'avoidance',
    'withdrawal',
    'aggression',
    'procrastination',
    'overworking',
    'shutdown',
    'isolation',
    'confrontation',
    'people-pleasing',
    'self-sabotage'
  ],
  cognitive: [
    'rumination',
    'overthinking',
    'catastrophizing',
    'black-and-white thinking',
    'self-blame',
    'blame others',
    'minimizing',
    'denial',
    'hypervigilance',
    'mind-reading'
  ],
  physical: [
    'tension',
    'headache',
    'nausea',
    'fatigue',
    'insomnia',
    'rapid heartbeat',
    'sweating',
    'muscle pain',
    'stomach upset',
    'dizziness'
  ]
};
