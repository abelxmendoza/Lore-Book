import { AlertTriangle, BookOpen, GitBranch, Layers3, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';

import type {
  KernelAssertion,
  KernelEvidenceLink,
  KernelRevisionLink,
} from '../../api/knowledgeKernel';
import { formatEpistemicPercent } from '../../lib/epistemicLabels';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';

import { AssertionAuthorBadge } from './AssertionAuthorBadge';
import { EpistemicStatusBadge } from './EpistemicStatusBadge';
import { EvidenceBalance } from './EvidenceBalance';

type InspectorTab = 'overview' | 'evidence' | 'alternatives' | 'evolution';

type Props = {
  open: boolean;
  onClose: () => void;
  assertion: KernelAssertion | null;
  evidence?: KernelEvidenceLink[];
  revisions?: KernelRevisionLink[];
  warnings?: string[];
  loading?: boolean;
};

const TABS: Array<{ id: InspectorTab; label: string; icon: typeof BookOpen }> = [
  { id: 'overview', label: 'Overview', icon: BookOpen },
  { id: 'evidence', label: 'Evidence', icon: ShieldCheck },
  { id: 'alternatives', label: 'Alternatives', icon: Layers3 },
  { id: 'evolution', label: 'Evolution', icon: GitBranch },
];

const EMPTY_EVIDENCE: KernelEvidenceLink[] = [];
const EMPTY_REVISIONS: KernelRevisionLink[] = [];
const EMPTY_WARNINGS: string[] = [];

function assertionText(assertion: KernelAssertion): string {
  if (
    assertion.object_value
    && typeof assertion.object_value === 'object'
    && 'humanReadableClaim' in assertion.object_value
  ) {
    return String((assertion.object_value as { humanReadableClaim: unknown }).humanReadableClaim);
  }
  if (typeof assertion.object_value === 'string') {
    return `${assertion.subject_label} ${assertion.predicate.replaceAll('_', ' ')} ${assertion.object_value}`;
  }
  return `${assertion.subject_label} · ${assertion.predicate.replaceAll('_', ' ')}`;
}

function metadataText(assertion: KernelAssertion, key: string): string | null {
  const value = assertion.metadata[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function metadataTextList(assertion: KernelAssertion, key: string): string[] {
  const value = assertion.metadata[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function KnowledgeInspector({
  open,
  onClose,
  assertion,
  evidence = EMPTY_EVIDENCE,
  revisions = EMPTY_REVISIONS,
  warnings = EMPTY_WARNINGS,
  loading = false,
}: Props) {
  const [tab, setTab] = useState<InspectorTab>('overview');
  const evidenceGroups = useMemo(() => ({
    supporting: evidence.filter((item) => item.relation === 'supports'),
    challenging: evidence.filter((item) => item.relation === 'challenges'),
    contextual: evidence.filter((item) => item.relation === 'contextualizes'),
    excluded: evidence.filter((item) => item.relation === 'duplicates' || item.relation === 'irrelevant'),
  }), [evidence]);
  const resolutionNote = assertion ? metadataText(assertion, 'resolutionNote') : null;
  const originalContent = assertion ? metadataText(assertion, 'originalContent') : null;
  const evolutionNotes = assertion ? metadataTextList(assertion, 'evolutionNotes') : EMPTY_WARNINGS;
  const impactOnUser = assertion ? metadataText(assertion, 'impactOnUser') : null;
  const recordedDateUnknown = assertion?.metadata.recordedDateUnknown === true;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-3xl" onClose={onClose}>
        <DialogHeader>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300/70">
              Why LoreBook shows this
            </p>
            <DialogTitle className="mt-1 text-base sm:text-xl">
              {assertion ? assertion.subject_label : 'Knowledge details'}
            </DialogTitle>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </DialogHeader>

        <div className="flex gap-1 overflow-x-auto border-b border-white/10 px-3 py-2 sm:px-5" role="tablist">
          {TABS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs transition-colors ${
                  tab === item.id ? 'bg-violet-500/20 text-violet-200' : 'text-white/45 hover:text-white/80'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? <p className="py-12 text-center text-sm text-white/45">Loading knowledge…</p> : null}
          {!loading && !assertion ? <p className="py-12 text-center text-sm text-white/45">Knowledge details are unavailable.</p> : null}

          {!loading && assertion ? (
            <div className="space-y-4">
              {warnings.length > 0 ? (
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-100/75">
                  {warnings.map((warning) => <p key={warning}>{warning}</p>)}
                </div>
              ) : null}

              {tab === 'overview' ? (
                <>
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex flex-wrap gap-2">
                      <AssertionAuthorBadge
                        actorKind={assertion.asserted_by_kind}
                        stance={assertion.epistemic_stance}
                        actorLabel={assertion.asserted_by_label}
                      />
                      <EpistemicStatusBadge status={assertion.status} />
                      <Badge variant="outline" className="border-white/10 text-[10px] text-white/50">
                        {assertion.domain.replaceAll('_', ' ')}
                      </Badge>
                    </div>
                    <p className="mt-3 text-base leading-relaxed text-white/90">{assertionText(assertion)}</p>
                    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/45">
                      <span>{assertion.certainty == null ? 'Certainty not scored' : formatEpistemicPercent(assertion.certainty)}</span>
                      <span>
                        {recordedDateUnknown
                          ? 'Recorded date unavailable'
                          : `Recorded ${new Date(assertion.recorded_at).toLocaleDateString()}`}
                      </span>
                      <span className="capitalize">{assertion.derivation_method.replaceAll('_', ' ')}</span>
                    </div>
                  </div>
                  <EvidenceBalance
                    supporting={evidenceGroups.supporting.length}
                    challenging={evidenceGroups.challenging.length}
                    contextual={evidenceGroups.contextual.length}
                  />
                  {impactOnUser ? (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-white/45">Impact on you</h3>
                      <p className="mt-2 text-sm leading-relaxed text-white/70">{impactOnUser}</p>
                    </div>
                  ) : null}
                  {assertion.sensitivity === 'high_impact' || assertion.sensitivity === 'restricted' ? (
                    <div className="flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-100/75">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
                      This is sensitive knowledge. LoreBook keeps it in review until you explicitly confirm it.
                    </div>
                  ) : null}
                </>
              ) : null}

              {tab === 'evidence' ? (
                <div className="space-y-5">
                  {([
                    ['Supporting', evidenceGroups.supporting],
                    ['Challenging', evidenceGroups.challenging],
                    ['Context consulted', evidenceGroups.contextual],
                    ['Excluded or duplicate', evidenceGroups.excluded],
                  ] as const).map(([label, items]) => (
                    <section key={label}>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-white/45">{label} · {items.length}</h3>
                      <div className="mt-2 space-y-2">
                        {items.length === 0 ? <p className="text-xs text-white/30">No linked evidence yet.</p> : null}
                        {items.map((item) => (
                          <article key={item.id} className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
                            <p className="text-xs text-white/70">{item.excerpt || item.rationale || 'Linked source passage'}</p>
                            <p className="mt-1 text-[10px] text-white/35">{item.evidence_kind.replaceAll('_', ' ')}</p>
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : null}

              {tab === 'alternatives' ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <h3 className="text-sm font-medium text-white">Competing interpretations</h3>
                  {resolutionNote ? (
                    <p className="mt-2 text-sm leading-relaxed text-white/70">{resolutionNote}</p>
                  ) : (
                    <p className="mt-2 text-xs leading-relaxed text-white/45">
                      Alternatives will appear when LoreBook has separately authored, evidence-linked hypotheses. It will not invent alternatives merely to fill this space.
                    </p>
                  )}
                </div>
              ) : null}

              {tab === 'evolution' ? (
                <div className="space-y-3">
                  {originalContent && originalContent !== assertionText(assertion) ? (
                    <article className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-xs font-medium text-white/45">Original wording</p>
                      <p className="mt-1 text-sm text-white/65">{originalContent}</p>
                    </article>
                  ) : null}
                  {evolutionNotes.map((note, index) => (
                    <article key={`${index}:${note}`} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-sm text-white/70">{note}</p>
                    </article>
                  ))}
                  {resolutionNote ? (
                    <article className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-3">
                      <p className="text-xs font-medium text-violet-200/60">Current resolution</p>
                      <p className="mt-1 text-sm text-violet-100/75">{resolutionNote}</p>
                    </article>
                  ) : null}
                  {revisions.length === 0 && evolutionNotes.length === 0 && !resolutionNote && !originalContent ? (
                    <p className="text-sm text-white/35">No revisions recorded yet.</p>
                  ) : null}
                  {revisions.map((revision) => (
                    <article key={revision.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-sm capitalize text-white/80">{revision.relation}</p>
                      {revision.rationale ? <p className="mt-1 text-xs text-white/50">{revision.rationale}</p> : null}
                      <p className="mt-1 text-[10px] text-white/30">{new Date(revision.created_at).toLocaleString()}</p>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
