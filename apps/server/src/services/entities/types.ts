/**
 * Entity Resolution Engine Type Definitions
 */

export type EntityType = 'person' | 'place' | 'org' | 'event' | 'thing';

export interface ExtractedEntity {
  raw: string;
  type: EntityType;
  memoryId: string;
  timestamp: string;
  userId?: string;
}

export interface ResolvedEntity {
  id: string;
  canonical: string;
  aliases: string[];
  type: EntityType;
  confidence: number;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface EntityMention {
  id?: string;
  user_id: string;
  entity_id: string;
  memory_id: string;
  raw_text: string;
  created_at?: string;
}

