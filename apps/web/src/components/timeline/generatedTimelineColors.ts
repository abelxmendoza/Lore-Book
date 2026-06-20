export type TimelineLaneColor = {
  rail: string;
  dot: string;
  cardBg: string;
  cardBorder: string;
  text: string;
  badgeBg: string;
};

const LANE_COLORS: Record<string, TimelineLaneColor> = {
  Education: {
    rail: '#3b82f6',
    dot: 'bg-blue-400',
    cardBg: 'bg-blue-500/15',
    cardBorder: 'border-blue-400/45',
    text: 'text-blue-200',
    badgeBg: 'bg-blue-500/25 text-blue-100',
  },
  Career: {
    rail: '#6366f1',
    dot: 'bg-indigo-400',
    cardBg: 'bg-indigo-500/15',
    cardBorder: 'border-indigo-400/45',
    text: 'text-indigo-200',
    badgeBg: 'bg-indigo-500/25 text-indigo-100',
  },
  Relationships: {
    rail: '#f43f5e',
    dot: 'bg-rose-400',
    cardBg: 'bg-rose-500/15',
    cardBorder: 'border-rose-400/45',
    text: 'text-rose-200',
    badgeBg: 'bg-rose-500/25 text-rose-100',
  },
  Love: {
    rail: '#ec4899',
    dot: 'bg-pink-400',
    cardBg: 'bg-pink-500/15',
    cardBorder: 'border-pink-400/45',
    text: 'text-pink-200',
    badgeBg: 'bg-pink-500/25 text-pink-100',
  },
  Social: {
    rail: '#14b8a6',
    dot: 'bg-teal-400',
    cardBg: 'bg-teal-500/15',
    cardBorder: 'border-teal-400/45',
    text: 'text-teal-200',
    badgeBg: 'bg-teal-500/25 text-teal-100',
  },
  Friends: {
    rail: '#06b6d4',
    dot: 'bg-cyan-400',
    cardBg: 'bg-cyan-500/15',
    cardBorder: 'border-cyan-400/45',
    text: 'text-cyan-200',
    badgeBg: 'bg-cyan-500/25 text-cyan-100',
  },
  Health: {
    rail: '#10b981',
    dot: 'bg-emerald-400',
    cardBg: 'bg-emerald-500/15',
    cardBorder: 'border-emerald-400/45',
    text: 'text-emerald-200',
    badgeBg: 'bg-emerald-500/25 text-emerald-100',
  },
  Creative: {
    rail: '#a855f7',
    dot: 'bg-violet-400',
    cardBg: 'bg-violet-500/15',
    cardBorder: 'border-violet-400/45',
    text: 'text-violet-200',
    badgeBg: 'bg-violet-500/25 text-violet-100',
  },
  Identity: {
    rail: '#f59e0b',
    dot: 'bg-amber-400',
    cardBg: 'bg-amber-500/15',
    cardBorder: 'border-amber-400/45',
    text: 'text-amber-200',
    badgeBg: 'bg-amber-500/25 text-amber-100',
  },
  Family: {
    rail: '#fb923c',
    dot: 'bg-orange-400',
    cardBg: 'bg-orange-500/15',
    cardBorder: 'border-orange-400/45',
    text: 'text-orange-200',
    badgeBg: 'bg-orange-500/25 text-orange-100',
  },
  Milestone: {
    rail: '#eab308',
    dot: 'bg-yellow-400',
    cardBg: 'bg-yellow-500/15',
    cardBorder: 'border-yellow-400/45',
    text: 'text-yellow-200',
    badgeBg: 'bg-yellow-500/25 text-yellow-100',
  },
};

const DEFAULT_LANE: TimelineLaneColor = {
  rail: '#8b5cf6',
  dot: 'bg-violet-400',
  cardBg: 'bg-violet-500/15',
  cardBorder: 'border-violet-400/45',
  text: 'text-violet-200',
  badgeBg: 'bg-violet-500/25 text-violet-100',
};

export function getLaneColor(timelineName?: string): TimelineLaneColor {
  if (!timelineName) return DEFAULT_LANE;
  return LANE_COLORS[timelineName] ?? DEFAULT_LANE;
}

export function buildRailGradient(laneRails: string[]): string {
  if (laneRails.length === 0) return 'linear-gradient(90deg, #6366f1, #a855f7, #ec4899)';
  if (laneRails.length === 1) return `linear-gradient(90deg, ${laneRails[0]}, ${laneRails[0]}cc)`;
  const stops = laneRails.map((c, i) => `${c} ${(i / (laneRails.length - 1)) * 100}%`).join(', ');
  return `linear-gradient(90deg, ${stops})`;
}
