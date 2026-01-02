/**
 * Social Network Engine Type Definitions
 */

export type DriftTrend = 'growing' | 'fading' | 'unstable' | 'stable';

export interface SocialNode {
  id: string; // person name or entity
  mentions: number; // frequency in entries
  sentiment: number; // -1 to 1
  categories: string[]; // e.g., "mentor", "friend", "family", "colleague"
  first_mentioned?: string;
  last_mentioned?: string;
  centrality?: number;
  metadata?: Record<string, any>;
}

export interface SocialEdge {
  id?: string;
  user_id?: string;
  source: string;
  target: string;
  weight: number; // edge strength (interaction frequency)
  sentiment: number; // -1 to 1, relationship tone
  interactions: string[]; // text snippets showing interactions
  first_interaction?: string;
  last_interaction?: string;
  metadata?: Record<string, any>;
}

export interface Community {
  id: string;
  user_id?: string;
  members: string[];
  theme: string;
  cohesion?: number; // 0-1
  size?: number;
  metadata?: Record<string, any>;
}

export interface InfluenceScore {
  id?: string;
  user_id?: string;
  person: string;
  score: number; // 0-1
  factors: string[]; // what contributes to influence
  rank?: number;
  timestamp?: string;
  metadata?: Record<string, any>;
}

export interface ToxicitySignal {
  id?: string;
  user_id?: string;
  person: string;
  evidence: string;
  severity: number; // 0-1
  timestamp?: string;
  category?: 'emotional' | 'behavioral' | 'social' | 'other';
  metadata?: Record<string, any>;
}

export interface DriftEvent {
  id?: string;
  user_id?: string;
  person: string;
  trend: DriftTrend;
  evidence: string[];
  timestamp?: string;
  confidence?: number;
  metadata?: Record<string, any>;
}

export interface NetworkScore {
  cohesion: number; // 0-1, how connected the network is
  stability: number; // 0-1, how stable relationships are
  influenceBalance: number; // 0-1, distribution of influence
  toxicityLevel: number; // 0-1, how toxic the network is
  overall: number; // 0-1, overall network health
  timestamp?: string;
}

export interface SocialNetworkOutput {
  nodes: Record<string, SocialNode>;
  edges: SocialEdge[];
  influence: InfluenceScore[];
  communities: Community[];
  toxic: ToxicitySignal[];
  centrality: Record<string, number>;
  drift: DriftEvent[];
  score: NetworkScore;
  insights?: SocialInsight[];
}

export interface SocialInsight {
  id?: string;
  user_id?: string;
  type:
    | 'relationship_detected'
    | 'influence_identified'
    | 'community_detected'
    | 'toxicity_detected'
    | 'drift_detected'
    | 'centrality_identified'
    | 'network_health'
    | 'relationship_strength'
    | 'social_pattern';
  message: string;
  timestamp: string;
  confidence: number; // 0-1
  person?: string;
  metadata?: Record<string, any>;
}

export interface SocialContext {
  entries?: any[];
  relationships?: any;
  identity_pulse?: any;
  chronology?: any;
}

export interface SocialStats {
  total_nodes: number;
  total_edges: number;
  total_communities: number;
  total_toxic_signals: number;
  total_drift_events: number;
  top_influencers: Array<{ person: string; score: number }>;
  most_central: Array<{ person: string; centrality: number }>;
  network_score: number;
}

