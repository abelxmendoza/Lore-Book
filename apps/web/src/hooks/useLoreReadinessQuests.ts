import { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '../lib/api';
import { onStoryDataUpdated } from '../lib/storyRefresh';
import { useShouldUseMockData } from './useShouldUseMockData';

export type LoreReadinessQuest = {
  id: string;
  topicId: string;
  label: string;
  prompt: string;
  progress: number;
};

const DEMO_QUESTS: LoreReadinessQuest[] = [
  {
    id: 'demo-career',
    topicId: 'professional',
    label: 'Career & work',
    prompt: 'Tell me about your first real job — what you learned and how it changed you.',
    progress: 0.55,
  },
  {
    id: 'demo-family',
    topicId: 'family',
    label: 'Family',
    prompt: 'Share a memory from home that still shapes who you are today.',
    progress: 0.4,
  },
];

export function useLoreReadinessQuests(enabled = true) {
  const isMock = useShouldUseMockData();
  const [quests, setQuests] = useState<LoreReadinessQuest[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) return;
    if (isMock) {
      setQuests(DEMO_QUESTS);
      return;
    }

    setLoading(true);
    try {
      const result = await fetchJson<{ quests: LoreReadinessQuest[] }>('/api/biography/readiness/quests');
      setQuests(result.quests ?? []);
    } catch {
      setQuests([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, isMock]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (isMock || !enabled) return;
    return onStoryDataUpdated(() => {
      void load();
    });
  }, [enabled, isMock, load]);

  return { quests, loading, refresh: load };
}
