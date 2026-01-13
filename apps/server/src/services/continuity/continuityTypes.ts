/**
 * Continuity Profile Type Definitions
 * Defines the structure of the "soul" profile
 */

export interface PersistentValue {
  value: string;
  evidence_count: number;
  first_seen: string;
  last_seen: string;
  contexts: string[];
  confidence: number;
}

export interface RecurringTheme {
  theme: string;
  frequency: number;
  intensity_trend: number;
  contexts: string[];
}

export interface IdentityVersion {
  version: number;
  timestamp: string;
  claims: string[];
  confidence: number;
}

export interface DriftFlag {
  type: 'identity' | 'values' | 'agency';
  severity: number; // 0-1
  description: string;
  timestamp: string;
}

export interface ContinuityProfile {
  // Persistent patterns (survive across time/change)
  persistent_values: PersistentValue[];
  
  // Recurring themes
  recurring_themes: RecurringTheme[];
  
  // Identity stability
  identity_stability_score: number; // 0-1
  identity_versions: IdentityVersion[];
  
  // Agency metrics
  agency_density: number; // will_events per time period
  agency_trend: 'increasing' | 'decreasing' | 'stable';
  last_will_event: string | null;
  
  // Drift indicators
  drift_flags: DriftFlag[];
  
  computed_at: string;
}
