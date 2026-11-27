import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Check,
  Copy,
  GitMerge,
  Home,
  Users,
  User,
  Plus,
  X,
  Pencil,
  Trash2,
  History,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { buildHouseholdClipboardText } from '../../lib/householdClipboard';
import { copyTextToClipboard } from '../../lib/listClipboard';

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

export type HouseholdFamilyCandidate = {
  id: string;
  name: string;
  relationLabel?: string;
};

/** Drop people who are no longer on the family tree from household rosters. */
export function filterHouseholdsToListedFamily(
  households: HouseholdDTO[],
  familyMemberIds: Iterable<string>,
): HouseholdDTO[] {
  const ids = new Set([...familyMemberIds].filter(Boolean));
  return households.map((h) => {
    const residents = h.residents.filter((m) => ids.has(m.characterId));
    const visitors = h.visitors.filter((m) => ids.has(m.characterId));
    const names = new Set([...residents, ...visitors].map((m) => m.name));
    return {
      ...h,
      residents,
      visitors,
      residentCount: residents.length,
      headOfHousehold: h.headOfHousehold && names.has(h.headOfHousehold) ? h.headOfHousehold : undefined,
    };
  });
}

type Props = {
  households: HouseholdDTO[];
  familyCandidates?: HouseholdFamilyCandidate[];
  onMemberClick?: (characterId: string, name: string) => void;
  onCreateHousehold?: (name: string, locationName?: string) => void;
  onUpdateHousehold?: (householdId: string, patch: { name?: string; locationName?: string; reason?: string }) => void;
  onAddMember?: (householdId: string, characterName: string, reason?: string, characterId?: string) => void;
  onRemoveMember?: (householdId: string, characterId: string, characterName: string, reason?: string) => void;
  onMoveHousehold?: (householdId: string, newLocationName: string, reason?: string) => void;
  onDeleteHousehold?: (householdId: string, householdName: string, reason: string) => void;
  onMergeHouseholds?: (primaryId: string, sourceId: string, reason?: string) => void;
  onFetchHistory?: (householdId: string) => Promise<HouseholdHistoryEntry[]>;
};

