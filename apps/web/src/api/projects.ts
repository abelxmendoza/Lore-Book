import type { ProjectCardData } from '../components/projects/ProjectProfileCard';
import { fetchJson } from '../lib/api';
import type { AlternativeCategory } from '../lib/suggestionMatchTypes';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  source_message_id?: string | null;
  alternative_categories?: AlternativeCategory[];
}

export const projectsApi = {
  async getSuggestions(opts?: { rescan?: boolean }): Promise<ProjectSuggestion[]> {
    const params = opts?.rescan ? '?rescan=true' : '';
    const response = await fetchJson<{ suggestions: ProjectSuggestion[] }>(`/api/projects/suggestions${params}`);
    return response.suggestions || [];
  },

  async materializeSuggestion(input: ProjectSuggestion): Promise<ProjectCardData> {
    const response = await fetchJson<{ project: ProjectCardData }>('/api/projects/suggestions/materialize', {
      method: 'POST',
      body: JSON.stringify({
        name: input.name,
        description: input.description,
        type: input.project_type,
        status: input.status,
        ...(UUID_RE.test(input.id) ? { suggestion_id: input.id } : {}),
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
