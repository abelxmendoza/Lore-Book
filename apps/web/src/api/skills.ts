import { fetchJson } from '../lib/api';
import type { Skill, CreateSkillInput, UpdateSkillInput, SkillProgress, SkillCategory, SkillMetadata } from '../types/skill';

import type { SkillProfile } from '../lib/skillProfile';

export interface SkillSuggestion {
  id: string;
  skill_name: string;
  skill_category: SkillCategory;
  skill_type?: SkillProfile['skill_type'];
  monetization?: SkillProfile['monetization'];
  proficiency?: number;
  confidence: number;
  enjoyment?: number;
  usage_frequency?: SkillProfile['usage_frequency'];
  trajectory?: SkillProfile['trajectory'];
  description?: string;
  origin_story?: string;
  first_learned_context?: string;
  related_jobs?: string[];
  related_projects?: string[];
  parent_skill_name?: string;
  related_skill_names?: string[];
  evidence?: string[] | Array<{ text: string }>;
  source?: string;
}

export const skillsApi = {
  /**
   * Get all skills
   */
  async getSkills(filters?: { active_only?: boolean; category?: SkillCategory }): Promise<Skill[]> {
    const params = new URLSearchParams();
    if (filters?.active_only) params.append('active_only', 'true');
    if (filters?.category) params.append('category', filters.category);

    const url = `/api/skills${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetchJson<{ skills: Skill[] }>(url);
    return response.skills;
  },

  /**
   * Pending skill suggestions from DB. Pass rescan=true to re-read chats/journal (manual refresh only).
   */
  async getSuggestions(opts?: { rescan?: boolean }): Promise<SkillSuggestion[]> {
    const params = opts?.rescan ? '?rescan=true' : '';
    const response = await fetchJson<{ suggestions: SkillSuggestion[] }>(`/api/skills/suggestions${params}`);
    return response.suggestions || [];
  },

  async materializeSuggestion(input: SkillSuggestion & { suggestion_id?: string }): Promise<Skill> {
    const response = await fetchJson<{ skill: Skill }>('/api/skills/suggestions/materialize', {
      method: 'POST',
      body: JSON.stringify({
        skill_name: input.skill_name,
        skill_category: input.skill_category,
        skill_type: input.skill_type,
        monetization: input.monetization,
        proficiency: input.proficiency,
        confidence: input.confidence,
        enjoyment: input.enjoyment,
        usage_frequency: input.usage_frequency,
        trajectory: input.trajectory,
        description: input.description,
        origin_story: input.origin_story,
        first_learned_context: input.first_learned_context,
        related_jobs: input.related_jobs,
        related_projects: input.related_projects,
        parent_skill_name: input.parent_skill_name,
        related_skill_names: input.related_skill_names,
        evidence: input.evidence,
        suggestion_id: input.id ?? input.suggestion_id,
      }),
    });
    return response.skill;
  },

  async rejectSuggestionByName(skillName: string): Promise<void> {
    await fetchJson('/api/skills/suggestions/reject-by-name', {
      method: 'POST',
      body: JSON.stringify({ skill_name: skillName }),
    });
  },

  async confirmSuggestion(suggestionId: string): Promise<Skill> {
    const response = await fetchJson<{ skill: Skill }>(`/api/skills/suggestions/${suggestionId}/confirm`, {
      method: 'POST',
    });
    return response.skill;
  },

  async rejectSuggestion(suggestionId: string): Promise<void> {
    await fetchJson(`/api/skills/suggestions/${suggestionId}/reject`, { method: 'POST' });
  },

  /**
   * Get a single skill
   */
  async getSkill(skillId: string): Promise<Skill> {
    const response = await fetchJson<{ skill: Skill }>(`/api/skills/${skillId}`);
    return response.skill;
  },

  /**
   * Create a new skill
   */
  async createSkill(input: CreateSkillInput): Promise<Skill> {
    const response = await fetchJson<{ skill: Skill }>('/api/skills', {
      method: 'POST',
      body: JSON.stringify(input)
    });
    return response.skill;
  },

  /**
   * Update a skill
   */
  async updateSkill(skillId: string, input: UpdateSkillInput): Promise<Skill> {
    const response = await fetchJson<{ skill: Skill }>(`/api/skills/${skillId}`, {
      method: 'PATCH',
      body: JSON.stringify(input)
    });
    return response.skill;
  },

  /**
   * Add XP to a skill
   */
  async addXP(
    skillId: string,
    xpAmount: number,
    sourceType: 'memory' | 'achievement' | 'manual',
    sourceId?: string,
    notes?: string
  ): Promise<{ skill: Skill; leveledUp: boolean; newLevel?: number }> {
    const response = await fetchJson<{ skill: Skill; leveledUp: boolean; newLevel?: number }>(
      `/api/skills/${skillId}/xp`,
      {
        method: 'POST',
        body: JSON.stringify({
          xp_amount: xpAmount,
          source_type: sourceType,
          source_id: sourceId,
          notes
        })
      }
    );
    return response;
  },

  /**
   * Get skill progress history
   */
  async getSkillProgress(skillId?: string, limit: number = 50): Promise<SkillProgress[]> {
    const url = skillId
      ? `/api/skills/${skillId}/progress?limit=${limit}`
      : `/api/skills/progress?limit=${limit}`;
    const response = await fetchJson<{ progress: SkillProgress[] }>(url);
    return response.progress;
  },

  /**
   * Extract skills from journal entry
   */
  async extractSkills(entryId: string, content: string): Promise<Array<{ skill: Skill; created: boolean }>> {
    const response = await fetchJson<{ results: Array<{ skill: Skill; created: boolean }> }>(
      '/api/skills/extract',
      {
        method: 'POST',
        body: JSON.stringify({ entry_id: entryId, content })
      }
    );
    return response.results;
  },

  /**
   * Delete a skill
   */
  async deleteSkill(skillId: string): Promise<void> {
    await fetchJson(`/api/skills/${skillId}`, {
      method: 'DELETE'
    });
  },

  /**
   * Get skill with enriched details
   */
  async getSkillDetails(skillId: string): Promise<Skill> {
    const response = await fetchJson<{ skill: Skill }>(`/api/skills/${skillId}/details`);
    return response.skill;
  },

  /**
   * Extract skill details from journal entries
   */
  async extractSkillDetails(skillId: string): Promise<SkillMetadata> {
    const response = await fetchJson<{ details: SkillMetadata }>(`/api/skills/${skillId}/details/extract`, {
      method: 'POST'
    });
    return response.details;
  },

  /**
   * Update skill details
   */
  async updateSkillDetails(skillId: string, updates: Partial<SkillMetadata>): Promise<Skill> {
    const response = await fetchJson<{ skill: Skill }>(`/api/skills/${skillId}/details`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
    return response.skill;
  }
};
