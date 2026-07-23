import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  FileCheck2,
  Fingerprint,
  Quote,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { useMemoryReviewQueue, type MemoryProposal } from '../../hooks/useMemoryReviewQueue';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

type ProposalMeta = {
  proposal_kind?: string;
  normalized_summary?: string;
  proposed_mutation?: string;
  group_key?: string;
  group_label?: string;
  risk_reason?: string;
  sensitivity?: string;
  evidence_count?: number;
  source?: string;
  source_conversation_title?: string;
  source_message_created_at?: string | null;
  authority?: string;
};

function metadataFor(proposal: MemoryProposal): ProposalMeta {
  return (proposal.metadata ?? {}) as ProposalMeta;
}

function proposalLabel(kind?: string): string {
  if (!kind) return 'Proposed belief';
  return kind.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function RiskBadge({ proposal }: { proposal: MemoryProposal }) {
  const meta = metadataFor(proposal);
  const styles = {
    LOW: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
    MEDIUM: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
    HIGH: 'border-rose-400/25 bg-rose-400/10 text-rose-200',
  } as const;
  return (
    <Badge className={styles[proposal.risk_level] ?? styles.MEDIUM} title={meta.risk_reason}>
      {proposal.risk_level.toLowerCase()} impact
    </Badge>
  );
}

interface ProposalCardProps {
  proposal: MemoryProposal;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason?: string) => Promise<void>;
  onDefer: (id: string) => Promise<void>;
}

