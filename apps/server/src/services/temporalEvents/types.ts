/**
 * Temporal Event Resolution Engine Type Definitions
 */

export interface TemporalSignal {
  memoryId: string;
  timestamp: string;
  people: string[]; // normalized person IDs or names
  locations: string[]; // normalized location IDs or names
  activities: string[]; // normalized activity IDs or names
  text: string;
}

export interface ResolvedEvent {
  id?: string;
  title: string;
  summary?: string;
  type?: string;
  startTime: string;
  endTime?: string;
  confidence: number;
  people: string[];
  locations: string[];
  activities: string[];
  embedding?: number[];
  metadata?: Record<string, any>;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AssembledEvent {
  start: string;
  end: string;
  people: string[];
  locations: string[];
  activities: string[];
  text: string;
}

export interface EventMention {
  id?: string;
  event_id: string;
  memory_id: string;
  signal?: Record<string, any>;
  created_at?: string;
}

