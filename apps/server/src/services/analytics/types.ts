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

