import { Brain, CalendarDays, ChevronDown, FileSearch, Filter, Info, Loader2, Sparkles } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';

import {
  knowledgeApi,
  KNOWLEDGE_TYPE_LABELS,
  KNOWLEDGE_TYPE_COLORS,
  type KnowledgeClaim,
} from '../../api/knowledge';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import { filterMockSelfKnowledgeClaims, mockSelfKnowledgeClaims } from '../../mocks/selfKnowledgeClaims';
import { AssertionAuthorBadge } from '../epistemic/AssertionAuthorBadge';
import { EpistemicStatusBadge } from '../epistemic/EpistemicStatusBadge';
import { EvidenceBalance } from '../epistemic/EvidenceBalance';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

import { EvidenceInspectorModal } from './EvidenceInspectorModal';


const STATUS_OPTIONS = ['ALL', 'PENDING', 'ACTIVE', 'DORMANT', 'HISTORICAL', 'SUPERSEDED'] as const;

const statusLabel = (s: typeof STATUS_OPTIONS[number]) =>
  s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase();

const formatDate = (value: string) => new Date(value).toLocaleDateString(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const certaintyClass = (confidence: number) => {
  if (confidence >= 0.7) return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200';
  if (confidence >= 0.45) return 'border-amber-400/30 bg-amber-400/10 text-amber-200';
  return 'border-rose-400/30 bg-rose-400/10 text-rose-200';
};

export const SelfKnowledgeView = () => {
  const useMock = useShouldUseMockData();
  const [claims, setClaims] = useState<KnowledgeClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'ACTIVE' | 'DORMANT' | 'HISTORICAL' | 'SUPERSEDED' | 'ALL'>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    if (useMock) {
      setClaims(filterMockSelfKnowledgeClaims(mockSelfKnowledgeClaims, statusFilter));
      setLoading(false);
      return;
    }
    knowledgeApi.getClaims({ status: statusFilter === 'ALL' ? 'ALL' : statusFilter, include_evidence: true })
      .then(res => { if (res.success) setClaims(res.claims); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [statusFilter, useMock]);

  const allTypes = useMemo(() => {
    const types = new Set(claims.map(c => c.knowledge_type));
    return Array.from(types).sort();
  }, [claims]);

  const filtered = useMemo(() => {
    if (typeFilter === 'all') return claims;
    return claims.filter(c => c.knowledge_type === typeFilter);
  }, [claims, typeFilter]);

  const grouped = useMemo(() => {
    const groups: Record<string, KnowledgeClaim[]> = {};
    for (const c of filtered) {
      if (!groups[c.knowledge_type]) groups[c.knowledge_type] = [];
      groups[c.knowledge_type].push(c);
    }
    return groups;
  }, [filtered]);

  const refreshPatterns = async () => {
    setRefreshing(true);
    setRefreshMessage(null);
    try {
      const result = await knowledgeApi.refreshClaims();
      const refreshed = await knowledgeApi.getClaims({ status: 'ALL', include_evidence: true });
      if (refreshed.success) setClaims(refreshed.claims);
      setStatusFilter('ALL');
      setRefreshMessage(result.created > 0
        ? `LoreBook found ${result.created} new supported pattern${result.created === 1 ? '' : 's'}.`
        : result.evaluated > 0
          ? 'The scan is complete. Existing candidates did not yet have enough spread or supporting evidence to become claims.'
          : 'No repeated story patterns have reached the evidence threshold yet.');
    } catch {
      setRefreshMessage('LoreBook could not scan your story right now. Your existing memories were not changed.');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-4 min-w-0">
      {/* Header */}
      <div>
        <h3 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
          <Brain className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-400 flex-shrink-0" />
          <span className="min-w-0">Patterns LoreBook Has Noticed</span>
        </h3>
        <p className="text-xs sm:text-sm text-white/60 mt-1 leading-relaxed">
          Evidence-linked patterns and tendencies that remain open to review and correction
        </p>
      </div>

      {/* Info banner */}
      <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-3 sm:p-3.5 flex items-start gap-2">
        <Info className="h-4 w-4 text-indigo-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] sm:text-xs text-indigo-200/80 leading-relaxed">
          These are not things you told LoreBook — they are patterns it detected from your behavior, entries, and life arcs.
          Certainty reflects how much behavioral evidence supports each claim — not how strongly you stated it.
        </p>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-white/50 flex-shrink-0" />
            <span className="text-xs sm:text-sm text-white/70">Status</span>
          </div>

          {/* Mobile: native select avoids cramped pill row */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            className="sm:hidden w-full bg-black/60 border border-white/10 text-white text-sm h-9 rounded-lg px-3"
            aria-label="Filter by status"
          >
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>

          {/* Desktop / tablet: pill row */}
          <div className="hidden sm:flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  statusFilter === s
                    ? 'bg-indigo-500/30 border-indigo-500/50 text-indigo-200'
                    : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                }`}
              >
                {statusLabel(s)}
              </button>
            ))}
          </div>
        </div>

        {allTypes.length > 1 && (
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
            <span className="text-xs sm:text-sm text-white/70">Type</span>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="w-full sm:w-auto sm:min-w-[180px] bg-black/60 border border-white/10 text-white text-sm h-9 rounded-lg px-3"
              aria-label="Filter by knowledge type"
            >
              <option value="all">All types</option>
              {allTypes.map(t => (
                <option key={t} value={t}>{KNOWLEDGE_TYPE_LABELS[t] ?? t}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-indigo-400/25 bg-indigo-500/[0.05] px-4 py-10 text-center text-white/50 sm:px-8 sm:py-14">
          <Brain className="mx-auto mb-4 h-11 w-11 text-indigo-300/40" />
          <p className="mb-2 text-base font-medium text-white/80 sm:text-lg">No supported patterns are ready yet</p>
          <p className="mx-auto max-w-xl text-xs leading-relaxed sm:text-sm">
            This section only shows patterns backed by repeated evidence over time. A pattern is not created from one message, a recent burst, or an unsupported AI guess.
          </p>
          {!useMock && (
            <Button
              type="button"
              onClick={refreshPatterns}
              disabled={refreshing}
              className="mt-5 min-h-10 bg-indigo-500/20 text-indigo-100 hover:bg-indigo-500/30"
            >
              {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {refreshing ? 'Scanning your story…' : 'Scan existing story for patterns'}
            </Button>
          )}
          {refreshMessage && (
            <p className="mx-auto mt-3 max-w-lg text-[11px] leading-relaxed text-indigo-200/70 sm:text-xs" role="status">
              {refreshMessage}
            </p>
          )}
        </div>
      ) : typeFilter !== 'all' ? (
        // Flat list when filtered to one type
        <div className="space-y-2">
          {filtered.map(claim => (
            <ClaimCard
              key={claim.id}
              claim={claim}
              expanded={expandedId === claim.id}
              onToggle={() => setExpandedId(expandedId === claim.id ? null : claim.id)}
              onInspect={() => setSelectedClaimId(claim.id)}
            />
          ))}
        </div>
      ) : (
        // Grouped by type
        <div className="space-y-5">
          {Object.entries(grouped).map(([type, typeClaims]) => (
            <div key={type}>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className={`text-xs ${KNOWLEDGE_TYPE_COLORS[type] ?? 'text-white/60 border-white/20'}`}>
                  {KNOWLEDGE_TYPE_LABELS[type] ?? type}
                </Badge>
                <span className="text-xs text-white/30">{typeClaims.length} claim{typeClaims.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {typeClaims.map(claim => (
                  <ClaimCard
                    key={claim.id}
                    claim={claim}
                    expanded={expandedId === claim.id}
                    onToggle={() => setExpandedId(expandedId === claim.id ? null : claim.id)}
                    onInspect={() => setSelectedClaimId(claim.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedClaimId && (
        <EvidenceInspectorModal claimId={selectedClaimId} onClose={() => setSelectedClaimId(null)} />
      )}
    </div>
  );
};

const ClaimCard = ({
  claim,
  expanded,
  onToggle,
  onInspect,
}: {
  claim: KnowledgeClaim;
  expanded: boolean;
  onToggle: () => void;
  onInspect: () => void;
}) => {
  const pct = Math.round(claim.confidence * 100);
  const evidence = claim.evidence_links;
  const supportingCount = evidence?.filter(link => link.evidence_weight >= 0).length ?? 0;
  const challengingCount = evidence?.filter(link => link.evidence_weight < 0).length ?? 0;
  const evidenceCount = evidence?.length;
  const evidencePreview = evidence?.find(link => link.evidence_weight >= 0)?.evidence_summary
    ?? evidence?.[0]?.evidence_summary;
  const typeLabel = KNOWLEDGE_TYPE_LABELS[claim.knowledge_type] ?? claim.knowledge_type;

  return (
    <div className="group overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.03] transition-colors hover:border-indigo-400/30 hover:bg-white/[0.08]">
      <button
        type="button"
        className="block w-full p-3 text-left touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400 sm:p-4"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} claim: ${claim.human_readable_claim}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <Badge
              variant="outline"
              className={`max-w-full truncate px-1.5 py-0 text-[9px] normal-case tracking-normal sm:px-2 sm:text-[10px] ${KNOWLEDGE_TYPE_COLORS[claim.knowledge_type] ?? 'border-white/20 text-white/60'}`}
            >
              {typeLabel}
            </Badge>
            <AssertionAuthorBadge
              actorKind="lorebook"
              stance={claim.status === 'PENDING' ? 'system_hypothesis' : 'established_knowledge'}
              compact
            />
            <EpistemicStatusBadge status={claim.status} compact />
          </div>
          <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-white/35 transition-transform group-hover:text-indigo-300 ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        </div>

        <p className="mt-2 text-[13px] font-medium leading-snug text-white/90 sm:text-[15px] sm:leading-relaxed">
          {claim.human_readable_claim}
        </p>

        {evidencePreview && (
          <div className="mt-2 rounded-lg border border-white/[0.07] bg-black/20 px-2.5 py-2">
            <p className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-wide text-white/40 sm:text-[10px]">
              <Sparkles className="h-3 w-3 text-indigo-300" aria-hidden="true" /> Why it appears
            </p>
            <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-white/60 sm:text-xs">{evidencePreview}</p>
          </div>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-white/45 sm:text-[10px]">
          <span className={`rounded-full border px-1.5 py-0.5 font-medium ${certaintyClass(claim.confidence)}`}>
            {pct}% certain
          </span>
          <span className="inline-flex items-center gap-1">
            <FileSearch className="h-3 w-3" aria-hidden="true" />
            {evidenceCount === undefined
              ? 'Evidence available'
              : `${evidenceCount} evidence source${evidenceCount === 1 ? '' : 's'}`}
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3 w-3" aria-hidden="true" />
            Reinforced {formatDate(claim.last_reinforced_at)}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-white/10 px-3 pb-3 pt-3 sm:px-4 sm:pb-4" onClick={e => e.stopPropagation()}>
          <div className="grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-3 sm:text-xs">
            <div className="rounded-lg bg-white/5 p-2.5">
              <p className="mb-0.5 text-white/40">First noticed</p>
              <p className="font-medium text-white/85">{formatDate(claim.first_evidenced_at)}</p>
            </div>
            <div className="rounded-lg bg-white/5 p-2.5">
              <p className="mb-0.5 text-white/40">Evidence</p>
              <p className="font-medium text-white/85">{evidenceCount === undefined ? 'Open inspector' : evidenceCount}</p>
            </div>
            <div className="col-span-2 rounded-lg bg-white/5 p-2.5 sm:col-span-1">
              <p className="mb-0.5 text-white/40">Detection</p>
              <p className="truncate font-medium capitalize text-white/85">{claim.trigger_type.replaceAll('_', ' ')}</p>
            </div>
          </div>
          <EvidenceBalance
            supporting={supportingCount}
            challenging={challengingCount}
            unknown={evidence === undefined}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={onInspect}
            className="min-h-10 w-full border-indigo-500/30 text-xs text-indigo-300 hover:bg-indigo-500/10"
          >
            <Brain className="h-3 w-3 mr-1" />
            Why does LoreBook show this?
          </Button>
        </div>
      )}
    </div>
  );
};
