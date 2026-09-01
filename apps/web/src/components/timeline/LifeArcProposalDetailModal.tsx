import { useState } from 'react';
import { Check, Link2, Loader2, Sparkles, X } from 'lucide-react';

import type { LifeArcProposal } from '../../hooks/useLifeArcProposals';
import { TRACK_LABELS, type ArcTrack, type LifeArc } from '../../hooks/useLifeArcs';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { LoreSourceLinks } from '../common/LoreSourceLinks';

const EDITABLE_TRACKS: ArcTrack[] = ['career', 'romance', 'relationships', 'creative', 'health', 'inner'];

type Props = {
  proposal: LifeArcProposal;
  arcs: LifeArc[];
  busy?: boolean;
  onClose: () => void;
  onUpdate: (
    proposalId: string,
    patch: Partial<Pick<LifeArcProposal, 'title' | 'track' | 'arc_type' | 'start_date' | 'end_date'>>,
  ) => Promise<void>;
  onCreate: (proposal: LifeArcProposal) => void;
  onMerge: (proposal: LifeArcProposal, arcId: string) => void;
  onDismiss: (proposal: LifeArcProposal) => void;
};

export function LifeArcProposalDetailModal({
  proposal,
  arcs,
  busy = false,
  onClose,
  onUpdate,
  onCreate,
  onMerge,
  onDismiss,
}: Props) {
  const [title, setTitle] = useState(proposal.title);
  const [track, setTrack] = useState(proposal.track);
  const [startDate, setStartDate] = useState(proposal.start_date);
  const [endDate, setEndDate] = useState(proposal.end_date);
  const [mergeArcId, setMergeArcId] = useState(arcs[0]?.id ?? '');
  const [saving, setSaving] = useState(false);

  const reviewed: LifeArcProposal = {
    ...proposal,
    title: title.trim() || proposal.title,
    track,
    start_date: startDate,
    end_date: endDate,
  };

  const saveEdits = async () => {
    setSaving(true);
    try {
      await onUpdate(proposal.id, {
        title: reviewed.title,
        track: reviewed.track,
        start_date: reviewed.start_date,
        end_date: reviewed.end_date,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    await saveEdits();
    onCreate(reviewed);
  };

  const handleMerge = async () => {
    if (!mergeArcId) return;
    await saveEdits();
    onMerge(reviewed, mergeArcId);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        onClose={onClose}
        className="sm:max-w-lg border-violet-500/30 bg-gradient-to-br from-violet-950/45 via-black to-black"
      >
        <DialogHeader>
          <div className="flex min-w-0 items-start gap-3 pr-2">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-violet-400/30 bg-violet-500/15 text-violet-200">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Life arc suggestion
              </p>
              <DialogTitle className="mt-1 break-words text-xl leading-snug sm:text-2xl">
                Review before adding
              </DialogTitle>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close suggestion"
            className="h-9 w-9 min-h-9 min-w-9 shrink-0 text-white/70"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          <label className="block space-y-1.5">
            <span className="text-xs text-white/60">Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-10 w-full rounded-md border border-white/15 bg-black/40 px-3 text-sm text-white focus:border-violet-400/50 focus:outline-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1.5">
              <span className="text-xs text-white/60">Start date</span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="h-10 w-full rounded-md border border-white/15 bg-black/40 px-3 text-sm text-white focus:border-violet-400/50 focus:outline-none"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-white/60">End date</span>
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="h-10 w-full rounded-md border border-white/15 bg-black/40 px-3 text-sm text-white focus:border-violet-400/50 focus:outline-none"
              />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs text-white/60">Swimlane</span>
            <select
              value={track}
              onChange={(event) => setTrack(event.target.value as ArcTrack)}
              className="h-10 w-full rounded-md border border-white/15 bg-black/40 px-3 text-sm text-white focus:border-violet-400/50 focus:outline-none"
            >
              {EDITABLE_TRACKS.map((value) => (
                <option key={value} value={value}>{TRACK_LABELS[value]}</option>
              ))}
            </select>
          </label>

          <section className="rounded-md border border-violet-500/20 bg-violet-500/5 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-200/70">Why this arc</p>
            <p className="mt-1 text-sm leading-relaxed text-white/75">{proposal.explanation}</p>
            <p className="mt-2 text-[11px] text-white/45">
              {Math.round(proposal.confidence * 100)}% confidence · {TRACK_LABELS[proposal.track]}
            </p>
          </section>

          {proposal.evidence.length > 0 && (
            <section className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                Supporting moments ({proposal.evidence.length})
              </p>
              <ul className="mt-2 space-y-2">
                {proposal.evidence.map((item) => (
                  <li key={`${item.sourceKind}:${item.sourceId}`} className="space-y-2 border-l-2 border-violet-500/30 pl-3">
                    <div>
                      <p className="text-sm text-white/80">{item.title}</p>
                      <p className="text-[11px] text-white/40">{item.occurredAt.slice(0, 10)}</p>
                    </div>
                    <LoreSourceLinks
                      compact
                      intakeChannel={item.intakeChannel}
                      sources={item.sources}
                      entities={item.entities}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {arcs.length > 0 && (
            <section className="space-y-2 rounded-md border border-white/10 bg-white/[0.03] p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
                <Link2 className="h-3.5 w-3.5 shrink-0" />
                Merge with an existing arc
              </p>
              <p className="text-[11px] leading-snug text-white/50">
                If this suggestion belongs to a chapter you already track, fold its moments into that arc instead of creating a duplicate.
              </p>
              <select
                aria-label="Existing arc"
                value={mergeArcId}
                onChange={(event) => setMergeArcId(event.target.value)}
                className="h-10 w-full rounded-md border border-white/15 bg-black/40 px-3 text-sm text-white focus:outline-none"
              >
                {arcs.map((arc) => (
                  <option key={arc.id} value={arc.id}>{arc.title}</option>
                ))}
              </select>
            </section>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 p-4 sm:px-6">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onDismiss(reviewed)}
            disabled={busy || saving}
            className="text-white/65"
          >
            Dismiss
          </Button>
          {arcs.length > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleMerge()}
              disabled={busy || saving || !mergeArcId}
              className="border-white/15 text-white/80"
            >
              {busy || saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Merge
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy || saving}
            className="ml-auto border-white/15 text-white/80"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleCreate()}
            disabled={busy || saving || !reviewed.title}
            className="bg-violet-600 hover:bg-violet-500"
          >
            {busy || saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Create arc
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
