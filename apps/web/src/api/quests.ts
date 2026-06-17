import { fetchJson } from '../lib/api';
import { apiCache } from '../lib/cache';
import { clampQuestScore, normalizeQuestType, optionalQuestString } from '../lib/questNormalize';
import type { Quest, QuestSuggestion } from '../types/quest';

export const questsApi = {
  async getSuggestions(opts?: { rescan?: boolean }): Promise<QuestSuggestion[]> {
    const params = opts?.rescan ? '?rescan=true' : '';
    const response = await fetchJson<{ suggestions: QuestSuggestion[] }>(`/api/quests/suggestions${params}`);
    return response.suggestions || [];
  },

  async materializeSuggestion(input: QuestSuggestion): Promise<Quest> {
    const response = await fetchJson<{ quest: Quest }>('/api/quests/suggestions/materialize', {
      method: 'POST',
      body: JSON.stringify({
        title: input.title,
        description: optionalQuestString(input.description),
        quest_type: normalizeQuestType(input.quest_type),
        priority: clampQuestScore(input.priority),
        importance: clampQuestScore(input.importance),
        impact: clampQuestScore(input.impact),
        suggestion_id: input.id,
      }),
    });
    apiCache.deletePattern(/\/api\/quests(\/|\?|:)/);
    return response.quest;
  },

  async rejectSuggestion(suggestionId: string): Promise<void> {
    await fetchJson(`/api/quests/suggestions/${suggestionId}/reject`, { method: 'POST' });
  },

  async rejectSuggestionByTitle(title: string): Promise<void> {
    await fetchJson('/api/quests/suggestions/reject-by-title', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
  },
};
