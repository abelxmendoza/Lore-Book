/**
 * Activity Resolution Engine Type Definitions
 */

export interface ExtractedActivity {
  memoryId: string;
  raw: string;
  extractedName: string | null;
  normalizedName: string | null;
  category: string | null;
  intensity: number | null;
  embedding: number[];
  userId?: string;
}

export interface ResolvedActivity {
  id: string;
  name: string;
  normalized_name: string;
  category?: string;
  intensity?: number;
  embedding?: number[];
  metadata?: Record<string, any>;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ActivityMention {
  id?: string;
  user_id: string;
  activity_id: string;
  memory_id: string;
  raw_text: string;
  extracted_name?: string;
  category?: string;
  intensity?: number;
  created_at?: string;
}

