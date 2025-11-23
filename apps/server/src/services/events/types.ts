/**
 * Event Resolution Engine Type Definitions
 */

export interface ExtractedEvent {
  memoryId: string;
  raw: string;
  timestamp: string | null;
  location: string | null;
  keywords: string[];
  embedding: number[];
  userId?: string;
}

export interface ResolvedEvent {
  id: string;
  canonical_title: string;
  summary?: string;
  start_time?: string;
  end_time?: string;
  confidence: number;
  embedding?: number[];
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface EventMention {
  id?: string;
  user_id: string;
  event_id: string;
  memory_id: string;
  raw_text: string;
  timestamp?: string;
  location?: string;
  created_at?: string;
}