type Dialog =
  | { type: 'create' }
  | { type: 'edit'; household: HouseholdDTO }
  | { type: 'add'; household: HouseholdDTO }
  | { type: 'remove'; household: HouseholdDTO; member: HouseholdMemberDTO }
  | { type: 'delete'; household: HouseholdDTO }
  | { type: 'merge'; household: HouseholdDTO }
  | null;

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
  onRemoveMember?: (member: HouseholdMemberDTO) => void;
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
                onClick={() => onRemoveMember(m)}
                aria-label={`Remove ${m.name} from this household`}
                title={`Remove ${m.name} from this household`}
                className="text-white/40 hover:text-red-300 transition"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DialogShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="household-dialog-title"
        className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 mb-3">
          <h3 id="household-dialog-title" className="text-sm font-semibold text-white">
            {title}
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-white/40 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function HouseholdDirectory({
  households,
  familyCandidates = [],
  onMemberClick,
  onCreateHousehold,
  onUpdateHousehold,
  onAddMember,
  onRemoveMember,
  onMoveHousehold,
  onDeleteHousehold,
  onMergeHouseholds,
  onFetchHistory,
}: Props) {
  const [historyByHousehold, setHistoryByHousehold] = useState<Record<string, HouseholdHistoryEntry[] | 'loading'>>({});
  const [dialog, setDialog] = useState<Dialog>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const handleCopyAll = async () => {
    const text = buildHouseholdClipboardText(households, {
      title: 'Households',
      filters: ['family-only members'],
    });
    const ok = await copyTextToClipboard(text);
    if (!ok) return;
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  };

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {onCreateHousehold && (
          <button
            type="button"
            onClick={() => setDialog({ type: 'create' })}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-amber-500/25 text-amber-200 hover:bg-amber-500/10 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            New household
          </button>
        )}
        <button
          type="button"
          onClick={() => void handleCopyAll()}
          disabled={households.length === 0}
          data-testid="households-copy-all"
          title="Copy all households as plain text"
          aria-label="Copy all households"
          className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-40 disabled:pointer-events-none ${
            copied
              ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
              : 'border-white/10 text-white/55 hover:text-white hover:border-white/25'
          }`}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy all'}
        </button>
      </div>

      {households.length === 0 ? (
        <div className="text-center py-12 text-white/45 text-sm">
          <Home className="h-10 w-10 mx-auto mb-3 opacity-30" />
          Add a household, or mention where family lives in chat — only people on your family tree can be residents.
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
                    {(onUpdateHousehold || onMoveHousehold) && (
                      <button
                        type="button"
                        onClick={() => setDialog({ type: 'edit', household: h })}
                        aria-label={`Edit ${h.name}`}
                        className="text-white/30 hover:text-amber-200 transition"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {onMergeHouseholds && households.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setDialog({ type: 'merge', household: h })}
                        aria-label={`Merge ${h.name} into another household`}
                        title="Merge into another household"
                        className="text-white/30 hover:text-amber-200 transition"
                      >
                        <GitMerge className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {onDeleteHousehold && (
                      <button
                        type="button"
                        onClick={() => setDialog({ type: 'delete', household: h })}
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
                    onRemoveMember={onRemoveMember ? (member) => setDialog({ type: 'remove', household: h, member }) : undefined}
                  />
                  <MemberList
                    title="Visitors"
                    members={h.visitors}
                    onMemberClick={onMemberClick}
                    onRemoveMember={onRemoveMember ? (member) => setDialog({ type: 'remove', household: h, member }) : undefined}
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
                      onClick={() => setDialog({ type: 'add', household: h })}
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

      {dialog && (
        <HouseholdDialog
          dialog={dialog}
          households={households}
          familyCandidates={familyCandidates}
          onClose={() => setDialog(null)}
          onCreateHousehold={onCreateHousehold}
          onUpdateHousehold={onUpdateHousehold}
          onMoveHousehold={onMoveHousehold}
          onAddMember={onAddMember}
          onRemoveMember={onRemoveMember}
          onDeleteHousehold={onDeleteHousehold}
          onMergeHouseholds={onMergeHouseholds}
        />
      )}
    </div>
  );
}

function HouseholdDialog({
  dialog,
  households,
  familyCandidates,
  onClose,
  onCreateHousehold,
  onUpdateHousehold,
  onMoveHousehold,
  onAddMember,
  onRemoveMember,
  onDeleteHousehold,
  onMergeHouseholds,
}: {
  dialog: Exclude<Dialog, null>;
  households: HouseholdDTO[];
  familyCandidates: HouseholdFamilyCandidate[];
  onClose: () => void;
  onCreateHousehold?: Props['onCreateHousehold'];
  onUpdateHousehold?: Props['onUpdateHousehold'];
  onMoveHousehold?: Props['onMoveHousehold'];
  onAddMember?: Props['onAddMember'];
  onRemoveMember?: Props['onRemoveMember'];
  onDeleteHousehold?: Props['onDeleteHousehold'];
  onMergeHouseholds?: Props['onMergeHouseholds'];
}) {
  const [name, setName] = useState(dialog.type === 'create' ? '' : dialog.type === 'edit' ? dialog.household.name : '');
  const [locationName, setLocationName] = useState(
    dialog.type === 'create' ? '' : dialog.type === 'edit' ? (dialog.household.locationName ?? '') : '',
  );
  const [reason, setReason] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [mergeIntoId, setMergeIntoId] = useState(
    dialog.type === 'merge' ? households.find((h) => h.id !== dialog.household.id)?.id ?? '' : '',
  );

  const rosterIds = useMemo(() => {
    if (dialog.type !== 'add') return new Set<string>();
    return new Set([
      ...dialog.household.residents.map((m) => m.characterId),
      ...dialog.household.visitors.map((m) => m.characterId),
    ]);
  }, [dialog]);

  const addable = useMemo(() => {
    const q = query.trim().toLowerCase();
    return familyCandidates.filter((c) => {
      if (!c.id || rosterIds.has(c.id) || c.id.startsWith('__') || c.id.startsWith('head-')) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.relationLabel ?? '').toLowerCase().includes(q);
    });
  }, [familyCandidates, query, rosterIds]);

  const submitCreate = () => {
    if (!name.trim()) return;
    onCreateHousehold?.(name.trim(), locationName.trim() || undefined);
    onClose();
  };

  const submitEdit = () => {
    if (dialog.type !== 'edit') return;
    const nextName = name.trim();
    const nextLoc = locationName.trim();
    if (onUpdateHousehold) {
      onUpdateHousehold(dialog.household.id, {
        name: nextName || undefined,
        locationName: nextLoc || undefined,
        reason: reason.trim() || undefined,
      });
    } else if (nextLoc && onMoveHousehold) {
      onMoveHousehold(dialog.household.id, nextLoc, reason.trim() || undefined);
    }
    onClose();
  };

  const submitAdd = () => {
    if (dialog.type !== 'add' || !selectedId) return;
    const chosen = addable.find((c) => c.id === selectedId);
    if (!chosen) return;
    onAddMember?.(dialog.household.id, chosen.name, reason.trim() || undefined, chosen.id);
    onClose();
  };

  const submitRemove = () => {
    if (dialog.type !== 'remove') return;
    onRemoveMember?.(
      dialog.household.id,
      dialog.member.characterId,
      dialog.member.name,
      reason.trim() || undefined,
    );
    onClose();
  };

  const submitDelete = () => {
    if (dialog.type !== 'delete' || !reason.trim()) return;
    onDeleteHousehold?.(dialog.household.id, dialog.household.name, reason.trim());
    onClose();
  };

  const submitMerge = () => {
    if (dialog.type !== 'merge' || !mergeIntoId) return;
    onMergeHouseholds?.(mergeIntoId, dialog.household.id, reason.trim() || undefined);
    onClose();
  };

  if (dialog.type === 'create') {
    return (
      <DialogShell title="New household" onClose={onClose}>
        <label className="block text-xs text-white/55 mb-1">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full mb-3 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
          placeholder="Mom and Dad's house"
        />
        <label className="block text-xs text-white/55 mb-1">Location (optional)</label>
        <input
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          className="w-full mb-4 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
          placeholder="123 Maple St"
        />
        <button
          type="button"
          onClick={submitCreate}
          disabled={!name.trim()}
          className="w-full rounded-lg bg-amber-500/20 border border-amber-500/30 py-2 text-sm text-amber-100 disabled:opacity-40"
        >
          Create household
        </button>
      </DialogShell>
    );
  }

  if (dialog.type === 'edit') {
    return (
      <DialogShell title={`Edit ${dialog.household.name}`} onClose={onClose}>
        <label className="block text-xs text-white/55 mb-1">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full mb-3 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
        />
        <label className="block text-xs text-white/55 mb-1">Location</label>
        <input
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          className="w-full mb-3 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
        />
        <label className="block text-xs text-white/55 mb-1">Why the change? (optional)</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full mb-4 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
        />
        <button
          type="button"
          onClick={submitEdit}
          className="w-full rounded-lg bg-amber-500/20 border border-amber-500/30 py-2 text-sm text-amber-100"
        >
          Save
        </button>
      </DialogShell>
    );
  }

  if (dialog.type === 'add') {
    return (
      <DialogShell title={`Add a family member to ${dialog.household.locationName ?? dialog.household.name}`} onClose={onClose}>
        {familyCandidates.length === 0 ? (
          <p className="text-sm text-white/55">Households can only include people on your family tree. Add them there first.</p>
        ) : addable.length === 0 ? (
          <p className="text-sm text-white/55">Everyone in your family tree is already in this household.</p>
        ) : (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full mb-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
              placeholder="Search family…"
              aria-label="Search family members"
            />
            <ul className="max-h-48 overflow-y-auto space-y-1 mb-3">
              {addable.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left rounded-lg px-3 py-2 text-sm ${
                      selectedId === c.id
                        ? 'bg-amber-500/20 text-amber-100 border border-amber-500/30'
                        : 'text-white/80 hover:bg-white/5'
                    }`}
                  >
                    {c.name}
                    {c.relationLabel && <span className="text-white/40"> · {c.relationLabel}</span>}
                  </button>
                </li>
              ))}
            </ul>
            <label className="block text-xs text-white/55 mb-1">Why are they joining? (optional)</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full mb-4 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
            />
            <button
              type="button"
              onClick={submitAdd}
              disabled={!selectedId}
              className="w-full rounded-lg bg-amber-500/20 border border-amber-500/30 py-2 text-sm text-amber-100 disabled:opacity-40"
            >
              Add to household
            </button>
          </>
        )}
      </DialogShell>
    );
  }

  if (dialog.type === 'remove') {
    return (
      <DialogShell title={`Remove ${dialog.member.name}?`} onClose={onClose}>
        <p className="text-sm text-white/60 mb-3">
          They stay in your Character Book and family history. They just won’t be listed in this household.
        </p>
        <label className="block text-xs text-white/55 mb-1">Why are they leaving? (optional)</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full mb-4 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
        />
        <button
          type="button"
          onClick={submitRemove}
          className="w-full rounded-lg bg-red-500/15 border border-red-500/30 py-2 text-sm text-red-100"
        >
          Remove from household
        </button>
      </DialogShell>
    );
  }

  if (dialog.type === 'delete') {
    return (
      <DialogShell title={`Delete ${dialog.household.name}?`} onClose={onClose}>
        <p className="text-sm text-white/60 mb-3">History is kept. The household leaves your list.</p>
        <label className="block text-xs text-white/55 mb-1">Why are you deleting it?</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full mb-4 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
          placeholder="Required"
        />
        <button
          type="button"
          onClick={submitDelete}
          disabled={!reason.trim()}
          className="w-full rounded-lg bg-red-500/15 border border-red-500/30 py-2 text-sm text-red-100 disabled:opacity-40"
        >
          Delete household
        </button>
      </DialogShell>
    );
  }

  const others = households.filter((h) => dialog.type === 'merge' && h.id !== dialog.household.id);
  return (
    <DialogShell title={`Merge ${dialog.household.name}`} onClose={onClose}>
      <p className="text-sm text-white/60 mb-3">
        This household is absorbed into the one you pick. People already in the other house stay put.
      </p>
      <label className="block text-xs text-white/55 mb-1">Keep this household</label>
      <select
        value={mergeIntoId}
        onChange={(e) => setMergeIntoId(e.target.value)}
        className="w-full mb-3 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
      >
        {others.map((h) => (
          <option key={h.id} value={h.id}>
            {h.locationName ?? h.name}
          </option>
        ))}
      </select>
      <label className="block text-xs text-white/55 mb-1">Reason (optional)</label>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full mb-4 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
      />
      <button
        type="button"
        onClick={submitMerge}
        disabled={!mergeIntoId}
        className="w-full rounded-lg bg-amber-500/20 border border-amber-500/30 py-2 text-sm text-amber-100 disabled:opacity-40"
      >
        Merge households
      </button>
    </DialogShell>
  );
}
