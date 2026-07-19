/**
 * ThreadRosterBar — the cast of this conversation.
 *
 * Chips show who is in the story (derived server-side from durable mention
 * metadata, never LLM-guessed). Pin keeps someone in scene, excluding someone
 * removes them from the chat's context ("that's a different Juan").
 */
import { useCallback, useEffect, useState } from 'react';
import { Users, User, UserRound, Pin, X, RotateCcw, Search, Download } from 'lucide-react';
import {
  fetchThreadRoster,
  updateThreadRosterEntry,
  rosterEntryKey,
  type RosterEntry,
  type RosterActorType,
} from '../../../api/threadRoster';
import { exportCastAsMarkdown } from '../../../utils/exportCastPage';
import { downloadFile } from '../../../utils/exportConversation';
import { useAuth } from '../../../lib/supabase';

const ROLE_DOT: Record<RosterEntry['role'], string> = {
  main: 'bg-primary',
  supporting: 'bg-sky-400/80',
  mentioned: 'bg-white/30',
};

const SELF_LABELS = new Set(['you', 'also you', 'me', 'myself', 'self', 'the user', 'user']);

function isSelfRosterEntry(entry: RosterEntry): boolean {
  return SELF_LABELS.has(entry.name.trim().toLowerCase());
}

function inferActorType(entry: RosterEntry): RosterActorType {
  if (entry.actorType) return entry.actorType;
  if (entry.kind === 'group') return 'GROUP';
  if (entry.kind === 'organization') return 'ORGANIZATION';
  return 'PERSON';
}

function ActorTypeIcon({ actorType }: { actorType: RosterActorType }) {
  if (actorType === 'GROUP' || actorType === 'COMMUNITY' || actorType === 'ORGANIZATION') {
    return <Users className="h-3 w-3 text-white/35 shrink-0" aria-hidden />;
  }
  if (actorType === 'ANONYMOUS_PERSON') {
    return <UserRound className="h-3 w-3 text-white/35 shrink-0" aria-hidden />;
  }
  return <User className="h-3 w-3 text-white/35 shrink-0" aria-hidden />;
}

const ACTOR_TYPE_LABEL: Record<RosterActorType, string> = {
  PERSON: 'Person',
  GROUP: 'Group',
  ORGANIZATION: 'Organization',
  COMMUNITY: 'Community',
  ANONYMOUS_PERSON: 'Anonymous',
};

const VISIBLE_CAP = 10;

export function ThreadRosterBar({
  threadId,
  messageCount,
  threadTitle,
  onFilterByEntity,
  recentMentions = [],
}: {
  threadId: string | null;
  messageCount: number;
  threadTitle?: string;
  /** Roster chip → filter the thread list to this cast member's threads. */
  onFilterByEntity?: (entityId: string, name: string) => void;
  /** GROUP / UNRESOLVED mentions — evidence, not Cast actors. */
  recentMentions?: Array<{
    id: string;
    name: string;
    lifecycleStatus?: string;
    identityStage?: string;
    identityConfidence?: number;
  }>;
}) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [threadNumber, setThreadNumber] = useState<number | null>(null);
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
      setThreadNumber(result.threadNumber ?? null);
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

  const active = entries.filter((e) => e.status === 'active' && !isSelfRosterEntry(e));
  const excluded = entries.filter((e) => e.status === 'excluded' && !isSelfRosterEntry(e));
  if (
    !threadId ||
    (active.length === 0 && excluded.length === 0 && recentMentions.length === 0)
  ) {
    return null;
  }

  const visible = expanded ? active : active.slice(0, VISIBLE_CAP);
  const hiddenCount = active.length - visible.length;

  return (
    <div className="px-3 sm:px-4 py-1.5 border-b border-white/5" data-testid="thread-roster-bar">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-white/30 mr-1">
          <Users className="h-3 w-3" /> Actors
        </span>
        {visible.map((entry) => {
          const actorType = inferActorType(entry);
          return (
          <span
            key={rosterEntryKey(entry)}
            className="group flex items-center gap-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 pl-2 pr-1 py-0.5 text-xs text-white/70 transition-colors"
            title={[
              ACTOR_TYPE_LABEL[actorType],
              `${entry.role}${entry.mentions > 1 ? ` · ${entry.mentions} mentions` : ''}`,
              entry.firstSeenRef ? `first seen #${entry.firstSeenRef}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            data-testid="roster-chip"
            data-actor-type={actorType}
          >
            <ActorTypeIcon actorType={actorType} />
            <span className={`h-1.5 w-1.5 rounded-full ${ROLE_DOT[entry.role]}`} />
            {entry.name}
            {entry.pinned && <Pin className="h-2.5 w-2.5 text-primary/70" />}
            <span className="hidden group-hover:flex items-center">
              {onFilterByEntity && entry.entityId && (
                <button
                  type="button"
                  onClick={() => onFilterByEntity(entry.entityId!, entry.name)}
                  className="p-0.5 text-white/40 hover:text-sky-300"
                  title="Show all threads with this actor"
                >
                  <Search className="h-3 w-3" />
                </button>
              )}
              {!entry.pinned && (
                <button
                  type="button"
                  onClick={() => applyOverride(entry, { pinned: true })}
                  className="p-0.5 text-white/40 hover:text-primary"
                  title="Pin to actors — always in scene"
                >
                  <Pin className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => applyOverride(entry, { status: 'excluded', pinned: false })}
                className="p-0.5 text-white/40 hover:text-red-300"
                title="Remove from this story's actors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          </span>
          );
        })}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-[11px] text-white/40 hover:text-white/70 px-1"
          >
            +{hiddenCount} more
          </button>
        )}
        <span className="ml-auto flex items-center gap-1">
          {excluded.length > 0 && (
            <button
              type="button"
              onClick={() => setShowExcluded((v) => !v)}
              className="text-[11px] text-white/25 hover:text-white/50 px-1"
              title="Excluded from this story"
            >
              {excluded.length} excluded
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              downloadFile(
                exportCastAsMarkdown(threadTitle || 'Conversation', threadNumber, entries),
                `cast-${threadNumber != null ? `thread-${threadNumber}` : 'conversation'}.md`,
                'text/markdown'
              )
            }
            className="p-0.5 text-white/25 hover:text-white/60"
            title="Export actors page (markdown)"
          >
            <Download className="h-3 w-3" />
          </button>
        </span>
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
                title="Restore to actors"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {recentMentions.length > 0 && (
        <div
          className="flex items-center gap-1.5 flex-wrap mt-1.5 pt-1 border-t border-white/5"
          data-testid="thread-recent-mentions"
        >
          <span className="text-[10px] uppercase tracking-wide text-white/25 mr-1">
            Recent mentions
          </span>
          {recentMentions.map((m) => (
            <span
              key={m.id || m.name}
              className="rounded-full border border-dashed border-white/15 bg-white/[0.03] px-2 py-0.5 text-[11px] text-white/45"
              title={[
                m.lifecycleStatus === 'GROUP' ? 'Group mention' : 'Unresolved mention',
                m.identityStage ? `Stage: ${m.identityStage}` : null,
                m.identityConfidence != null
                  ? `Identity confidence: ${Math.round(m.identityConfidence)}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            >
              {m.name}
              {m.identityConfidence != null && (
                <span className="ml-1 text-[9px] text-white/25">
                  {Math.round(m.identityConfidence)}
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
