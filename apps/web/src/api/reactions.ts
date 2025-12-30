import { fetchJson } from '../lib/api';
import type { ReactionEntry, CreateReactionInput, UpdateReactionInput, ReactionPatterns, ReactionTriggerType, ReactionType } from '../types/reaction';

export const reactionApi = {
  /**
   * Create a new reaction entry
   */
  async createReaction(input: CreateReactionInput): Promise<ReactionEntry> {
    const response = await fetchJson<{ reaction: ReactionEntry }>('/api/reactions', {
      method: 'POST',
      body: JSON.stringify(input)
    });
    return response.reaction;
  },

  /**
   * Get reaction entries
   */
  async getReactions(filters?: {
    trigger_type?: ReactionTriggerType;
    trigger_id?: string;
    reaction_type?: ReactionType;
    reaction_label?: string;
    limit?: number;
    offset?: number;
  }): Promise<ReactionEntry[]> {
    const params = new URLSearchParams();
    if (filters?.trigger_type) params.append('trigger_type', filters.trigger_type);
    if (filters?.trigger_id) params.append('trigger_id', filters.trigger_id);
    if (filters?.reaction_type) params.append('reaction_type', filters.reaction_type);
    if (filters?.reaction_label) params.append('reaction_label', filters.reaction_label);
    if (filters?.limit) params.append('limit', String(filters.limit));
    if (filters?.offset) params.append('offset', String(filters.offset));

    const url = `/api/reactions${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetchJson<{ reactions: ReactionEntry[] }>(url);
    return response.reactions;
  },

  /**
   * Get reactions for a specific trigger
   */
  async getReactionsForTrigger(triggerType: ReactionTriggerType, triggerId: string): Promise<ReactionEntry[]> {
    const response = await fetchJson<{ reactions: ReactionEntry[] }>(
      `/api/reactions/trigger/${triggerType}/${triggerId}`
    );
    return response.reactions;
  },

  /**
   * Get reaction patterns (for therapist mode)
   */
  async getReactionPatterns(): Promise<ReactionPatterns> {
    const response = await fetchJson<{ patterns: ReactionPatterns }>('/api/reactions/patterns');
    return response.patterns;
  },

  /**
   * Update a reaction entry
   */
  async updateReaction(reactionId: string, input: UpdateReactionInput): Promise<ReactionEntry> {
    const response = await fetchJson<{ reaction: ReactionEntry }>(`/api/reactions/${reactionId}`, {
      method: 'PATCH',
      body: JSON.stringify(input)
    });
    return response.reaction;
  },

  /**
   * Delete a reaction entry
   */
  async deleteReaction(reactionId: string): Promise<void> {
    await fetchJson(`/api/reactions/${reactionId}`, {
      method: 'DELETE'
    });
  }
};
