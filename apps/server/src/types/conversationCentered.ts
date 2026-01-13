// =====================================================
// CONVERSATION-CENTERED MEMORY TYPES
// Purpose: Types for conversation-first architecture
// =====================================================

export type MemoryScope = 'PRIVATE' | 'SHARED' | 'PUBLIC';

export type ExtractedUnitType = 
  | 'EXPERIENCE'     // something that happened
  | 'FEELING'        // emotional reaction
  | 'THOUGHT'        // cognition / reflection
  | 'PERCEPTION'     // belief / assumption
  | 'CLAIM'          // factual assertion
  | 'DECISION'       // choice / intent
  | 'CORRECTION';    // revision / retraction

export type Participant = 'USER' | 'AI';

/**
 * Refinement level for text normalization
 * Controls how aggressively text is cleaned/normalized
 */
export type RefinementLevel = 
  | 'preserve'      // Keep original, minimal changes (only critical errors)
  | 'light'         // Fix critical errors only (run-ons, major grammar)
  | 'standard'      // Current behavior (abbreviations, slang, grammar)
  | 'aggressive';   // Full cleanup and refinement

/**
 * ConversationThread: Primary user-facing structure
 */
export interface ConversationThread {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  scope: MemoryScope;
  metadata?: Record<string, any>;
}

/**
 * Message: Raw chat message (user-facing)
 */
export interface Message {
  id: string;
  thread_id: string;
  sender: Participant;
  raw_text: string;
  created_at: string;
  metadata?: Record<string, any>;
}

/**
 * Utterance: Normalized text unit from message
 */
export interface Utterance {
  id: string;
  message_id: string;
  user_id: string;
  normalized_text: string;
  original_text: string;
  language: string;
  created_at: string;
  metadata?: Record<string, any>;
}

/**
 * ExtractedUnit: Semantic unit extracted from utterance
 */
export interface ExtractedUnit {
  id: string;
  utterance_id: string;
  user_id: string;
  type: ExtractedUnitType;
  content: string;
  confidence: number;
  temporal_context: Record<string, any>;
  entity_ids: string[];
  created_at: string;
  metadata?: Record<string, any>;
}

/**
 * Normalization result
 */
export interface NormalizationResult {
  normalized_text: string;
  corrections: Array<{
    original: string;
    corrected: string;
    type: 'spelling' | 'abbreviation' | 'slang' | 'grammar';
  }>;
  language: string;
  spanish_terms?: string[];
  refinement_level?: RefinementLevel;
  original_preserved: boolean; // Whether original text was preserved
}

/**
 * Extraction result
 */
export interface ExtractionResult {
  units: Array<{
    type: ExtractedUnitType;
    content: string;
    confidence: number;
    temporal_context?: Record<string, any>;
    entity_ids?: string[];
  }>;
}

/**
 * Event assembly result
 */
export interface EventAssemblyResult {
  event_id: string;
  title: string;
  who: string[];
  what: string;
  where: string | null;
  when: {
    start: string;
    end: string | null;
  } | null;
  source_unit_ids: string[];
}

