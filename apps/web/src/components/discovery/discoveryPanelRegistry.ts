import type { LucideIcon } from 'lucide-react';
import {
  Heart, Brain, Users, TrendingUp, Target, Clock, MapPin,
  AlertCircle, Zap, HeartPulse, Database, ClipboardCheck, Activity,
  Ghost, CalendarDays, BarChart3, Trophy, Scale, UserCircle, Network, Eye,
  Sparkles,
} from 'lucide-react';

export type DiscoveryBadgeKey = 'pendingProposals' | 'openContradictions' | 'fadingMemories';

export type DiscoveryPanelDef = {
  id: string;
  title: string;
  shortTitle?: string;
  description: string;
  path: string;
  icon: LucideIcon;
  badgeKey?: DiscoveryBadgeKey;
  accent: string;
};

export const INSIGHT_PANELS: DiscoveryPanelDef[] = [
  { id: 'soul-profile', title: 'Soul Profile', shortTitle: 'Soul', description: 'Essence, hopes, fears, strengths, and skills.', path: '/discovery/soul-profile', icon: Heart, accent: 'from-rose-600 to-pink-700' },
  { id: 'revealed-self', title: 'Revealed Self', shortTitle: 'Revealed', description: 'What your entries reveal beyond what you say.', path: '/discovery/revealed-self', icon: Eye, accent: 'from-violet-600 to-purple-700' },
  { id: 'contradictions', title: 'Contradictions', shortTitle: 'Tension', description: 'Conflicting beliefs and story threads.', path: '/discovery/contradictions', icon: Scale, accent: 'from-orange-600 to-amber-700' },
  { id: 'identity', title: 'Identity Pulse', shortTitle: 'Identity', description: 'Identity shifts, drift, and emotional trajectory.', path: '/discovery/identity', icon: Brain, accent: 'from-violet-600 to-purple-700' },
  { id: 'relationships', title: 'Relationships', shortTitle: 'People', description: 'Network, sentiment, and attachment patterns.', path: '/discovery/relationships', icon: Users, accent: 'from-blue-600 to-cyan-700' },
  { id: 'characters', title: 'Character Analytics', shortTitle: 'Cast', description: 'Mention patterns across your cast.', path: '/discovery/characters', icon: UserCircle, accent: 'from-fuchsia-600 to-purple-700' },
  { id: 'memory-fabric', title: 'Memory Fabric', shortTitle: 'Fabric', description: 'Clusters and bridges between memories.', path: '/discovery/memory-fabric', icon: Network, accent: 'from-cyan-600 to-teal-700' },
  { id: 'insights-predictions', title: 'Insights & Predictions', shortTitle: 'Insights', description: 'Patterns, loops, and forecasts.', path: '/discovery/insights-predictions', icon: TrendingUp, accent: 'from-amber-500 to-orange-600' },
  { id: 'values-habits', title: 'Values & Habits', shortTitle: 'Values', description: 'Goals, values, and behavioral streaks.', path: '/discovery/values-habits', icon: Target, accent: 'from-emerald-600 to-teal-700' },
  { id: 'decisions', title: 'Decision Memory', shortTitle: 'Decisions', description: 'Decision snapshots with context.', path: '/discovery/decisions', icon: Clock, accent: 'from-sky-600 to-blue-700' },
  { id: 'life-arc', title: 'Recent Moments', shortTitle: 'Moments', description: 'What\'s been going on lately.', path: '/discovery/life-arc', icon: MapPin, accent: 'from-indigo-600 to-violet-700' },
  { id: 'shadow', title: 'Shadow', shortTitle: 'Shadow', description: 'Suppressed topics and inner archetypes.', path: '/discovery/shadow', icon: AlertCircle, accent: 'from-slate-600 to-zinc-700' },
  { id: 'xp', title: 'Skills & Progress', shortTitle: 'Skills', description: 'XP, levels, and skill development.', path: '/discovery/xp', icon: Zap, accent: 'from-yellow-500 to-amber-600' },
  { id: 'reactions-resilience', title: 'Reactions & Resilience', shortTitle: 'Resilience', description: 'Recovery patterns and reflection.', path: '/discovery/reactions-resilience', icon: HeartPulse, accent: 'from-pink-600 to-rose-700' },
  { id: 'activity', title: 'Activity Calendar', shortTitle: 'Activity', description: 'Journaling heatmap and streaks.', path: '/discovery/activity', icon: CalendarDays, accent: 'from-emerald-600 to-green-700' },
  { id: 'life-stats', title: 'Life Stats', shortTitle: 'Stats', description: 'Words written, peaks, and patterns.', path: '/discovery/life-stats', icon: BarChart3, accent: 'from-violet-600 to-purple-700' },
  { id: 'achievements', title: 'Achievements', shortTitle: 'Trophy', description: 'Milestones and unlocked insights.', path: '/discovery/achievements', icon: Trophy, accent: 'from-amber-500 to-yellow-600' },
];

export const DATA_CONTROL_PANELS: DiscoveryPanelDef[] = [
  { id: 'living-memory', title: 'Living Memory', shortTitle: 'Living', description: 'Use, write, and pause ambient Life Chronicle.', path: '/discovery/living-memory', icon: Sparkles, accent: 'from-amber-500 to-violet-600' },
  { id: 'memory-management', title: 'Memory Management', shortTitle: 'Memory', description: 'Time-aware, evidence-based memory.', path: '/discovery/memory-management', icon: Database, accent: 'from-purple-600 to-indigo-700' },
  { id: 'memory-review', title: 'Memory Review Queue', shortTitle: 'Review', description: 'Approve proposals before storage.', path: '/discovery/memory-review', icon: ClipboardCheck, badgeKey: 'pendingProposals', accent: 'from-amber-500 to-orange-600' },
  { id: 'continuity', title: 'Continuity Intelligence', shortTitle: 'Continuity', description: 'Conflicts, arcs, and repeating loops.', path: '/discovery/continuity', icon: Activity, accent: 'from-teal-600 to-cyan-700' },
  { id: 'correction-dashboard', title: 'Corrections & Pruning', shortTitle: 'Fixes', description: 'Corrections and deprecated knowledge.', path: '/discovery/correction-dashboard', icon: AlertCircle, badgeKey: 'openContradictions', accent: 'from-red-600 to-rose-700' },
  { id: 'truth-seeker', title: 'Truth Seeker', shortTitle: 'Truth', description: 'Guided contradiction resolution.', path: '/discovery/truth-seeker', icon: Scale, badgeKey: 'openContradictions', accent: 'from-orange-600 to-amber-700' },
  { id: 'memory-fade', title: 'Memory Fade Index', shortTitle: 'Fade', description: 'Memories slipping away.', path: '/discovery/memory-fade', icon: Ghost, badgeKey: 'fadingMemories', accent: 'from-slate-500 to-zinc-600' },
  { id: 'knowledge-records', title: 'Knowledge Records', shortTitle: 'Records', description: 'Structured knowledge audit trail.', path: '/discovery/knowledge-records', icon: Database, accent: 'from-indigo-600 to-violet-700' },
];

export const PANEL_TITLE_BY_SEGMENT: Record<string, string> = Object.fromEntries(
  [...INSIGHT_PANELS, ...DATA_CONTROL_PANELS].map((p) => [p.id, p.title]),
);
