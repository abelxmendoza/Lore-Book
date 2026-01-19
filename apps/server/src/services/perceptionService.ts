import { v4 as uuid } from 'uuid';

import { logger } from '../logger';

import { supabaseAdmin } from './supabaseClient';

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
  resolution_note?: string | null; // Notes on resolution/retraction
  original_content?: string | null; // Preserve original for evolution tracking
  evolution_notes?: string[]; // Array tracking belief changes over time
  created_in_high_emotion?: boolean; // Flag for cool-down review
  review_reminder_at?: string | null; // When to remind user to review
  metadata?: Record<string, unknown>; // For future AI pattern detection
  created_at: string;
  updated_at: string;
};

// HARD RULE: Content must be framed as YOUR belief, not objective fact
export type CreatePerceptionEntryInput = {
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
export type UpdatePerceptionEntryInput = Partial<Omit<CreatePerceptionEntryInput, 'impact_on_me'>> & {
  impact_on_me?: string; // Can be updated but should always have a value
  status?: PerceptionStatus; // Can evolve: unverified -> confirmed/disproven/retracted
  retracted?: boolean;
  resolution_note?: string; // Notes on resolution/retraction (tracks evolution)
  evolution_note?: string; // Add a note to evolution_notes array (preserves history)
};

class PerceptionService {
  /**
   * Create a new perception entry
   * HARD RULE: Content must be framed as YOUR belief, not objective fact
   * Validation: Check that content uses perception framing ("I believed", "I heard", etc.)
   */
  async createPerceptionEntry(
    userId: string,
    input: CreatePerceptionEntryInput
  ): Promise<PerceptionEntry> {
    try {
      // VALIDATION: Ensure content is framed as perception, not objective fact
      const contentLower = input.content.toLowerCase().trim();
      const perceptionFraming = [
        'i believed', 'i heard', 'i thought', 'i assumed', 'i perceived',
        'people said', 'rumor has it', 'i was told', 'someone told me',
        'i overheard', 'i saw on', 'i read that', 'i think', 'i feel like'
      ];
      
      const hasPerceptionFraming = perceptionFraming.some(phrase => contentLower.startsWith(phrase));
      if (!hasPerceptionFraming && contentLower.length > 20) {
        // Auto-frame if missing (but log warning)
        logger.warn({ content: input.content.substring(0, 100) }, 'Content missing perception framing - auto-framing');
        input.content = `I believed that ${input.content}`;
      }

      // VALIDATION: Check if subject person requires extra confirmation (sensitivity flag)
      if (input.subject_person_id) {
        const { data: character } = await supabaseAdmin
          .from('characters')
          .select('sensitivity_level, requires_extra_confirmation')
          .eq('id', input.subject_person_id)
          .eq('user_id', userId)
          .single();
        
        if (character?.requires_extra_confirmation || character?.sensitivity_level === 'sensitive') {
          // In production, this would trigger a confirmation UI
          // For now, we log and proceed (but lower confidence)
          logger.warn({ subject_person_id: input.subject_person_id }, 'Creating perception about sensitive person');
          if (input.confidence_level === undefined || input.confidence_level > 0.3) {
            input.confidence_level = 0.3; // Force lower confidence for sensitive people
          }
        }
      }

      const id = uuid();
      const now = new Date().toISOString();
      
      // Calculate review reminder date for high-emotion entries (default 7 days)
      const reviewReminderDays = input.review_reminder_days || 7;
      const reviewReminderAt = input.created_in_high_emotion
        ? new Date(Date.now() + reviewReminderDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

      // Store original content for evolution tracking
      const originalContent = input.content;

      // Log metadata for future AI pattern detection
      const metadata: Record<string, unknown> = {
        created_at: now,
        confidence_level: input.confidence_level ?? 0.3,
        source: input.source,
        has_related_memory: !!input.related_memory_id,
        high_emotion: input.created_in_high_emotion || false
      };

      const { data, error } = await supabaseAdmin
        .from('perception_entries')
        .insert({
          id,
          user_id: userId,
          subject_person_id: input.subject_person_id || null,
          subject_alias: input.subject_alias, // REQUIRED
          source: input.source,
          source_detail: input.source_detail || null,
          content: input.content, // Must be framed as YOUR belief
          sentiment: input.sentiment || null,
          confidence_level: input.confidence_level ?? 0.3, // Default LOW (0.3)
          timestamp_heard: input.timestamp_heard || now,
          related_memory_id: input.related_memory_id || null,
          impact_on_me: input.impact_on_me, // REQUIRED - Key Insight Lever
          status: 'unverified', // Default status
          retracted: false,
          original_content: originalContent, // Preserve for evolution tracking
          evolution_notes: [], // Start empty
          created_in_high_emotion: input.created_in_high_emotion || false,
          review_reminder_at: reviewReminderAt,
          metadata,
          created_at: now,
          updated_at: now
        })
        .select('*')
        .single();

      if (error) {
        logger.error({ error, input }, 'Failed to create perception entry');
        throw error;
      }

      return data as PerceptionEntry;
    } catch (error) {
      logger.error({ error, input }, 'Failed to create perception entry');
      throw error;
    }
  }

  /**
   * Get perception entries for a user
   * HARD RULE: These can be filtered by timeline/era, but cannot anchor timelines
   */
  async getPerceptionEntries(
    userId: string,
    filters?: {
      subject_person_id?: string;
      subject_alias?: string;
      source?: PerceptionSource;
      retracted?: boolean;
      status?: PerceptionStatus;
      limit?: number;
      offset?: number;
    }
  ): Promise<PerceptionEntry[]> {
    try {
      let query = supabaseAdmin
        .from('perception_entries')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp_heard', { ascending: false });

      if (filters?.subject_person_id) {
        query = query.eq('subject_person_id', filters.subject_person_id);
      }
      if (filters?.subject_alias) {
        query = query.eq('subject_alias', filters.subject_alias);
      }
      if (filters?.source) {
        query = query.eq('source', filters.source);
      }
      if (filters?.retracted !== undefined) {
        query = query.eq('retracted', filters.retracted);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.limit) {
        query = query.limit(filters.limit);
      }
      if (filters?.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 100) - 1);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error, filters }, 'Failed to get perception entries');
        throw error;
      }

      return (data || []) as PerceptionEntry[];
    } catch (error) {
      logger.error({ error, filters }, 'Failed to get perception entries');
      throw error;
    }
  }

  /**
   * Update a perception entry
   */
  async updatePerceptionEntry(
    userId: string,
    entryId: string,
    input: UpdatePerceptionEntryInput
  ): Promise<PerceptionEntry> {
    try {
      // HARD RULE: Updates track evolution, not overwrites
      // First, get current entry to preserve original_content
      const { data: currentEntry } = await supabaseAdmin
        .from('perception_entries')
        .select('content, original_content, evolution_notes')
        .eq('id', entryId)
        .eq('user_id', userId)
        .single();

      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString()
      };

      if (input.subject_person_id !== undefined) updateData.subject_person_id = input.subject_person_id;
      if (input.subject_alias !== undefined) updateData.subject_alias = input.subject_alias;
      if (input.source !== undefined) updateData.source = input.source;
      if (input.source_detail !== undefined) updateData.source_detail = input.source_detail;
      if (input.content !== undefined) {
        // VALIDATION: Ensure content maintains perception framing
        const contentLower = input.content.toLowerCase().trim();
        const perceptionFraming = [
          'i believed', 'i heard', 'i thought', 'i assumed', 'i perceived',
          'people said', 'rumor has it', 'i was told', 'someone told me'
        ];
        const hasFraming = perceptionFraming.some(phrase => contentLower.startsWith(phrase));
        if (!hasFraming && contentLower.length > 20) {
          logger.warn({ content: input.content.substring(0, 100) }, 'Update content missing perception framing');
        }
        // Preserve original_content if not already set
        if (currentEntry && !currentEntry.original_content) {
          updateData.original_content = currentEntry.content;
        }
        updateData.content = input.content;
      }
      if (input.sentiment !== undefined) updateData.sentiment = input.sentiment;
      if (input.confidence_level !== undefined) {
        // HARD RULE: Never auto-raise confidence
        updateData.confidence_level = Math.max(0, Math.min(1, input.confidence_level));
      }
      if (input.timestamp_heard !== undefined) updateData.timestamp_heard = input.timestamp_heard;
      if (input.related_memory_id !== undefined) updateData.related_memory_id = input.related_memory_id;
      if (input.impact_on_me !== undefined) updateData.impact_on_me = input.impact_on_me;

      // Handle status evolution (unverified -> confirmed/disproven/retracted)
      if (input.status !== undefined) {
        updateData.status = input.status;
        if (input.status === 'retracted') {
          updateData.retracted = true;
        }
      }

      // Handle retraction
      if (input.retracted !== undefined) {
        updateData.retracted = input.retracted;
        if (input.retracted) {
          updateData.status = 'retracted';
        }
      }

      // Handle resolution note (tracks evolution)
      if (input.resolution_note !== undefined) {
        updateData.resolution_note = input.resolution_note;
      }

      // Handle evolution note (adds to evolution_notes array - preserves history)
      if (input.evolution_note) {
        const existingNotes = (currentEntry?.evolution_notes || []) as string[];
        const newNote = `${new Date().toISOString().split('T')[0]}: ${input.evolution_note}`;
        updateData.evolution_notes = [...existingNotes, newNote];
      }

      const { data, error } = await supabaseAdmin
        .from('perception_entries')
        .update(updateData)
        .eq('id', entryId)
        .eq('user_id', userId)
        .select('*')
        .single();

      if (error) {
        logger.error({ error, entryId, input }, 'Failed to update perception entry');
        throw error;
      }

      return data as PerceptionEntry;
    } catch (error) {
      logger.error({ error, entryId, input }, 'Failed to update perception entry');
      throw error;
    }
  }

  /**
   * Delete a perception entry
   */
  async deletePerceptionEntry(userId: string, entryId: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('perception_entries')
        .delete()
        .eq('id', entryId)
        .eq('user_id', userId);

      if (error) {
        logger.error({ error, entryId }, 'Failed to delete perception entry');
        throw error;
      }
    } catch (error) {
      logger.error({ error, entryId }, 'Failed to delete perception entry');
      throw error;
    }
  }

  /**
   * Get perception entries for a specific person
   * HARD RULE: People are thin nodes - they link to perceptions, but don't own timelines
   */
  async getPerceptionsAboutPerson(
    userId: string,
    personId: string
  ): Promise<PerceptionEntry[]> {
    return this.getPerceptionEntries(userId, {
      subject_person_id: personId,
      retracted: false,
      status: 'unverified' // Default: show unverified, can filter
    });
  }

  /**
   * Get evolution of perceptions over time for a person
   * HARD RULE: Shows versioned beliefs over time (not overwrites)
   */
  async getPerceptionEvolution(
    userId: string,
    personId: string
  ): Promise<PerceptionEntry[]> {
    // Include all statuses to show evolution (unverified -> confirmed/disproven/retracted)
    return this.getPerceptionEntries(userId, {
      subject_person_id: personId
    });
  }

  /**
   * Get perception lens view
   * HARD RULE: This is a view mode, not a data structure
   * Filters perceptions by time bucket + subject for "What I believed during X period"
   */
  async getPerceptionLens(
    userId: string,
    filters: {
      timeStart?: string;
      timeEnd?: string;
      subject_alias?: string;
      source?: PerceptionSource;
      confidence_min?: number;
      confidence_max?: number;
      status?: PerceptionStatus;
    }
  ): Promise<PerceptionEntry[]> {
    let query = supabaseAdmin
      .from('perception_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('retracted', false)
      .order('timestamp_heard', { ascending: false });

    if (filters.timeStart) {
      query = query.gte('timestamp_heard', filters.timeStart);
    }
    if (filters.timeEnd) {
      query = query.lte('timestamp_heard', filters.timeEnd);
    }
    if (filters.subject_alias) {
      query = query.eq('subject_alias', filters.subject_alias);
    }
    if (filters.source) {
      query = query.eq('source', filters.source);
    }
    if (filters.confidence_min !== undefined) {
      query = query.gte('confidence_level', filters.confidence_min);
    }
    if (filters.confidence_max !== undefined) {
      query = query.lte('confidence_level', filters.confidence_max);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as PerceptionEntry[];
  }

  /**
   * Get entries that need cool-down review (high-emotion entries past reminder date)
   */
  async getEntriesNeedingReview(userId: string): Promise<PerceptionEntry[]> {
    const { data, error } = await supabaseAdmin
      .from('perception_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('created_in_high_emotion', true)
      .eq('retracted', false)
      .not('review_reminder_at', 'is', null)
      .lte('review_reminder_at', new Date().toISOString())
      .order('review_reminder_at', { ascending: true });

    if (error) throw error;
    return (data || []) as PerceptionEntry[];
  }
}

export const perceptionService = new PerceptionService();
