import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquareText,
  CalendarDays,
  Users,
  BookMarked,
  BookOpen,
  Compass,
  ArrowRight,
  Sparkles,
  Clock,
  Hash,
  MapPin,
  Calendar,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../lib/supabase';
import { useEntityCounts } from '../hooks/useEntityCounts';
import { fetchJson } from '../lib/api';
import { cn } from '../lib/cn';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RecentThread {
  id: string;
  title: string;
  subtitle?: string;
  updatedAt: string;
  messageCount?: number;
}

interface TotalMemories {
  total: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatCard = ({
  label,
  value,
  icon: Icon,
  color = 'purple',
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color?: 'purple' | 'pink' | 'cyan' | 'amber';
}) => {
  const colorMap = {
    purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    pink:   'text-pink-400   bg-pink-500/10   border-pink-500/20',
    cyan:   'text-cyan-400   bg-cyan-500/10   border-cyan-500/20',
    amber:  'text-amber-400  bg-amber-500/10  border-amber-500/20',
  };
  return (
    <div className={cn(
      'rounded-xl border p-4 flex items-center gap-3 transition-all hover:brightness-110',
      colorMap[color],
    )}>
      <div className={cn('rounded-lg p-2', colorMap[color])}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-white leading-none">{value ?? '—'}</p>
        <p className="text-xs text-white/50 mt-0.5">{label}</p>
      </div>
    </div>
  );
};

const QuickActionCard = ({
  label,
  description,
  icon: Icon,
  route,
  accent = 'purple',
}: {
  label: string;
  description: string;
  icon: React.ElementType;
  route: string;
  accent?: 'purple' | 'pink' | 'cyan' | 'amber' | 'green';
}) => {
  const navigate = useNavigate();
  const accentMap: Record<string, string> = {
    purple: 'border-purple-500/30 hover:border-purple-500/60 hover:bg-purple-500/10 group-hover:text-purple-400',
    pink:   'border-pink-500/30   hover:border-pink-500/60   hover:bg-pink-500/10   group-hover:text-pink-400',
    cyan:   'border-cyan-500/30   hover:border-cyan-500/60   hover:bg-cyan-500/10   group-hover:text-cyan-400',
    amber:  'border-amber-500/30  hover:border-amber-500/60  hover:bg-amber-500/10  group-hover:text-amber-400',
    green:  'border-green-500/30  hover:border-green-500/60  hover:bg-green-500/10  group-hover:text-green-400',
  };
  const iconColorMap: Record<string, string> = {
    purple: 'text-purple-400',
    pink:   'text-pink-400',
    cyan:   'text-cyan-400',
    amber:  'text-amber-400',
    green:  'text-green-400',
  };
  return (
    <button
      type="button"
      onClick={() => navigate(route)}
      className={cn(
        'group w-full rounded-xl border bg-black/30 p-4 text-left transition-all duration-200',
        accentMap[accent],
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <Icon className={cn('h-5 w-5 shrink-0', iconColorMap[accent])} />
        <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-white/50 transition-colors" />
      </div>
      <p className="text-sm font-semibold text-white">{label}</p>
      <p className="text-xs text-white/40 mt-0.5 leading-relaxed">{description}</p>
    </button>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const HomeScreen = () => {
  const { user } = useAuth();
  const counts = useEntityCounts();
  const navigate = useNavigate();
  const [recentThreads, setRecentThreads] = useState<RecentThread[]>([]);
  const [totalMemories, setTotalMemories] = useState<number | null>(null);

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    'there';

  useEffect(() => {
    fetchJson<{ threads: RecentThread[] }>('/api/chat/threads?limit=5')
      .then(data => setRecentThreads(data.threads ?? []))
      .catch(() => {});

    fetchJson<TotalMemories>('/api/admin/metrics')
      .then(data => setTotalMemories(data.total ?? null))
      .catch(() => {});
  }, []);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 md:p-8 space-y-8">

        {/* ── Greeting header ───────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-5 w-5 text-purple-400" />
              <span className="text-sm text-white/40 font-medium">
                {new Date().toLocaleDateString(undefined, {
                  weekday: 'long', month: 'long', day: 'numeric',
                })}
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white">
              {getGreeting()}, <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">{displayName}</span>
            </h1>
            <p className="text-white/50 text-sm mt-1">Your story is unfolding. Here's where things stand.</p>
          </div>
        </div>

        {/* ── Stats row ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Memories" value={totalMemories ?? '…'} icon={Hash} color="purple" />
          <StatCard label="Characters" value={counts?.characters ?? '…'} icon={Users} color="pink" />
          <StatCard label="Locations" value={counts?.locations ?? '…'} icon={MapPin} color="cyan" />
          <StatCard label="Events" value={counts?.events ?? '…'} icon={Calendar} color="amber" />
        </div>

        {/* ── Two-column: quick actions + recent threads ────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Quick actions (3/5 width on lg) */}
          <div className="lg:col-span-3 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3">
              <QuickActionCard
                label="New Chat"
                description="Start a conversation and capture what's on your mind"
                icon={MessageSquareText}
                route="/chat"
                accent="purple"
              />
              <QuickActionCard
                label="Timeline"
                description="Browse your life events in chronological order"
                icon={CalendarDays}
                route="/timeline"
                accent="cyan"
              />
              <QuickActionCard
                label="Characters"
                description="People in your story, their arcs and connections"
                icon={Users}
                route="/characters"
                accent="pink"
              />
              <QuickActionCard
                label="LoreBooks"
                description="Your personal library of chapters and moments"
                icon={BookMarked}
                route="/lorebook"
                accent="amber"
              />
              <QuickActionCard
                label="Biography"
                description="Your AI-composed autobiography, always evolving"
                icon={BookOpen}
                route="/memoir"
                accent="green"
              />
              <QuickActionCard
                label="Discovery"
                description="Patterns, insights and connections across your story"
                icon={Compass}
                route="/discovery"
                accent="purple"
              />
            </div>
          </div>

          {/* Recent threads (2/5 width on lg) */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40">Recent Conversations</h2>
              <button
                type="button"
                onClick={() => navigate('/chat')}
                className="text-xs text-purple-400 hover:text-purple-300 transition flex items-center gap-1"
              >
                All chats <ArrowRight className="h-3 w-3" />
              </button>
            </div>

            <div className="space-y-2">
              {recentThreads.length === 0 ? (
                <div className="rounded-xl border border-white/5 bg-black/30 p-6 text-center">
                  <MessageSquareText className="h-8 w-8 text-white/20 mx-auto mb-2" />
                  <p className="text-sm text-white/40">No conversations yet.</p>
                  <button
                    type="button"
                    onClick={() => navigate('/chat')}
                    className="mt-3 text-xs text-purple-400 hover:text-purple-300 transition flex items-center gap-1 mx-auto"
                  >
                    Start your first chat <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                recentThreads.map(thread => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => navigate(`/chat/${thread.id}`)}
                    className="group w-full rounded-xl border border-white/5 bg-black/30 hover:border-purple-500/30 hover:bg-purple-500/5 p-3.5 text-left transition-all duration-200"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate group-hover:text-purple-200 transition-colors">
                          {thread.title}
                        </p>
                        {thread.subtitle && (
                          <p className="text-xs text-white/40 truncate mt-0.5">{thread.subtitle}</p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-purple-400 shrink-0 mt-0.5 transition-colors" />
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                      <Clock className="h-3 w-3 text-white/25" />
                      <span className="text-xs text-white/30">{formatRelativeTime(thread.updatedAt)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Start new chat CTA */}
            <button
              type="button"
              onClick={() => navigate('/chat')}
              className="w-full rounded-xl border border-dashed border-purple-500/30 bg-purple-500/5 hover:border-purple-500/60 hover:bg-purple-500/10 p-3 text-center transition-all group"
            >
              <span className="text-sm text-purple-400 group-hover:text-purple-300 transition-colors flex items-center justify-center gap-2">
                <MessageSquareText className="h-4 w-4" />
                New conversation
              </span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
