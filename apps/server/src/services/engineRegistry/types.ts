/**
 * Engine Registry Type Definitions
 */

export interface EngineManifestEntry {
  id?: string;
  name: string;
  category: 'core' | 'analytics' | 'specialized' | 'domain';
  version: string;
  path: string; // Used by dynamic import
  status: 'active' | 'disabled' | 'deprecated';
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export interface EngineHealthRecord {
  id?: string;
  engine_name: string;
  last_run?: string;
  last_success?: string;
  last_error?: string;
  average_duration_ms?: number;
  run_count: number;
  error_count: number;
  created_at?: string;
  updated_at?: string;
}

export interface EngineDependency {
  id?: string;
  engine_name: string;
  depends_on: string;
  created_at?: string;
}

