// =====================================================
// LORE-KEEPER NARRATIVE COMPILER (LNC)
// Type Definitions
// =====================================================

export type KnowledgeType = 
  | 'EXPERIENCE'
  | 'FEELING'
  | 'BELIEF'
  | 'FACT'
  | 'DECISION'
  | 'QUESTION';

export type CanonStatus = 
  | 'CANON'              // Real life, default
  | 'ROLEPLAY'           // Acting as a character
  | 'HYPOTHETICAL'       // "What if..." exploration
  | 'FICTIONAL'          // Creative writing
  | 'THOUGHT_EXPERIMENT' // Abstract/philosophical reasoning
  | 'META';              // Talking about the system itself

/**
 * Canon Metadata (Phase 3.6)
 * Tracks source and confidence of canon classification
 */
export interface CanonMetadata {
  status: CanonStatus;
  source: 'USER' | 'SYSTEM';
  confidence: number; // 0.0 - 1.0, certainty of classification
  classified_at?: string; // ISO timestamp
  overridden_at?: string; // ISO timestamp if user overrode
}

export type CertaintySource = 
  | 'DIRECT_EXPERIENCE'
  | 'INFERENCE'
  | 'HEARSAY'
  | 'VERIFICATION'
  | 'MEMORY_RECALL';

export interface EntityRef {
  entity_id: string;
  mention_text: string;
  confidence: number;
  role?: string; // e.g., 'subject', 'object', 'location'
}

export interface EmotionSignal {
  emotion: string;
  intensity: number;
  confidence: number;
}

export interface ThemeSignal {
  theme: string;
  confidence: number;
}

export interface NarrativeLinks {
  previous_entry_id?: string;
  related_entry_ids?: string[];
}

export interface CompilerFlags {
  is_dirty: boolean;
  is_deprecated: boolean;
  last_compiled_at: string;
  compilation_version: number;
  downgraded_from_fact?: boolean; // Phase 3.5: Track downgrades
  promoted_from_feeling?: boolean; // Phase 3.5: Should never be true
  promotion_proof?: {
    rule_id: string;
    source_entries: string[];
    confidence: number;
    generated_at: string;
    generated_by: 'SYSTEM' | 'USER';
  }; // Phase 3.5: Proof-carrying data
}

export interface EntryIR {
  id: string;
  user_id: string;
  source_utterance_id: string;
  thread_id: string;
  timestamp: string;

  // Epistemic classification
  knowledge_type: KnowledgeType;

  // Canon status (Phase 3.6: Reality boundary)
  canon: CanonMetadata;

  // Normalized semantic payload
  content: string;
  entities: EntityRef[];
  emotions: EmotionSignal[];
  themes: ThemeSignal[];

  // Confidence & epistemology
  confidence: number;
  certainty_source: CertaintySource;

  // Narrative structure (minimal for Phase 1)
  narrative_links: NarrativeLinks;

  // Compiler metadata
  compiler_flags: CompilerFlags;
}

export interface DependencyGraph {
  entry_id: string;
  dependent_entry_ids: string[];
  entity_dependencies: Map<string, string[]>; // entity_id -> entry_ids
}

