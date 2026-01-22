import { fetchJson } from '../lib/api';
import type { Skill, CreateSkillInput, UpdateSkillInput, SkillProgress, SkillCategory, SkillMetadata } from '../types/skill';

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
