import { useState } from 'react';
import { Home, Users, User, Plus, X, MapPin, Trash2, History, ChevronDown, ChevronUp } from 'lucide-react';

export type HouseholdMemberDTO = {
  characterId: string;
  name: string;
  householdRole: string;
  kinshipLabel?: string;
  confidence: number;
};

export type HouseholdDTO = {
  id: string;
  name: string;
  locationName?: string;
  headOfHousehold?: string;
  residents: HouseholdMemberDTO[];
  visitors: HouseholdMemberDTO[];
  residentCount: number;
  confidence: number;
};

export type HouseholdHistoryEntry =
  | {
      kind: 'stay';
      characterId: string | null;
      characterName: string;
      joinedAt: string;
      leftAt: string | null;
      joinReason: string | null;
      leaveReason: string | null;
    }
  | {
      kind: 'location';
      locationName: string;
      movedInAt: string;
      movedOutAt: string | null;
      reason: string | null;
    };

type Props = {
  households: HouseholdDTO[];
  onMemberClick?: (characterId: string, name: string) => void;
  onCreateHousehold?: (name: string, locationName?: string) => void;
  onAddMember?: (householdId: string, characterName: string, reason?: string) => void;
  onRemoveMember?: (householdId: string, characterId: string, characterName: string, reason?: string) => void;
  onMoveHousehold?: (householdId: string, newLocationName: string, reason?: string) => void;
  onDeleteHousehold?: (householdId: string, householdName: string, reason: string) => void;
  onFetchHistory?: (householdId: string) => Promise<HouseholdHistoryEntry[]>;
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function HistoryList({ entries }: { entries: HouseholdHistoryEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-xs text-white/40 py-2">No history recorded yet.</p>;
  }
  return (
    <ul className="space-y-1.5 py-1">
      {entries.map((entry, i) => {
        if (entry.kind === 'stay') {
          const span = entry.leftAt
            ? `${formatDate(entry.joinedAt)} – ${formatDate(entry.leftAt)}`
            : `${formatDate(entry.joinedAt)} – present`;
          return (
            <li key={`stay-${i}`} className="text-xs text-white/60">
              <span className="text-white/80">{entry.characterName}</span> lived here {span}
              {entry.joinReason && <span className="text-white/40"> — moved in: {entry.joinReason}</span>}
              {entry.leaveReason && <span className="text-white/40"> — moved out: {entry.leaveReason}</span>}
            </li>
          );
        }
        const span = entry.movedOutAt
          ? `${formatDate(entry.movedInAt)} – ${formatDate(entry.movedOutAt)}`
          : `${formatDate(entry.movedInAt)} – present`;
        return (
          <li key={`loc-${i}`} className="text-xs text-white/60">
            At <span className="text-white/80">{entry.locationName}</span> {span}
            {entry.reason && <span className="text-white/40"> — {entry.reason}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function MemberList({
  title,
  members,
  onMemberClick,
  onRemoveMember,
}: {
  title: string;
  members: HouseholdMemberDTO[];
  onMemberClick?: (id: string, name: string) => void;
  onRemoveMember?: (characterId: string, characterName: string) => void;
}) {
  if (!members.length) return null;
  return (
    <div>
      <p className="text-xs text-white/45 mb-1.5">{title}</p>
      <ul className="space-y-1">
        {members.map((m) => (
          <li key={m.characterId} className="flex items-center gap-1.5 group/member">
            <button
              type="button"
              onClick={() => onMemberClick?.(m.characterId, m.name)}
              className="flex items-center gap-2 text-sm text-white/80 hover:text-purple-200 transition"
            >
              <User className="h-3.5 w-3.5 text-white/30" />
              <span>{m.name}</span>
              {m.kinshipLabel && <span className="text-xs text-white/35">· {m.kinshipLabel}</span>}
            </button>
            {onRemoveMember && (
              <button
                type="button"
                onClick={() => onRemoveMember(m.characterId, m.name)}
                aria-label={`Remove ${m.name} from this household`}
                className="opacity-0 group-hover/member:opacity-100 focus:opacity-100 text-white/30 hover:text-red-300 transition"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HouseholdDirectory({
  households,
  onMemberClick,
  onCreateHousehold,
  onAddMember,
  onRemoveMember,
  onMoveHousehold,
  onDeleteHousehold,
  onFetchHistory,
}: Props) {
  const [historyByHousehold, setHistoryByHousehold] = useState<Record<string, HouseholdHistoryEntry[] | 'loading'>>({});

  const toggleHistory = async (householdId: string) => {
    if (historyByHousehold[householdId] !== undefined) {
      setHistoryByHousehold((prev) => {
        const next = { ...prev };
        delete next[householdId];
        return next;
      });
      return;
    }
    setHistoryByHousehold((prev) => ({ ...prev, [householdId]: 'loading' }));
    const entries = (await onFetchHistory?.(householdId)) ?? [];
    setHistoryByHousehold((prev) => ({ ...prev, [householdId]: entries }));
  };

  const handleAddMember = (householdId: string) => {
    const name = window.prompt('Add who to this household?');
    if (!name?.trim()) return;
    const reason = window.prompt('Why are they joining? (optional)') ?? undefined;
    onAddMember?.(householdId, name.trim(), reason?.trim() || undefined);
  };

  const handleRemoveMember = (householdId: string, characterId: string, characterName: string) => {
    if (!window.confirm(`Remove ${characterName} from this household? Their Character card and past history are kept.`)) return;
    const reason = window.prompt(`Why is ${characterName} leaving? (optional)`) ?? undefined;
    onRemoveMember?.(householdId, characterId, characterName, reason?.trim() || undefined);
  };

  const handleMove = (householdId: string) => {
    const newLocation = window.prompt('New location for this household?');
    if (!newLocation?.trim()) return;
    const reason = window.prompt('Why the move? (optional)') ?? undefined;
    onMoveHousehold?.(householdId, newLocation.trim(), reason?.trim() || undefined);
  };

  const handleDelete = (householdId: string, householdName: string) => {
    if (!window.confirm(`Delete the ${householdName} household? Its history is kept, but it won't show up in your household list anymore.`)) return;
    let reason = window.prompt('Why are you deleting this household? (required)') ?? '';
    while (!reason.trim()) {
      reason = window.prompt('A reason is required to delete a household.') ?? '';
      if (reason === null) return;
    }
    onDeleteHousehold?.(householdId, householdName, reason.trim());
  };

  const handleCreate = () => {
    const name = window.prompt('New household name?');
    if (!name?.trim()) return;
    const locationName = window.prompt('Where is it? (optional)') ?? undefined;
    onCreateHousehold?.(name.trim(), locationName?.trim() || undefined);
  };

  return (
    <div className="space-y-4">
      {onCreateHousehold && (
        <button
          type="button"
          onClick={handleCreate}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-amber-500/25 text-amber-200 hover:bg-amber-500/10 transition"
        >
          <Plus className="h-3.5 w-3.5" />
          New household
        </button>
      )}

      {households.length === 0 ? (
        <div className="text-center py-12 text-white/45 text-sm">
          <Home className="h-10 w-10 mx-auto mb-3 opacity-30" />
          Mention where people live in chat — LoreBook infers households from phrases like &quot;Abuela&apos;s house&quot;.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {households.map((h) => {
            const history = historyByHousehold[h.id];
            return (
              <article
                key={h.id}
                className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/20 to-black/40 p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-white flex items-center gap-2">
                      <Home className="h-4 w-4 text-amber-400" />
                      {h.locationName ?? h.name}
                    </h3>
                    {h.headOfHousehold && (
                      <p className="text-xs text-white/50 mt-1">
                        Head of household: <span className="text-amber-200/90">{h.headOfHousehold}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs px-2 py-1 rounded-full bg-amber-500/15 text-amber-200 border border-amber-500/25">
                      {Math.round(h.confidence * 100)}%
                    </span>
                    {onMoveHousehold && (
                      <button
                        type="button"
                        onClick={() => handleMove(h.id)}
                        aria-label="Move this household to a new location"
                        className="text-white/30 hover:text-amber-200 transition"
                      >
                        <MapPin className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {onDeleteHousehold && (
                      <button
                        type="button"
                        onClick={() => handleDelete(h.id, h.name)}
                        aria-label="Delete this household"
                        className="text-white/30 hover:text-red-300 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <MemberList
                    title="Residents"
                    members={h.residents}
                    onMemberClick={onMemberClick}
                    onRemoveMember={onRemoveMember ? (id, name) => handleRemoveMember(h.id, id, name) : undefined}
                  />
                  <MemberList
                    title="Visitors"
                    members={h.visitors}
                    onMemberClick={onMemberClick}
                    onRemoveMember={onRemoveMember ? (id, name) => handleRemoveMember(h.id, id, name) : undefined}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-white/30 flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {h.residentCount} resident{h.residentCount !== 1 ? 's' : ''}
                  </p>
                  {onAddMember && (
                    <button
                      type="button"
                      onClick={() => handleAddMember(h.id)}
                      className="flex items-center gap-1 text-[10px] text-white/45 hover:text-amber-200 transition"
                    >
                      <Plus className="h-3 w-3" />
                      Add member
                    </button>
                  )}
                </div>

                {onFetchHistory && (
                  <div className="pt-2 border-t border-white/5">
                    <button
                      type="button"
                      onClick={() => void toggleHistory(h.id)}
                      className="flex items-center gap-1.5 text-[10px] text-white/40 hover:text-white/70 transition"
                    >
                      <History className="h-3 w-3" />
                      History
                      {history !== undefined ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                    {history === 'loading' && <p className="text-xs text-white/40 py-2">Loading…</p>}
                    {Array.isArray(history) && <HistoryList entries={history} />}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
