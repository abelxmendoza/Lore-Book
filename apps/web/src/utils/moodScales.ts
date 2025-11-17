export type MoodScale = {
  score: number;
  color: string;
  label: string;
};

export const moodScales: MoodScale[] = [
  { score: -5, color: '#ff3358', label: 'Red glitch' },
  { score: -3, color: '#ff3eb5', label: 'Fractured' },
  { score: -1, color: '#9B5CFF', label: 'Brooding' },
  { score: 0, color: '#9B5CFF', label: 'Neutral' },
  { score: 1, color: '#b37bff', label: 'Hopeful' },
  { score: 3, color: '#4DE2FF', label: 'Calm drive' },
  { score: 5, color: '#5CFFD0', label: 'Aqua zen' }
];

export const getMoodColor = (score: number) => {
  const sorted = [...moodScales].sort((a, b) => Math.abs(score - a.score) - Math.abs(score - b.score));
  return sorted[0]?.color ?? '#9B5CFF';
};