function ProposalCard({ proposal, onApprove, onReject, onDefer }: ProposalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<'approve' | 'reject' | 'defer' | null>(null);
  const [actionMessage, setActionMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const meta = metadataFor(proposal);
  const belief = meta.normalized_summary || proposal.claim_text;
  const confidence = Math.round(proposal.confidence * 100);

  const act = async (action: 'approve' | 'reject' | 'defer') => {
    setBusy(action);
    setActionMessage(null);
    try {
      if (action === 'approve') await onApprove(proposal.id);
      if (action === 'reject') await onReject(proposal.id, 'User rejected the proposed belief');
      if (action === 'defer') await onDefer(proposal.id);
      setActionMessage({
        kind: 'success',
        text: action === 'approve' ? 'Belief approved.' : action === 'reject' ? 'Belief rejected.' : 'Belief deferred.',
      });
    } catch (error) {
      setActionMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'The review action failed. Please try again.',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="overflow-hidden rounded-xl border border-white/10 bg-black/35">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-primary/25 bg-primary/10 text-primary">
                {proposalLabel(meta.proposal_kind)}
              </Badge>
              <RiskBadge proposal={proposal} />
              {meta.sensitivity && meta.sensitivity !== 'NORMAL' && (
                <Badge className="border-violet-400/25 bg-violet-400/10 text-violet-200">
                  {meta.sensitivity.toLowerCase()}
                </Badge>
              )}
              {meta.source === 'chatgpt_export' && (
                <Badge className="border-cyan-400/25 bg-cyan-400/10 text-cyan-200">
                  Your ChatGPT message
                </Badge>
              )}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
                What LoreBook wants to believe
              </p>
              <h4 className="mt-1 text-base font-medium leading-relaxed text-white">{belief}</h4>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(value => !value)}
            className="rounded-lg p-2 text-white/45 transition hover:bg-white/5 hover:text-white"
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide proposal evidence' : 'Show proposal evidence'}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-white/35">Confidence</p>
            <p className="mt-0.5 text-sm font-medium text-white">{confidence}% certain</p>
          </div>
          <div className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-white/35">Evidence</p>
            <p className="mt-0.5 text-sm font-medium text-white">
              {Math.max(1, Number(meta.evidence_count ?? 1))} {Number(meta.evidence_count ?? 1) === 1 ? 'passage' : 'passages'}
            </p>
          </div>
          <div className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-white/35">Impact</p>
            <p className="mt-0.5 line-clamp-2 text-sm text-white/75">{meta.risk_reason || 'Reversible memory update'}</p>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 space-y-3 border-t border-white/8 pt-4">
            <div className="flex gap-3 rounded-lg border border-primary/15 bg-primary/[0.06] p-3">
              <FileCheck2 className="mt-0.5 h-4 w-4 flex-none text-primary" />
              <div>
                <p className="text-xs font-medium text-white">Approve will</p>
                <p className="mt-0.5 text-sm leading-relaxed text-white/60">
                  {meta.proposed_mutation || `Add this belief to LoreBook: ${belief}`}
                </p>
              </div>
            </div>
            {proposal.source_excerpt && (
              <div className="flex gap-3 p-1">
                <Quote className="mt-0.5 h-4 w-4 flex-none text-white/35" />
                <div>
                  <p className="text-xs font-medium text-white/65">Source evidence</p>
                  {meta.source_conversation_title && (
                    <p className="mt-0.5 text-[11px] text-white/35">
                      ChatGPT · {meta.source_conversation_title}
                      {meta.source_message_created_at
                        ? ` · ${new Date(meta.source_message_created_at).toLocaleDateString()}`
                        : ''}
                    </p>
                  )}
                  <blockquote className="mt-1 text-sm italic leading-relaxed text-white/50">
                    “{proposal.source_excerpt}”
                  </blockquote>
                </div>
              </div>
            )}
            {proposal.affected_claim_ids?.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-amber-200/80">
                <ShieldAlert className="h-4 w-4" />
                Changes {proposal.affected_claim_ids.length} existing {proposal.affected_claim_ids.length === 1 ? 'belief' : 'beliefs'}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-white/8 bg-white/[0.02] px-4 py-3 sm:px-5">
        <Button type="button" size="sm" onClick={() => void act('approve')} disabled={busy !== null}>
          <Check className="mr-1.5 h-4 w-4" /> {busy === 'approve' ? 'Applying…' : 'Approve belief'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void act('reject')} disabled={busy !== null}>
          <X className="mr-1.5 h-4 w-4" /> {busy === 'reject' ? 'Rejecting…' : 'Not accurate'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => void act('defer')} disabled={busy !== null} className="text-white/50">
          <Clock3 className="mr-1.5 h-4 w-4" /> {busy === 'defer' ? 'Saving…' : 'Review later'}
        </Button>
        {actionMessage && (
          <p
            className={`w-full text-xs ${actionMessage.kind === 'error' ? 'text-rose-300' : 'text-emerald-300'}`}
            role={actionMessage.kind === 'error' ? 'alert' : 'status'}
            aria-live="polite"
          >
            {actionMessage.text}
          </p>
        )}
      </div>
    </article>
  );
}

type ProposalGroup = { key: string; label: string; proposals: MemoryProposal[]; evidenceCount: number };

export function MemoryReviewQueuePanel() {
  const { proposals, loading, error, refetch, approveProposal, rejectProposal, deferProposal } = useMemoryReviewQueue();
  const visibleProposals = useMemo(
    () => proposals.filter(proposal => proposal.metadata?.proposal_integrity?.valid !== false),
    [proposals]
  );

  const groups = useMemo<ProposalGroup[]>(() => {
    const grouped = new Map<string, ProposalGroup>();
    for (const proposal of visibleProposals) {
      const meta = metadataFor(proposal);
      const key = meta.group_key || proposal.entity_id || 'related-memories';
      const current = grouped.get(key) ?? {
        key,
        label: meta.group_label || 'Related memories',
        proposals: [],
        evidenceCount: 0,
      };
      current.proposals.push(proposal);
      current.evidenceCount += Math.max(1, Number(meta.evidence_count ?? 1));
      grouped.set(key, current);
    }
    return [...grouped.values()].sort((a, b) => b.proposals.length - a.proposals.length || a.label.localeCompare(b.label));
  }, [visibleProposals]);

  if (loading) {
    return <div className="py-16 text-center text-sm text-white/45">Checking proposed beliefs…</div>;
  }

  if (error) {
    return (
      <Card className="border-rose-400/25 bg-rose-400/[0.06]">
        <CardContent className="flex flex-col items-center py-10 text-center">
          <AlertTriangle className="h-8 w-8 text-rose-300" />
          <p className="mt-3 font-medium text-white">The review queue could not be verified</p>
          <p className="mt-1 text-sm text-white/50">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} className="mt-4">Try again</Button>
        </CardContent>
      </Card>
    );
  }

  if (visibleProposals.length === 0) {
    return (
      <Card className="border-emerald-400/15 bg-emerald-400/[0.04]">
        <CardContent className="flex flex-col items-center py-12 text-center">
          <CheckCircle2 className="h-9 w-9 text-emerald-300" />
          <p className="mt-3 font-medium text-white">Nothing needs your review</p>
          <p className="mt-1 max-w-md text-sm text-white/45">
            LoreBook automatically filtered commands, duplicates, incomplete relationships, and low-quality extractions.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-5" aria-labelledby="memory-review-heading">
      <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/[0.04] to-transparent p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <Fingerprint className="mt-0.5 h-5 w-5 flex-none text-primary" />
          <div>
            <h3 id="memory-review-heading" className="font-semibold text-white">Beliefs awaiting confirmation</h3>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-white/55">
              Each item is one normalized belief. Related evidence is merged, confidence and impact are separate,
              and every card explains the exact mutation before you approve it.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-white/45">
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{visibleProposals.length} beliefs</span>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{groups.length} story groups</span>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
          {groups.reduce((sum, group) => sum + group.evidenceCount, 0)} evidence passages
        </span>
      </div>

      {groups.map(group => {
        const headingId = `proposal-group-${group.key.replace(/[^a-z0-9_-]+/gi, '-')}`;
        return (
          <section key={group.key} className="space-y-3" aria-labelledby={headingId}>
            <div className="flex flex-wrap items-end justify-between gap-2 border-b border-white/8 pb-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/65">Story group</p>
                <h4 id={headingId} className="mt-0.5 text-lg font-semibold text-white">{group.label}</h4>
              </div>
              <p className="text-xs text-white/40">
                {group.proposals.length} {group.proposals.length === 1 ? 'belief' : 'beliefs'} · {group.evidenceCount} evidence passages
              </p>
            </div>
            <div className="space-y-3">
              {group.proposals.map(proposal => (
                <ProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  onApprove={approveProposal}
                  onReject={rejectProposal}
                  onDefer={deferProposal}
                />
              ))}
            </div>
          </section>
        );
      })}
    </section>
  );
}
