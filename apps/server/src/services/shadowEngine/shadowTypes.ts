export type ShadowSignalType =
  | 'anger_suppressed'
  | 'envy'
  | 'jealousy'
  | 'ego_defense'
  | 'avoidance'
  | 'shame'
  | 'guilt'
  | 'resentment'
  | 'self_sabotage'
  | 'power_projection'
  | 'identity_mask';

export interface ShadowSignal {
  type: ShadowSignalType;
  text: string;
  intensity: number; // 0–1
  metadata?: Record<string, unknown>;
}

export type ShadowArchetypeScore = {
  [k: string]: number;
  // "Saboteur", "Critic", "Phantom Lover", "Villain", "Wounded Child", etc.
};

export interface ShadowLoop {
  loop: string;
  risk: number;
}

export interface ShadowTriggers {
  conflict_trigger: boolean;
  rejection_trigger: boolean;
  humiliation_trigger: boolean;
  power_trigger: boolean;
}

export interface ShadowProjection {
  dominant_future: string;
  risk_level: number;
  projection: string;
  recommended_focus: string;
}

export interface ShadowProfile {
  shadow_archetypes: ShadowArchetypeScore;
  dominant_shadow: string;
  shadow_loops: ShadowLoop[];
  shadow_triggers: ShadowTriggers;
  conflict_map?: Record<string, unknown>;
  projection: ShadowProjection;
  summary: string;
}

