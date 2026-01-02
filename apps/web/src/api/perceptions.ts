import { fetchJson } from '../lib/api';
import type { PerceptionEntry, CreatePerceptionInput, UpdatePerceptionInput } from '../types/perception';

export const perceptionApi = {
  /**
   * Create a new perception entry
   */
  async createPerception(input: CreatePerceptionInput): Promise<PerceptionEntry> {
    const response = await fetchJson<{ perception: PerceptionEntry }>('/api/perceptions', {
      method: 'POST',
      body: JSON.stringify(input)
    });
    return response.perception;
  },

  /**
   * Get perception entries
   * HARD RULE: These can be filtered by timeline/era, but cannot anchor timelines
   */
  async getPerceptions(filters?: {
    subject_person_id?: string;
    subject_alias?: string;
    source?: string;
    retracted?: boolean;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<PerceptionEntry[]> {
    const params = new URLSearchParams();
    if (filters?.subject_person_id) params.append('subject_person_id', filters.subject_person_id);
    if (filters?.subject_alias) params.append('subject_alias', filters.subject_alias);
    if (filters?.source) params.append('source', filters.source);
    if (filters?.retracted !== undefined) params.append('retracted', String(filters.retracted));
    if (filters?.status) params.append('status', filters.status);
    if (filters?.limit) params.append('limit', String(filters.limit));
    if (filters?.offset) params.append('offset', String(filters.offset));

    const url = `/api/perceptions${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetchJson<{ perceptions: PerceptionEntry[] }>(url);
    return response.perceptions;
  },

  /**
   * Get perceptions about a specific person
   */
  async getPerceptionsAboutPerson(personId: string): Promise<PerceptionEntry[]> {
    const response = await fetchJson<{ perceptions: PerceptionEntry[] }>(`/api/perceptions/about/${personId}`);
    return response.perceptions;
  },

  /**
   * Get perception evolution for a person
   */
  async getPerceptionEvolution(personId: string): Promise<PerceptionEntry[]> {
    const response = await fetchJson<{ perceptions: PerceptionEntry[] }>(`/api/perceptions/evolution/${personId}`);
    return response.perceptions;
  },

  /**
   * Update a perception entry
   */
  async updatePerception(entryId: string, input: UpdatePerceptionInput): Promise<PerceptionEntry> {
    const response = await fetchJson<{ perception: PerceptionEntry }>(`/api/perceptions/${entryId}`, {
      method: 'PATCH',
      body: JSON.stringify(input)
    });
    return response.perception;
  },

  /**
   * Delete a perception entry
   * HARD RULE: Prefer retraction over deletion (retractions are explicit, not deletes)
   */
  async deletePerception(entryId: string): Promise<void> {
    await fetchJson(`/api/perceptions/${entryId}`, {
      method: 'DELETE'
    });
  },

  /**
   * Detect if a message contains perception/gossip
   */
  async detectPerception(message: string, conversationHistory: Array<{ role: string; content: string }> = []): Promise<{
    detection: {
      isPerception: boolean;
      confidence: 'high' | 'medium' | 'low';
      suggestedSource?: PerceptionSource;
      subjectPerson?: string;
      reason: string;
      needsFraming?: boolean;
    };
  }> {
    return fetchJson('/api/perceptions/detect', {
      method: 'POST',
      body: JSON.stringify({ message, conversationHistory })
    });
  },

  /**
   * Get perception lens view
   * HARD RULE: This is a view mode, not a data structure
   * Filters by time bucket + subject for "What I believed during X period"
   */
  async getPerceptionLens(filters: {
    timeStart?: string;
    timeEnd?: string;
    subject_alias?: string;
    source?: PerceptionSource;
    confidence_min?: number;
    confidence_max?: number;
    status?: PerceptionStatus;
  }): Promise<PerceptionEntry[]> {
    const params = new URLSearchParams();
    if (filters.timeStart) params.append('timeStart', filters.timeStart);
    if (filters.timeEnd) params.append('timeEnd', filters.timeEnd);
    if (filters.subject_alias) params.append('subject_alias', filters.subject_alias);
    if (filters.source) params.append('source', filters.source);
    if (filters.confidence_min !== undefined) params.append('confidence_min', String(filters.confidence_min));
    if (filters.confidence_max !== undefined) params.append('confidence_max', String(filters.confidence_max));
    if (filters.status) params.append('status', filters.status);

    const url = `/api/perceptions/lens${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetchJson<{ perceptions: PerceptionEntry[] }>(url);
    return response.perceptions;
  },

  /**
   * Get entries that need cool-down review (high-emotion entries past reminder date)
   */
  async getEntriesNeedingReview(): Promise<PerceptionEntry[]> {
    const response = await fetchJson<{ entries: PerceptionEntry[] }>('/api/perceptions/review-needed');
    return response.entries;
  }
};
