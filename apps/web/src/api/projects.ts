import { fetchJson } from '../lib/api';

export interface ProjectSuggestion {
  id: string;
  name: string;
  description?: string;
  project_type?: string;
  status?: string;
  confidence: number;
  reasoning?: string;
  evidence?: string[] | Array<{ text: string }>;
  match_status?: 'new' | 'similar' | 'existing';
  matched_project_id?: string | null;
  matched_project_name?: string | null;
  source?: string;
}

export const projectsApi = {
  async getSuggestions(opts?: { rescan?: boolean }): Promise<ProjectSuggestion[]> {
    const params = opts?.rescan ? '?rescan=true' : '';
    const response = await fetchJson<{ suggestions: ProjectSuggestion[] }>(`/api/projects/suggestions${params}`);
    return response.suggestions || [];
  },

  async materializeSuggestion(input: ProjectSuggestion): Promise<unknown> {
    const response = await fetchJson<{ project: unknown }>('/api/projects/suggestions/materialize', {
      method: 'POST',
      body: JSON.stringify({
        name: input.name,
        description: input.description,
        type: input.project_type,
        status: input.status,
        suggestion_id: input.id,
      }),
    });
    return response.project;
  },

  async rejectSuggestionByName(name: string): Promise<void> {
    await fetchJson('/api/projects/suggestions/reject-by-name', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  async rejectSuggestion(id: string): Promise<void> {
    await fetchJson(`/api/projects/suggestions/${id}/reject`, { method: 'POST' });
  },
};
