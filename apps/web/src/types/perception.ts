// HARD RULE: These types enforce perception vs memory separation
export type PerceptionSource = 'overheard' | 'told_by' | 'rumor' | 'social_media' | 'intuition' | 'assumption';
export type PerceptionSentiment = 'positive' | 'negative' | 'neutral' | 'mixed';
export type PerceptionStatus = 'unverified' | 'confirmed' | 'disproven' | 'retracted';

// HARD RULE: Perception entries are parallel to journal_entries, not inside them
export type PerceptionEntry = {
  id: string;
  user_id: string;
  subject_person_id?: string | null;
  subject_alias: string; // REQUIRED - no nulls, even if anonymized
  content: string; // MUST be framed as YOUR belief, not objective fact
  source: PerceptionSource;
  source_detail?: string | null; // e.g. "told by Alex", "Instagram post"
  confidence_level: number; // 0.0 to 1.0 (defaults to 0.3 = low)
  sentiment?: PerceptionSentiment | null;
  timestamp_heard: string;
  related_memory_id?: string | null; // Link to journal entry if related
  impact_on_me: string; // REQUIRED - Key Insight Lever
  status: PerceptionStatus; // unverified (default), confirmed, disproven, retracted
  retracted: boolean;
  resolution_note?: string | null; // Notes on resolution/retraction (tracks evolution)
  original_content?: string | null; // Preserve original for evolution tracking
  evolution_notes?: string[]; // Array tracking belief changes over time
  created_in_high_emotion?: boolean; // Flag for cool-down review
  review_reminder_at?: string | null; // When to remind user to review
  metadata?: Record<string, unknown>; // For future AI pattern detection
  created_at: string;
  updated_at: string;
};

// HARD RULE: Content must be framed as YOUR belief, not objective fact
export type CreatePerceptionInput = {
  subject_person_id?: string;
  subject_alias: string; // REQUIRED
  content: string; // MUST be framed as "I believed..." or "I heard that..." not "X did Y"
  source: PerceptionSource;
  source_detail?: string; // e.g. "told by Alex"
  confidence_level?: number; // 0.0 to 1.0 (defaults to 0.3)
  sentiment?: PerceptionSentiment;
  timestamp_heard?: string;
  related_memory_id?: string; // Link to journal entry if this relates to a direct experience
  impact_on_me: string; // REQUIRED - Key Insight Lever: How did believing this affect my actions, emotions, or decisions?
  created_in_high_emotion?: boolean; // Flag for cool-down review mode
  review_reminder_days?: number; // Days until review reminder (default 7 for high-emotion entries)
};

// HARD RULE: Updates track evolution, not overwrites
export type UpdatePerceptionInput = Partial<Omit<CreatePerceptionInput, 'impact_on_me'>> & {
  impact_on_me?: string; // Can be updated but should always have a value
  status?: PerceptionStatus; // Can evolve: unverified -> confirmed/disproven/retracted
  retracted?: boolean;
  resolution_note?: string; // Notes on resolution/retraction (tracks evolution)
  evolution_note?: string; // Add a note to evolution_notes array (preserves history)
};
