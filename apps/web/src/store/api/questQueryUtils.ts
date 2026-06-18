import type { QuestFilters } from '../../types/quest';

/** Build `/api/quests?…` query string from optional list filters. */
export function buildQuestFiltersQuery(filters?: QuestFilters): string {
  if (!filters) return '';
  const params = new URLSearchParams();

  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    statuses.forEach((s) => params.append('status', s));
  }
  if (filters.quest_type) {
    const types = Array.isArray(filters.quest_type) ? filters.quest_type : [filters.quest_type];
    types.forEach((t) => params.append('quest_type', t));
  }
  if (filters.category) params.append('category', filters.category);
  if (filters.search) params.append('search', filters.search);
  if (filters.min_priority != null) params.append('min_priority', String(filters.min_priority));
  if (filters.min_importance != null) params.append('min_importance', String(filters.min_importance));
  if (filters.min_impact != null) params.append('min_impact', String(filters.min_impact));
  if (filters.limit != null) params.append('limit', String(filters.limit));
  if (filters.offset != null) params.append('offset', String(filters.offset));

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}
