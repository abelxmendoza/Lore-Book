/**
 * Engine Manifest Type Definitions
 */

export type EngineCategory = 'core' | 'analytics' | 'specialized' | 'domain';
export type EngineStatus = 'planned' | 'in_progress' | 'implemented';

export interface EngineManifestRecord {
  id?: string;
  name: string;
  category: EngineCategory;
  status: EngineStatus;
  version: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export interface EngineBlueprint {
  id?: string;
  engine_id: string;
  blueprint: string;
  format: 'markdown';
  created_at?: string;
}

export interface EngineEmbedding {
  id?: string;
  engine_id: string;
  embedding?: number[];
  tokens?: number;
  created_at?: string;
}

export interface EngineSearchResult {
  engine_id: string;
  engine_name: string;
  category: string;
  status: string;
  version: string;
  description?: string;
  similarity: number;
  blueprint_preview?: string;
}

