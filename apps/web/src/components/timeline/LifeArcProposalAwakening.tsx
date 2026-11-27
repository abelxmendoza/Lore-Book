import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronRight, ChevronUp, Copy, FileCode2, Loader2, MessageSquareText, RefreshCw, Sparkles } from 'lucide-react';

import { useAccountAuthority } from '../../hooks/useAccountAuthority';
import { useLifeArcProposals, type LifeArcProposal } from '../../hooks/useLifeArcProposals';
import { TRACK_LABELS, type LifeArc } from '../../hooks/useLifeArcs';
import {
  CHATGPT_SWIMLANES_PROMPTS,
  formatChatGptPromptForClipboard,
} from '../../lib/chatgptSwimlanesPrompts';
import {
  buildLifeArcProposalsClipboardText,
  buildLifeArcProposalsDiagnosticClipboardText,
} from '../../lib/lifeArcProposalsDiagnosticClipboard';
import { countReadyProposals } from '../../lib/lifeArcProposalReadiness';
import {
  defaultPromotionTrack,
  defaultPromotionType,
  duplicateOccasionGroups,
  multiDayOccasionCandidates,
} from '../../lib/lifeArcRepairCandidates';
import { copyTextToClipboard } from '../../lib/listClipboard';
import { LifeArcProposalDetailModal } from './LifeArcProposalDetailModal';

type Props = {
  enabled: boolean;
  canonicalItemCount: number;
  arcs: LifeArc[];
  onArcsChanged: () => Promise<void>;
  onUpdateArc?: (
    arcId: string,
    patch: Partial<Pick<LifeArc, 'title' | 'arc_type' | 'track' | 'start_date' | 'end_date' | 'is_active'>>,
  ) => Promise<LifeArc>;
  onDeleteArc?: (arcId: string) => Promise<void>;
};

