import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';

import { useLifeArcProposals, type LifeArcProposal } from '../../hooks/useLifeArcProposals';
import { TRACK_LABELS, type ArcTrack, type LifeArc } from '../../hooks/useLifeArcs';

const EDITABLE_TRACKS: ArcTrack[] = ['career', 'romance', 'relationships', 'creative', 'health', 'inner'];

type Props = {
  enabled: boolean;
  canonicalItemCount: number;
  arcs: LifeArc[];
  onArcsChanged: () => Promise<void>;
};

export function LifeArcProposalAwakening({ enabled, canonicalItemCount, arcs, onArcsChanged }: Props) {
  const { proposals, audit, loading, building, error, refresh, build, update, act } = useLifeArcProposals(enabled);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const suppressed = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const arc of arcs) {
      const reason = arc.bar_eligibility?.reason;
      if (reason) counts[reason] = (counts[reason] ?? 0) + 1;
    }
    return counts;
  }, [arcs]);

  if (!enabled) return null;

  const runAction = async (
    proposal: LifeArcProposal,
    action: 'create' | 'merge' | 'dismiss',
    body: Record<string, unknown> = {},
  ) => {
    setBusyId(proposal.id);
    setActionError(null);
    try {
      await act(proposal.id, action, body);
      if (action === 'create') await onArcsChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Could not ${action} suggestion`);
    } finally {
      setBusyId(null);
    }
  };

  const showBuild = !loading && proposals.length === 0 && canonicalItemCount > 0;
  const singleDayCount = (suppressed.single_day_span ?? 0) + (suppressed.occasion ?? 0);

  return (
    <section className="border-b border-white/10 bg-gradient-to-r from-indigo-500/10 via-violet-500/5 to-transparent px-3 py-3 sm:px-4" data-testid="life-arc-awakening">
      <div className="mx-auto max-w-5xl space-y-3">
        {showBuild && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-white">
                <Sparkles className="h-4 w-4 text-violet-300" />
                We found lore and can build your life arcs
              </p>
              <p className="mt-1 text-xs text-white/50">
                Review evidence-backed suggestions before anything is added to your Swimlanes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void build()}
              disabled={building}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-violet-400/35 bg-violet-500/20 px-3 py-2 text-sm font-medium text-violet-100 hover:bg-violet-500/30 disabled:opacity-50"
            >
              {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Build from my lore
            </button>
          </div>
        )}

        {proposals.length > 0 && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setReviewOpen((open) => !open)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <span>
                <span className="block text-sm font-semibold text-white">{proposals.length} arc suggestion{proposals.length === 1 ? '' : 's'} ready</span>
                <span className="mt-0.5 block text-xs text-white/45">Open each suggestion to inspect its dates and supporting moments.</span>
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-200">
                Review suggestions {reviewOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </span>
            </button>

            {reviewOpen && (
              <div className="grid gap-3 lg:grid-cols-2">
                {proposals.map((proposal) => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    arcs={arcs}
                    busy={busyId === proposal.id}
                    onUpdate={update}
                    onAction={runAction}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {(error || actionError) && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs text-red-100">
            <span>{actionError ?? error}</span>
            <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-1 font-medium">
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        )}

        {(singleDayCount > 0 || audit?.unresolvedItems) && (
          <p className="text-xs text-white/40">
            {singleDayCount > 0 ? `${singleDayCount} one-day moment${singleDayCount === 1 ? '' : 's'} remain dots instead of bars.` : ''}
            {singleDayCount > 0 && audit?.unresolvedItems ? ' ' : ''}
            {audit?.unresolvedItems ? `${audit.unresolvedItems} moment${audit.unresolvedItems === 1 ? '' : 's'} still need a reliable date.` : ''}
          </p>
        )}
      </div>
    </section>
  );
}

function ProposalCard({
  proposal,
  arcs,
  busy,
  onUpdate,
  onAction,
}: {
  proposal: LifeArcProposal;
  arcs: LifeArc[];
  busy: boolean;
  onUpdate: ReturnType<typeof useLifeArcProposals>['update'];
  onAction: (proposal: LifeArcProposal, action: 'create' | 'merge' | 'dismiss', body?: Record<string, unknown>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(proposal.title);
  const [track, setTrack] = useState(proposal.track);
  const [startDate, setStartDate] = useState(proposal.start_date);
  const [endDate, setEndDate] = useState(proposal.end_date);
  const [mergeArcId, setMergeArcId] = useState(arcs[0]?.id ?? '');

  const save = async () => {
    await onUpdate(proposal.id, { title, track, start_date: startDate, end_date: endDate });
    setEditing(false);
  };

  return (
    <article className="rounded-xl border border-white/10 bg-black/25 p-3.5 space-y-3">
      {editing ? (
        <div className="grid grid-cols-2 gap-2">
          <input aria-label="Arc title" value={title} onChange={(event) => setTitle(event.target.value)} className="col-span-2 rounded-md border border-white/15 bg-black/30 px-2.5 py-2 text-sm text-white" />
          <input aria-label="Start date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="rounded-md border border-white/15 bg-black/30 px-2 py-2 text-xs text-white" />
          <input aria-label="End date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="rounded-md border border-white/15 bg-black/30 px-2 py-2 text-xs text-white" />
          <select aria-label="Swimlane" value={track} onChange={(event) => setTrack(event.target.value as ArcTrack)} className="col-span-2 rounded-md border border-white/15 bg-black/30 px-2 py-2 text-xs text-white">
            {EDITABLE_TRACKS.map((value) => <option key={value} value={value}>{TRACK_LABELS[value]}</option>)}
          </select>
          <button type="button" onClick={() => void save()} className="col-span-2 inline-flex items-center justify-center gap-1 rounded-md bg-white/10 px-2 py-1.5 text-xs text-white hover:bg-white/15"><Check className="h-3.5 w-3.5" /> Save edits</button>
        </div>
      ) : (
        <div>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-white">{proposal.title}</h3>
              <p className="mt-0.5 text-[11px] text-violet-200/70">{TRACK_LABELS[proposal.track]} · {proposal.start_date} → {proposal.end_date}</p>
            </div>
            <button type="button" onClick={() => setEditing(true)} className="text-[11px] text-white/45 hover:text-white">Edit</button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-white/55">{proposal.explanation}</p>
        </div>
      )}

      <details className="text-xs text-white/50">
        <summary className="cursor-pointer text-white/65">{proposal.evidence.length} supporting moment{proposal.evidence.length === 1 ? '' : 's'}</summary>
        <ul className="mt-2 space-y-1.5 border-l border-white/10 pl-3">
          {proposal.evidence.map((item) => (
            <li key={`${item.sourceKind}:${item.sourceId}`}>
              <span className="text-white/70">{item.title}</span>{' '}
              <span className="text-white/35">· {item.occurredAt.slice(0, 10)}</span>
            </li>
          ))}
        </ul>
      </details>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void onAction(proposal, 'create')} className="inline-flex items-center gap-1 rounded-md bg-violet-500/25 px-2.5 py-1.5 text-xs font-medium text-violet-100 hover:bg-violet-500/35 disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Create arc
        </button>
        {arcs.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <select aria-label="Existing arc" value={mergeArcId} onChange={(event) => setMergeArcId(event.target.value)} className="rounded-md border border-white/15 bg-black/30 px-2 py-1.5 text-xs text-white">
              {arcs.map((arc) => <option key={arc.id} value={arc.id}>{arc.title}</option>)}
            </select>
            <button type="button" disabled={busy || !mergeArcId} onClick={() => void onAction(proposal, 'merge', { arc_id: mergeArcId })} className="rounded-md bg-white/10 px-2.5 py-1.5 text-xs text-white/75 hover:bg-white/15 disabled:opacity-50">Merge</button>
          </span>
        )}
        <button type="button" disabled={busy} onClick={() => void onAction(proposal, 'dismiss', { reason: 'user_dismissed' })} className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-white/45 hover:bg-white/10 hover:text-white/70 disabled:opacity-50"><X className="h-3.5 w-3.5" /> Dismiss</button>
      </div>
    </article>
  );
}
