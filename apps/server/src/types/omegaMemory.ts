/**
 * OMEGA MEMORY ENGINE — TypeScript Types
 * Time-aware, truth-seeking knowledge system
 */

export type EntityType = 'PERSON' | 'CHARACTER' | 'LOCATION' | 'ORG' | 'EVENT';
export type ClaimSource = 'USER' | 'AI' | 'EXTERNAL';
export type Sentiment = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'MIXED';

export interface Entity {
  id: string;
  user_id: string;
  type: EntityType;
  primary_name: string;
  aliases: string[];
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}

export interface Claim {
  id: string;
  user_id: string;
  entity_id: string;
  text: string;
  source: ClaimSource;
  confidence: number; // 0.0 – 1.0
  sentiment?: Sentiment;
  start_time: string;
  end_time?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}

export interface Relationship {
  id: string;
  user_id: string;
  from_entity_id: string;
  to_entity_id: string;
  type: string; // e.g. "coach_of", "rival_of", "located_at"
  confidence: number;
  start_time: string;
  end_time?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}

export interface Evidence {
  id: string;
  user_id: string;
  claim_id: string;
  content: string;
  source: string;
  timestamp: string;
  created_at: string;
  metadata?: Record<string, any>;
}

export interface RankedClaim extends Claim {
  score: number;
  evidence_count: number;
}

export interface EntitySummary {
  entity: Entity;
  summary: string;
  ranked_claims: RankedClaim[];
  active_relationships: Relationship[];
  uncertainty_notes?: string[];
}

export interface UpdateSuggestion {
  type: 'new_claim' | 'end_claim' | 'relationship_change' | 'entity_update';
  entity_id?: string;
  claim_id?: string;
  relationship_id?: string;
  description: string;
  confidence: number;
  proposed_data?: Partial<Claim | Relationship | Entity>;
}

export interface IngestionResult {
  entities: Entity[];
  claims: Claim[];
  relationships: Relationship[];
  conflicts_detected: number;
  suggestions: UpdateSuggestion[];
}

