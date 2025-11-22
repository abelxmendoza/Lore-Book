/**
 * Wisdom Engine Type Definitions
 */

export type WisdomCategory =
  | 'life_lesson'
  | 'insight'
  | 'realization'
  | 'principle'
  | 'philosophy'
  | 'advice'
  | 'observation'
  | 'truth';

export type WisdomSource = 'journal_entry' | 'conversation' | 'reflection' | 'pattern_analysis';

export interface WisdomStatement {
  id: string;
  user_id: string;
  category: WisdomCategory;
  statement: string; // The wisdom statement itself
  context: string; // What led to this wisdom
  confidence: number; // 0-1, how confident we are this is wisdom
  source: WisdomSource;
  source_id: string; // ID of the journal entry, conversation, etc.
  source_date: string; // When this wisdom was extracted
  tags: string[]; // Topics/themes this wisdom relates to
  related_experiences: string[]; // IDs of related journal entries
  related_patterns: string[]; // IDs of related patterns from analytics
  recurrence_count: number; // How many times similar wisdom has appeared
  first_seen: string; // When this wisdom first appeared
  last_seen: string; // When this wisdom last appeared
  evolution: WisdomEvolution[]; // How this wisdom has evolved over time
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface WisdomEvolution {
  date: string;
  statement: string; // How the wisdom was stated at this time
  context: string;
  source_id: string;
}

export interface WisdomPattern {
  theme: string; // The recurring theme
  statements: string[]; // IDs of wisdom statements
  frequency: number; // How often this theme appears
  first_seen: string;
  last_seen: string;
  evolution_timeline: WisdomEvolution[];
}

export interface WisdomPayload {
  wisdom: WisdomStatement[];
  patterns: WisdomPattern[];
  total: number;
  by_category: Record<WisdomCategory, number>;
  metadata?: {
    extracted_at: string;
    sources: WisdomSource[];
  };
}

export interface WisdomStats {
  total: number;
  by_category: Record<WisdomCategory, number>;
  recurring_themes: number;
  avg_confidence: number;
  most_recurring: WisdomPattern[];
  recent_wisdom: WisdomStatement[];
}

