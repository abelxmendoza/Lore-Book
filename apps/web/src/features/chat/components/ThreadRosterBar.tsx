/**
 * ThreadRosterBar — the cast of this conversation.
 *
 * Chips show who is in the story (derived server-side from durable mention
 * metadata, never LLM-guessed). Pin keeps someone in scene, excluding someone
 * removes them from the chat's context ("that's a different Juan").
 */
import { useCallback, useEffect, useState } from 'react';
import { Users, Pin, X, RotateCcw } from 'lucide-react';
import {
  fetchThreadRoster,
  updateThreadRosterEntry,
  rosterEntryKey,
  type RosterEntry,
} from '../../../api/threadRoster';
import { useAuth } from '../../../lib/supabase';

const ROLE_DOT: Record<RosterEntry['role'], string> = {
  main: 'bg-primary',
  supporting: 'bg-sky-400/80',
  mentioned: 'bg-white/30',
};

const VISIBLE_CAP = 10;

export function ThreadRosterBar({
  threadId,
  messageCount,
}: {
  threadId: string | null;
  messageCount: number;
}) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);

  const load = useCallback(async () => {
    if (!threadId || !user?.id || messageCount === 0) {
      setEntries([]);
      return;
    }
    try {
      const result = await fetchThreadRoster(threadId);
      setEntries(result.entries ?? []);
    } catch {
      setEntries([]);
    }
  }, [threadId, user?.id, messageCount]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyOverride = useCallback(
    async (entry: RosterEntry, override: Parameters<typeof updateThreadRosterEntry>[2]) => {
      if (!threadId) return;
      // Optimistic update; server response is authoritative.
      setEntries((prev) =>
        prev.map((e) =>
          rosterEntryKey(e) === rosterEntryKey(entry) ? { ...e, ...override, source: 'user' } : e
        )
      );
      try {
        const result = await updateThreadRosterEntry(threadId, rosterEntryKey(entry), override);
        setEntries(result.entries ?? []);
      } catch {
        void load();
      }
    },
    [threadId, load]
  );

  const active = entries.filter((e) => e.status === 'active');
  const excluded = entries.filter((e) => e.status === 'excluded');
  if (!threadId || active.length === 0 && excluded.length === 0) return null;

  const visible = expanded ? active : active.slice(0, VISIBLE_CAP);
  const hiddenCount = active.length - visible.length;

  return (
    <div className="px-3 sm:px-4 py-1.5 border-b border-white/5" data-testid="thread-roster-bar">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-white/30 mr-1">
          <Users className="h-3 w-3" /> Cast
        </span>
        {visible.map((entry) => (
          <span
            key={rosterEntryKey(entry)}
            className="group flex items-center gap-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 pl-2 pr-1 py-0.5 text-xs text-white/70 transition-colors"
            title={[
              `${entry.role}${entry.mentions > 1 ? ` · ${entry.mentions} mentions` : ''}`,
              entry.firstSeenRef ? `first seen #${entry.firstSeenRef}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            data-testid="roster-chip"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${ROLE_DOT[entry.role]}`} />
            {entry.name}
            {entry.pinned && <Pin className="h-2.5 w-2.5 text-primary/70" />}
            <span className="hidden group-hover:flex items-center">
              {!entry.pinned && (
                <button
                  type="button"
                  onClick={() => applyOverride(entry, { pinned: true })}
                  className="p-0.5 text-white/40 hover:text-primary"
                  title="Pin to cast — always in scene"
                >
                  <Pin className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => applyOverride(entry, { status: 'excluded', pinned: false })}
                className="p-0.5 text-white/40 hover:text-red-300"
                title="Remove from this story's cast"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          </span>
        ))}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-[11px] text-white/40 hover:text-white/70 px-1"
          >
            +{hiddenCount} more
          </button>
        )}
        {excluded.length > 0 && (
          <button
            type="button"
            onClick={() => setShowExcluded((v) => !v)}
            className="text-[11px] text-white/25 hover:text-white/50 px-1 ml-auto"
            title="Excluded from this story"
          >
            {excluded.length} excluded
          </button>
        )}
      </div>
      {showExcluded && excluded.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          {excluded.map((entry) => (
            <span
              key={rosterEntryKey(entry)}
              className="flex items-center gap-1 rounded-full bg-white/3 border border-white/5 pl-2 pr-1 py-0.5 text-[11px] text-white/30 line-through"
            >
              {entry.name}
              <button
                type="button"
                onClick={() => applyOverride(entry, { status: 'active' })}
                className="p-0.5 text-white/30 hover:text-white/70 no-underline"
                title="Restore to cast"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
