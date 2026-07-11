/**
 * CastTrendsStrip — how your cast is changing, at the top of the Character Book.
 *
 * New faces / rising / dormant chips computed deterministically from
 * conversation-link aggregates (castTrendsService). Clicking a chip opens the
 * character. Hidden when there is nothing to report.
 */
import { useEffect, useState } from 'react';
import { Clock, Sparkles, TrendingUp } from 'lucide-react';
import { fetchCastTrends, type CastMemberActivity } from '../../api/threadRoster';
import { useAuth } from '../../lib/supabase';

function weeksSince(iso: string): number {
  return Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / (7 * 86_400_000)));
}

type Group = { key: 'newFaces' | 'rising' | 'dormant'; label: string; icon: JSX.Element; tint: string };

const GROUPS: Group[] = [
  {
    key: 'newFaces',
    label: 'New faces',
    icon: <Sparkles className="h-3 w-3" />,
    tint: 'border-primary/30 bg-primary/10 text-primary/90 hover:bg-primary/20',
  },
  {
    key: 'rising',
    label: 'Rising',
    icon: <TrendingUp className="h-3 w-3" />,
    tint: 'border-sky-400/30 bg-sky-400/10 text-sky-200/90 hover:bg-sky-400/20',
  },
  {
    key: 'dormant',
    label: 'Quiet lately',
    icon: <Clock className="h-3 w-3" />,
    tint: 'border-amber-400/25 bg-amber-400/8 text-amber-200/80 hover:bg-amber-400/15',
  },
];

export function CastTrendsStrip({
  onSelectEntity,
}: {
  /** Open the character card for a cast member (matched by entity id/name upstream). */
  onSelectEntity: (entityId: string, name: string) => void;
}) {
  const { user } = useAuth();
  const [trends, setTrends] = useState<Record<Group['key'], CastMemberActivity[]>>({
    newFaces: [],
    rising: [],
    dormant: [],
  });

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    fetchCastTrends()
      .then((res) => {
        if (cancelled) return;
        setTrends({
          newFaces: res.newFaces ?? [],
          rising: res.rising ?? [],
          dormant: res.dormant ?? [],
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const total = trends.newFaces.length + trends.rising.length + trends.dormant.length;
  if (total === 0) return null;

  return (
    <div
      className="flex items-center gap-2 flex-wrap rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2"
      data-testid="cast-trends-strip"
    >
      {GROUPS.map((group) => {
        const members = trends[group.key].slice(0, 3);
        if (members.length === 0) return null;
        return (
          <span key={group.key} className="flex items-center gap-1.5 flex-wrap">
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-white/35">
              {group.icon}
              {group.label}
            </span>
            {members.map((m) => (
              <button
                key={m.entityId}
                type="button"
                onClick={() => onSelectEntity(m.entityId, m.name)}
                className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${group.tint}`}
                title={
                  group.key === 'dormant'
                    ? `Last mentioned ${weeksSince(m.lastSeen)} week${weeksSince(m.lastSeen) === 1 ? '' : 's'} ago`
                    : `${m.totalMentions} mentions across ${m.threadCount} thread${m.threadCount === 1 ? '' : 's'}`
                }
              >
                {m.name}
              </button>
            ))}
          </span>
        );
      })}
    </div>
  );
}
