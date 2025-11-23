/**
 * Location Resolution Engine Type Definitions
 */

export interface ExtractedLocation {
  memoryId: string;
  raw: string;
  extractedName: string | null;
  normalizedName: string | null;
  type: string | null;
  embedding: number[];
  userId?: string;
}

export interface ResolvedLocation {
  id: string;
  name: string;
  normalized_name: string;
  type?: string;
  latitude?: number;
  longitude?: number;
  embedding?: number[];
  confidence: number;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface LocationMention {
  id?: string;
  user_id: string;
  location_id: string;
  memory_id: string;
  raw_text: string;
  extracted_name?: string;
  created_at?: string;
}

