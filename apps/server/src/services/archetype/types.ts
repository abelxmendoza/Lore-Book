/**
 * Archetype Engine Type Definitions
 * Simple V1 - extracts archetype signals from journal entries
 */

export interface ArchetypeSignal {
  id?: string;
  user_id?: string;
  entry_id?: string;
  label: string; // e.g., "Warrior", "Rebel", "Hermit", "Creator", etc.
  confidence: number; // 0-1
  evidence: string; // Text that supports this archetype
  timestamp?: string;
  metadata?: Record<string, any>;
}

export interface ArchetypeProfile {
  user_id: string;
  dominant: string;
  secondary: string[];
  shadow?: string;
  distribution: Record<string, number>; // archetype -> score
}

export interface ArchetypeTransition {
  id?: string;
  user_id?: string;
  from: string;
  to: string;
  weight: number;
  evidence: string[];
  timestamp?: string;
  metadata?: Record<string, any>;
}

export interface ArchetypeDistortion {
  id?: string;
  user_id?: string;
  archetype: string;
  distortion: 'Overdrive' | 'IdentitySplit' | 'ShadowDominance';
  confidence: number;
  indicators: string[];
  timestamp?: string;
  metadata?: Record<string, any>;
}

export interface ArchetypeOutput {
  signals: ArchetypeSignal[];
  profile: ArchetypeProfile;
  transitions: ArchetypeTransition[];
  distortions: ArchetypeDistortion[];
}

