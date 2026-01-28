/**
 * Analytics System Types
 * Shared types and interfaces for all analytics modules
 */

export type AnalyticsModuleType =
  | 'identity_pulse'
  | 'relationship_analytics'
  | 'saga'
  | 'memory_fabric'
  | 'insights'
  | 'predictions'
  | 'shadow'
  | 'xp'
  | 'life_map'
  | 'search'
  | 'characters'
  | 'rpg';

export interface AnalyticsPayload {
  metrics: Record<string, any>;
  charts: ChartData[];
  clusters?: ClusterData[];
  graph?: GraphData;
  insights: InsightData[];
  summary: string;
  metadata?: Record<string, any>;
}

export interface ChartData {
  type: 'line' | 'bar' | 'scatter' | 'pie' | 'area';
  title: string;
  data: Array<Record<string, any>>;
  xAxis?: string;
  yAxis?: string;
  series?: string[];
}

export interface ClusterData {
  id: string;
  label: string;
  size: number;
  centroid?: number[];
  members: string[];
  summary?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  metadata?: Record<string, any>;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  type: string;
  metadata?: Record<string, any>;
}

export interface InsightData {
  id?: string;
  text: string;
  category: string;
  score: number;
  confidence?: number;
  evidence?: string[];
  metadata?: Record<string, any>;
}

export interface MemoryData {
  id: string;
  text: string;
  created_at: string;
  sentiment: number | null;
  mood: string | null;
  topics: string[];
  people: string[];
  embedding: number[] | null;
}

export interface CharacterData {
  id: string;
  name: string;
  first_seen: string | null;
  last_seen: string | null;
  interaction_score: number | null;
  sentiment_toward: number | null;
  embedding: number[] | null;
}

export interface ArcData {
  id: string;
  label: string;
  summary: string | null;
  start_date: string;
  end_date: string | null;
  color: string | null;
}

export interface AnalyticsCacheEntry {
  id: string;
  user_id: string;
  type: AnalyticsModuleType;
  payload: AnalyticsPayload;
  updated_at: string;
  expires_at: string | null;
}

// --- Execution Blueprint (V2) types ---

export type DataVersion = string;
export type ModelVersion = string;
export type Seed = number;
export type Timestamp = number;

export interface TimeWindow {
  start: Timestamp;
  end: Timestamp;
}

export interface AnalyticsDiagnostics {
  analyticsType: string;
  executionTimeMs: number;
  warnings: string[];
  invariantsPassed: boolean;
  seed?: Seed;
}

export interface AnalyticsResult<T> {
  value: T | null;
  confidence: number | null;
  sampleSize: number | null;
  diagnostics: AnalyticsDiagnostics;
}

export interface AnalyticsContext {
  userId: string;
  dataVersion: DataVersion;
  modelVersion: ModelVersion;
  timeWindow: TimeWindow;
  seed: Seed;
  /** Optional; used by identity pulse etc. */
  timeRange?: string;
  /** Optional; used by search */
  searchOptions?: { query?: string; filters?: Record<string, unknown> };
}

export interface OrchestratorRequest {
  userId: string;
  timeWindow?: TimeWindow;
  timeRange?: string;
  searchOptions?: { query?: string; filters?: Record<string, unknown> };
}

/** Legacy module descriptor: run(context) returns payload. Used by orchestrator to wrap existing modules. */
export interface LegacyAnalyticsModuleDescriptor {
  name: string;
  isLegacy: true;
  run(context: AnalyticsContext): Promise<AnalyticsPayload>;
}

