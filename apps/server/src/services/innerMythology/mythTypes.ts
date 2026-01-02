/**
 * Inner Mythology Engine Type Definitions
 */

export type MythCategory =
  | 'hero'
  | 'villain'
  | 'guide'
  | 'shadow'
  | 'monster'
  | 'guardian'
  | 'temptation'
  | 'obstacle'
  | 'quest'
  | 'prophecy'
  | 'symbol'
  | 'inner_realm';

export interface MythElement {
  id?: string;
  category: MythCategory;
  text: string;
  evidence: string;
  timestamp: string;
  intensity: number; // emotional weight
  symbolic_weight: number; // archetypal weight
  confidence: number;
  embedding?: number[];
  memory_id?: string;
  user_id?: string;
  created_at?: string;
}

export interface MythMotif {
  id?: string;
  motifType: string; // "rebirth", "trial", "guardian", etc.
  elements: MythElement[];
  user_id?: string;
  created_at?: string;
}

export interface MythArchetype {
  archetype: string;
  evidence: string[];
}

export interface InnerMyth {
  id?: string;
  name: string;
  themes: string[];
  motifs: MythMotif[];
  summary: string;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