export function LifeArcProposalAwakening({ enabled, canonicalItemCount, arcs, onArcsChanged, onUpdateArc, onDeleteArc }: Props) {
  const { proposals, audit, loading, building, creatingReady, error, refresh, build, createReady, update, act } = useLifeArcProposals(enabled);
  const { authority } = useAccountAuthority();
  const canCopyDiagnostics = authority?.canAccessAdmin === true;
  const [reviewOpen, setReviewOpen] = useState(false);
  const [repairsOpen, setRepairsOpen] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [openProposal, setOpenProposal] = useState<LifeArcProposal | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [repairBusyId, setRepairBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false);
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);
  const copyAllTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyDiagnosticsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyPromptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const suppressed = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const arc of arcs) {
      const reason = arc.bar_eligibility?.reason;
      if (reason) counts[reason] = (counts[reason] ?? 0) + 1;
    }
    return counts;
  }, [arcs]);
  const activeEndedArcs = useMemo(
    () => arcs.filter((arc) => arc.is_active && Boolean(arc.end_date)),
    [arcs],
  );
  const promoteCandidates = useMemo(() => multiDayOccasionCandidates(arcs), [arcs]);
  const duplicateGroups = useMemo(() => duplicateOccasionGroups(arcs), [arcs]);
  const repairCount = activeEndedArcs.length + promoteCandidates.length + duplicateGroups.length;
  const readyCount = useMemo(() => countReadyProposals(proposals), [proposals]);
  const showChatGptPrompts = canonicalItemCount > 0;

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
      // Create and merge both mutate canonical arcs (merge may promote occasions → bars).
      if (action === 'create' || action === 'merge') await onArcsChanged();
      setOpenProposal(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Could not ${action} suggestion`);
    } finally {
      setBusyId(null);
    }
  };

  const showBuild = !loading && proposals.length === 0 && canonicalItemCount > 0;
  const singleDayCount = (suppressed.single_day_span ?? 0) + (suppressed.occasion ?? 0);
  const activeProposal = openProposal
    ? proposals.find((proposal) => proposal.id === openProposal.id) ?? openProposal
    : null;

  const handleCopyAll = async () => {
    const ok = await copyTextToClipboard(buildLifeArcProposalsClipboardText(proposals));
    if (!ok) return;
    setCopiedAll(true);
    if (copyAllTimer.current) clearTimeout(copyAllTimer.current);
    copyAllTimer.current = setTimeout(() => setCopiedAll(false), 2000);
  };

  const handleCopyPrompt = async (promptId: string, text: string) => {
    const ok = await copyTextToClipboard(text);
    if (!ok) return;
    setCopiedPromptId(promptId);
    if (copyPromptTimer.current) clearTimeout(copyPromptTimer.current);
    copyPromptTimer.current = setTimeout(() => setCopiedPromptId(null), 2000);
  };

  const handleBuild = async (autoCreateReady = false) => {
    setActionError(null);
    const result = await build({ autoCreateReady });
    if (result?.autoCreated?.length) await onArcsChanged();
  };

  const handleCreateReady = async () => {
    setActionError(null);
    const result = await createReady();
    if (result?.created?.length) await onArcsChanged();
  };

  const handleCopyDiagnostics = async () => {
    const ok = await copyTextToClipboard(buildLifeArcProposalsDiagnosticClipboardText({
      proposals,
      audit,
      arcs,
      canonicalItemCount,
      suppressedArcs: suppressed,
    }));
    if (!ok) return;
    setCopiedDiagnostics(true);
    if (copyDiagnosticsTimer.current) clearTimeout(copyDiagnosticsTimer.current);
    copyDiagnosticsTimer.current = setTimeout(() => setCopiedDiagnostics(false), 2000);
  };

  const repairActiveEndConflict = async (arc: LifeArc, patch: Pick<LifeArc, 'is_active'> | Pick<LifeArc, 'end_date'>) => {
    if (!onUpdateArc) return;
    setRepairBusyId(arc.id);
    setActionError(null);
    try {
      await onUpdateArc(arc.id, patch);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update the arc');
    } finally {
      setRepairBusyId(null);
    }
  };

  const promoteOccasion = async (arc: LifeArc) => {
    if (!onUpdateArc) return;
    setRepairBusyId(arc.id);
    setActionError(null);
    try {
      await onUpdateArc(arc.id, {
        arc_type: defaultPromotionType(arc),
        track: defaultPromotionTrack(arc),
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not promote the occasion');
    } finally {
      setRepairBusyId(null);
    }
  };

  const removeDuplicate = async (arcId: string) => {
    if (!onDeleteArc) return;
    setRepairBusyId(arcId);
    setActionError(null);
    try {
      await onDeleteArc(arcId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not remove the duplicate');
    } finally {
      setRepairBusyId(null);
    }
  };

  return (
    <>
      {activeProposal && (
        <LifeArcProposalDetailModal
          proposal={activeProposal}
          arcs={arcs}
          busy={busyId === activeProposal.id}
          onClose={() => setOpenProposal(null)}
          onUpdate={update}
          onCreate={(proposal) => void runAction(proposal, 'create')}
          onMerge={(proposal, arcId) => void runAction(proposal, 'merge', { arc_id: arcId })}
          onDismiss={(proposal) => void runAction(proposal, 'dismiss', { reason: 'user_dismissed' })}
        />
      )}

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
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                <button
                  type="button"
                  onClick={() => void handleBuild(false)}
                  disabled={building}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-violet-400/35 bg-violet-500/20 px-3 py-2 text-sm font-medium text-violet-100 hover:bg-violet-500/30 disabled:opacity-50"
                >
                  {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Build from my lore
                </button>
                <button
                  type="button"
                  onClick={() => void handleBuild(true)}
                  disabled={building}
                  data-testid="life-arc-build-auto"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50"
                >
                  {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Build & create ready bars
                </button>
              </div>
            </div>
          )}

          {proposals.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setReviewOpen((open) => !open)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                >
                  <span>
                    <span className="block text-sm font-semibold text-white">{proposals.length} arc suggestion{proposals.length === 1 ? '' : 's'} ready</span>
                    <span className="mt-0.5 block text-xs text-white/45">Tap a suggestion to review dates, evidence, and actions.</span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-violet-200">
                    Review suggestions {reviewOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </span>
                </button>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {readyCount > 0 && (
                    <button
                      type="button"
                      onClick={() => void handleCreateReady()}
                      disabled={creatingReady}
                      data-testid="life-arc-create-ready"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50"
                    >
                      {creatingReady ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      Create {readyCount} ready bar{readyCount === 1 ? '' : 's'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleCopyAll()}
                    title="Copy every suggestion as plain text"
                    aria-label="Copy all arc suggestions"
                    data-testid="life-arc-copy-all"
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      copiedAll
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                        : 'border-white/10 text-white/60 hover:border-white/25 hover:text-white'
                    }`}
                  >
                    {copiedAll ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedAll ? 'Copied' : 'Copy all'}
                  </button>
                  {canCopyDiagnostics && (
                    <button
                      type="button"
                      onClick={() => void handleCopyDiagnostics()}
                      title="Copy admin diagnostic dump: proposal ids, fingerprints, audit counts, evidence sources"
                      aria-label="Copy arc suggestion diagnostics"
                      data-testid="life-arc-copy-diagnostics"
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        copiedDiagnostics
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                          : 'border-white/10 text-white/60 hover:border-white/25 hover:text-white'
                      }`}
                    >
                      {copiedDiagnostics ? <Check className="h-3.5 w-3.5" /> : <FileCode2 className="h-3.5 w-3.5" />}
                      {copiedDiagnostics ? 'Copied' : 'Diagnostics'}
                    </button>
                  )}
                </div>
              </div>

              {reviewOpen && (
                <div className="grid gap-3 lg:grid-cols-2">
                  {proposals.map((proposal) => (
                    <ProposalCard
                      key={proposal.id}
                      proposal={proposal}
                      busy={busyId === proposal.id}
                      onOpen={() => setOpenProposal(proposal)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {(onUpdateArc || onDeleteArc) && repairCount > 0 && (
            <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-3">
              <button
                type="button"
                onClick={() => setRepairsOpen((open) => !open)}
                className="flex w-full items-center justify-between gap-3 text-left"
                aria-expanded={repairsOpen}
              >
                <span className="flex min-w-0 items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <span>
                    <span className="block text-sm font-semibold text-amber-100">
                      {repairCount} arc repair{repairCount === 1 ? '' : 's'} need a decision
                    </span>
                    <span className="mt-0.5 block text-xs text-amber-100/55">
                      Promote misclassified chapters, clear active/ended conflicts, or remove duplicate occasions.
                    </span>
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-amber-200">
                  Review repairs {repairsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </span>
              </button>

              {repairsOpen && (
                <div className="mt-3 space-y-3">
                  {onUpdateArc && activeEndedArcs.length > 0 && (
                    <div>
                      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-amber-100/50">
                        Active but ended ({activeEndedArcs.length})
                      </p>
                      <ul className="space-y-2">
                        {activeEndedArcs.map((arc) => {
                          const busy = repairBusyId === arc.id;
                          return (
                            <li key={arc.id} className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/20 p-2.5 sm:flex-row sm:items-center sm:justify-between">
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-white/85">{arc.title || 'Untitled arc'}</span>
                                <span className="block text-[11px] text-white/45">Ended {arc.end_date}</span>
                              </span>
                              <span className="flex shrink-0 flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void repairActiveEndConflict(arc, { is_active: false })}
                                  className="rounded-md border border-white/15 px-2.5 py-1.5 text-xs text-white/75 hover:bg-white/10 disabled:opacity-50"
                                >
                                  Mark ended
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void repairActiveEndConflict(arc, { end_date: null })}
                                  className="inline-flex items-center gap-1 rounded-md border border-amber-400/25 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-100 hover:bg-amber-500/15 disabled:opacity-50"
                                >
                                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                  Keep active
                                </button>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {onUpdateArc && promoteCandidates.length > 0 && (
                    <div>
                      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-amber-100/50">
                        Multi-day occasions ({promoteCandidates.length})
                      </p>
                      <ul className="space-y-2">
                        {promoteCandidates.map((arc) => {
                          const busy = repairBusyId === arc.id;
                          return (
                            <li key={arc.id} className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/20 p-2.5 sm:flex-row sm:items-center sm:justify-between">
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-white/85">{arc.title || 'Untitled arc'}</span>
                                <span className="block text-[11px] text-white/45">
                                  {arc.start_date} → {arc.end_date ?? arc.start_date} · currently suppressed as an occasion
                                </span>
                              </span>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void promoteOccasion(arc)}
                                className="inline-flex items-center gap-1 rounded-md border border-amber-400/25 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-100 hover:bg-amber-500/15 disabled:opacity-50"
                              >
                                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                Promote to arc
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {onDeleteArc && duplicateGroups.length > 0 && (
                    <div>
                      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-amber-100/50">
                        Duplicate occasions ({duplicateGroups.length} group{duplicateGroups.length === 1 ? '' : 's'})
                      </p>
                      <ul className="space-y-2">
                        {duplicateGroups.map((group) => (
                          <li key={group.key} className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                            <p className="text-sm font-medium text-white/85">
                              {group.title} · {group.day}
                            </p>
                            <p className="mt-0.5 text-[11px] text-white/45">
                              {group.arcs.length} copies — keep one, remove the extras.
                            </p>
                            <ul className="mt-2 space-y-1.5">
                              {group.arcs.map((arc, index) => {
                                const busy = repairBusyId === arc.id;
                                return (
                                  <li key={arc.id} className="flex items-center justify-between gap-2 text-xs text-white/65">
                                    <span className="truncate">{index === 0 ? 'Keep' : 'Extra'} · {arc.id.slice(0, 8)}</span>
                                    {index > 0 && (
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => void removeDuplicate(arc.id)}
                                        className="rounded-md border border-white/15 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10 disabled:opacity-50"
                                      >
                                        {busy ? 'Removing…' : 'Remove'}
                                      </button>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {showChatGptPrompts && (
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <button
                type="button"
                onClick={() => setPromptsOpen((open) => !open)}
                className="flex w-full items-center justify-between gap-3 text-left"
                aria-expanded={promptsOpen}
                data-testid="life-arc-chatgpt-prompts"
              >
                <span className="flex min-w-0 items-start gap-2">
                  <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                  <span>
                    <span className="block text-sm font-semibold text-white">Using ChatGPT for lore?</span>
                    <span className="mt-0.5 block text-xs text-white/45">
                      Copy a prompt that asks for dated chapters LoreBook can ingest into swimlanes.
                    </span>
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-sky-200">
                  Prompts {promptsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </span>
              </button>

              {promptsOpen && (
                <ul className="mt-3 space-y-2">
                  {CHATGPT_SWIMLANES_PROMPTS.map((prompt) => (
                    <li key={prompt.id} className="rounded-lg border border-white/10 bg-black/25 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white/90">{prompt.title}</p>
                          <p className="mt-0.5 text-[11px] text-white/45">{prompt.summary}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleCopyPrompt(prompt.id, formatChatGptPromptForClipboard(prompt))}
                          className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium ${
                            copiedPromptId === prompt.id
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                              : 'border-white/15 text-white/70 hover:bg-white/10'
                          }`}
                        >
                          {copiedPromptId === prompt.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          {copiedPromptId === prompt.id ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
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
    </>
  );
}

function ProposalCard({
  proposal,
  busy,
  onOpen,
}: {
  proposal: LifeArcProposal;
  busy: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={busy}
      aria-label={`Open ${proposal.title} suggestion`}
      className="rounded-xl border border-white/10 bg-black/25 p-3.5 text-left transition-colors hover:border-violet-400/30 hover:bg-black/35 disabled:opacity-50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">{proposal.title}</h3>
          <p className="mt-0.5 text-[11px] text-violet-200/70">
            {TRACK_LABELS[proposal.track]} · {proposal.start_date} → {proposal.end_date}
          </p>
        </div>
        {busy ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-200" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-white/35" />
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-white/55">{proposal.explanation}</p>
      <p className="mt-2 text-[11px] text-white/40">
        {proposal.evidence.length} supporting moment{proposal.evidence.length === 1 ? '' : 's'} · {Math.round(proposal.confidence * 100)}% confidence
      </p>
    </button>
  );
}
