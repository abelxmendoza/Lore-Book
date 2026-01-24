/**
 * Ethics Review Service
 * 
 * Reviews journal entries for potential harm before publication:
 * - Detects potential harm to subjects
 * - Suggests actions (redact, anonymize, delay publication, get consent)
 * - Tracks review status
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { openai } from '../openaiClient';
import type { MemoryEntry } from '../../types';

export interface PotentialHarm {
  to_subjects: string[]; // Names or entity IDs
  severity: 'low' | 'medium' | 'high';
  type: 'reputation' | 'privacy' | 'emotional' | 'legal';
  description: string;
}

export interface EthicsReview {
  id: string;
  user_id: string;
  entry_id: string;
  potential_harm: PotentialHarm[];
  suggested_actions: ('redact' | 'anonymize' | 'delay_publication' | 'get_consent')[];
  review_status: 'pending' | 'reviewed' | 'action_taken' | 'approved';
  reviewer_notes?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  reviewed_at?: string;
}

class EthicsReviewService {
  /**
   * Review an entry for potential harm
   */
  async reviewEntry(
    userId: string,
    entry: MemoryEntry
  ): Promise<EthicsReview> {
    try {
      // Check if review already exists
      const existing = await this.getReviewForEntry(userId, entry.id);
      if (existing) {
        return existing;
      }

      // Analyze entry for potential harm
      const potentialHarm = await this.analyzePotentialHarm(userId, entry);
      const suggestedActions = this.suggestActions(potentialHarm);

      const review: Omit<EthicsReview, 'id' | 'created_at' | 'reviewed_at'> = {
        user_id: userId,
        entry_id: entry.id,
        potential_harm: potentialHarm,
        suggested_actions: suggestedActions,
        review_status: 'pending',
        metadata: {},
      };

      // Store review
      const { data, error } = await supabaseAdmin
        .from('ethics_reviews')
        .insert(review)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data as EthicsReview;
    } catch (error) {
      logger.error({ err: error, userId, entryId: entry.id }, 'Failed to review entry for ethics');
      throw error;
    }
  }

  /**
   * Analyze entry for potential harm using LLM
   */
  private async analyzePotentialHarm(
    userId: string,
    entry: MemoryEntry
  ): Promise<PotentialHarm[]> {
    const prompt = `Analyze this journal entry for potential harm to people mentioned if it were published:

"${entry.content}"

Consider:
- Reputation harm (damaging someone's reputation)
- Privacy harm (revealing private information)
- Emotional harm (causing emotional distress)
- Legal harm (potential legal issues)

Respond with JSON array:
[
  {
    "to_subjects": ["name1", "name2"],
    "severity": "low" | "medium" | "high",
    "type": "reputation" | "privacy" | "emotional" | "legal",
    "description": "brief description of potential harm"
  }
]`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return result.harm || result || [];
    } catch (error) {
      logger.warn({ err: error }, 'LLM harm analysis failed, using basic detection');

      // Fallback: basic detection
      return this.basicHarmDetection(entry);
    }
  }

  /**
   * Basic harm detection using pattern matching
   */
  private basicHarmDetection(entry: MemoryEntry): PotentialHarm[] {
    const harm: PotentialHarm[] = [];
    const text = entry.content.toLowerCase();

    // Detect potentially harmful patterns
    const reputationPatterns = [
      /(lied|cheated|stole|betrayed|abused)/gi,
      /(is|was) (a|an) (liar|cheat|thief|fraud)/gi,
    ];

    const privacyPatterns = [
      /(diagnosis|illness|disease|medical condition)/gi,
      /(salary|income|debt|financial)/gi,
      /(divorce|separation|affair)/gi,
    ];

    const emotionalPatterns = [
      /(hurt|damaged|traumatized|devastated)/gi,
      /(hate|despise|resent)/gi,
    ];

    if (reputationPatterns.some(p => p.test(text))) {
      harm.push({
        to_subjects: [], // Would need entity extraction
        severity: 'medium',
        type: 'reputation',
        description: 'Contains potentially reputation-damaging statements',
      });
    }

    if (privacyPatterns.some(p => p.test(text))) {
      harm.push({
        to_subjects: [],
        severity: 'high',
        type: 'privacy',
        description: 'Contains private or sensitive information',
      });
    }

    if (emotionalPatterns.some(p => p.test(text))) {
      harm.push({
        to_subjects: [],
        severity: 'medium',
        type: 'emotional',
        description: 'Contains emotionally charged content',
      });
    }

    return harm;
  }

  /**
   * Suggest actions based on potential harm
   */
  private suggestActions(harm: PotentialHarm[]): ('redact' | 'anonymize' | 'delay_publication' | 'get_consent')[] {
    const actions: Set<'redact' | 'anonymize' | 'delay_publication' | 'get_consent'> = new Set();

    for (const h of harm) {
      if (h.severity === 'high') {
        actions.add('redact');
        actions.add('get_consent');
      } else if (h.severity === 'medium') {
        if (h.type === 'privacy') {
          actions.add('anonymize');
        }
        actions.add('get_consent');
      } else {
        actions.add('get_consent');
      }

      if (h.type === 'legal') {
        actions.add('delay_publication');
      }
    }

    return Array.from(actions);
  }

  /**
   * Get review for an entry
   */
  async getReviewForEntry(
    userId: string,
    entryId: string
  ): Promise<EthicsReview | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('ethics_reviews')
        .select('*')
        .eq('user_id', userId)
        .eq('entry_id', entryId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }

      return data as EthicsReview;
    } catch (error) {
      logger.error({ err: error }, 'Failed to get ethics review');
      return null;
    }
  }

  /**
   * Update review status
   */
  async updateReviewStatus(
    userId: string,
    reviewId: string,
    status: 'pending' | 'reviewed' | 'action_taken' | 'approved',
    notes?: string
  ): Promise<EthicsReview> {
    try {
      const update: Partial<EthicsReview> = {
        review_status: status,
        reviewed_at: new Date().toISOString(),
      };

      if (notes) {
        update.reviewer_notes = notes;
      }

      const { data, error } = await supabaseAdmin
        .from('ethics_reviews')
        .update(update)
        .eq('id', reviewId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data as EthicsReview;
    } catch (error) {
      logger.error({ err: error }, 'Failed to update review status');
      throw error;
    }
  }

  /**
   * Get all pending reviews for a user
   */
  async getPendingReviews(userId: string): Promise<EthicsReview[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('ethics_reviews')
        .select('*')
        .eq('user_id', userId)
        .eq('review_status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return (data || []) as EthicsReview[];
    } catch (error) {
      logger.error({ err: error }, 'Failed to get pending reviews');
      return [];
    }
  }
}

export const ethicsReviewService = new EthicsReviewService();
