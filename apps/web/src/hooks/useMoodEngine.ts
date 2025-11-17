import { useCallback, useMemo, useState } from 'react';

import { fetchJson } from '../lib/api';
import { getMoodColor, moodScales } from '../utils/moodScales';

type MoodState = {
  score: number;
  color: string;
  label: string;
};

const localHeuristic = (text: string): number => {
  const normalized = text.toLowerCase();
  const positive = (text.match(/(calm|excited|grateful|proud|progress)/gi) ?? []).length;
  const negative = (text.match(/(tired|angry|sad|anxious|hurt|lost)/gi) ?? []).length;
  return Math.max(-5, Math.min(5, positive - negative));
};

export const useMoodEngine = () => {
  const [mood, setMood] = useState<MoodState>({ score: 0, color: getMoodColor(0), label: 'Neutral' });
  const [loading, setLoading] = useState(false);

  const evaluate = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        setMood({ score: 0, color: getMoodColor(0), label: 'Neutral' });
        return;
      }
      setLoading(true);
      try {
        const payload = { text };
        const { mood: serverScore } = await fetchJson<{ mood: number }>(`/api/moods/score`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        setMood({ score: serverScore, color: getMoodColor(serverScore), label: moodScales.find((m) => m.score === serverScore)?.label ?? 'Reactive' });
      } catch {
        const fallback = localHeuristic(text);
        setMood({ score: fallback, color: getMoodColor(fallback), label: 'Reactive' });
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const setScore = useCallback((value: number) => {
    setMood({ score: value, color: getMoodColor(value), label: moodScales.find((m) => m.score === value)?.label ?? 'Custom' });
  }, []);

  const intensity = useMemo(() => Math.abs(mood.score) / 5, [mood.score]);

  return { mood, loading, evaluate, setScore, intensity };
};
