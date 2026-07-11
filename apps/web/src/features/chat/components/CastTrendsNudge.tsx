/**
 * CastTrendsNudge — gentle continuity nudges on the empty chat state.
 *
 * "It's been a while since Genni came up" — computed deterministically from
 * conversation link aggregates (castTrendsService), never LLM-guessed.
 * Clicking a name prefills the composer; dismissal lasts for the session.
 */
import { useEffect, useState } from 'react';
import { Clock, Sparkles, X } from 'lucide-react';
import { fetchCastTrends, type CastMemberActivity } from '../../../api/threadRoster';
import { useAuth } from '../../../lib/supabase';

function weeksSince(iso: string): number {
  return Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / (7 * 86_400_000)));
}

export function CastTrendsNudge({
  onPrefillComposer,
}: {
  onPrefillComposer?: (text: string) => void;
}) {
  const { user } = useAuth();
  const [dormant, setDormant] = useState<CastMemberActivity[]>([]);
  const [newFaces, setNewFaces] = useState<CastMemberActivity[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    fetchCastTrends()
      .then((trends) => {
        if (cancelled) return;
        setDormant(trends.dormant ?? []);
        setNewFaces(trends.newFaces ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (dismissed || (dormant.length === 0 && newFaces.length === 0)) return null;

  const topDormant = dormant.slice(0, 2);
  const topNew = newFaces.slice(0, 2);

  return (
    <div
      className="mx-auto max-w-[36rem] mt-4 rounded-xl border border-white/8 bg-white/3 px-4 py-3"
      data-testid="cast-trends-nudge"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1.5 text-sm text-white/60">
          {topDormant.map((m) => (
            <button
              key={m.entityId}
              type="button"
              onClick={() => onPrefillComposer?.(`Been thinking about ${m.name} — `)}
              className="flex items-center gap-2 hover:text-white/90 transition-colors text-left"
            >
              <Clock className="h-3.5 w-3.5 text-amber-300/60 flex-shrink-0" />
              <span>
                <span className="text-white/85">{m.name}</span> hasn&apos;t come up in{' '}
                {weeksSince(m.lastSeen)} week{weeksSince(m.lastSeen) === 1 ? '' : 's'}
              </span>
            </button>
          ))}
          {topNew.map((m) => (
            <div key={m.entityId} className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary/60 flex-shrink-0" />
              <span>
                <span className="text-white/85">{m.name}</span> is new to your story
              </span>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-1 text-white/30 hover:text-white/70 flex-shrink-0"
          aria-label="Dismiss cast nudges"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
