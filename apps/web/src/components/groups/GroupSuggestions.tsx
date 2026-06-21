// =====================================================
// GROUP SUGGESTIONS
// Purpose: Lightweight surface for group candidates awaiting review.
// Non-modal, non-blocking, dismissible.
// Shows only when occurrence_count >= 2 (threshold met).
// =====================================================

import { useState, useEffect, useMemo } from 'react';
import { useVisiblePolling } from '../../hooks/useVisiblePolling';
import { Users, X, Check, ChevronDown, ChevronUp, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useToast } from '../ui/toast';
import { fetchJson } from '../../lib/api';
import type { Organization, OrganizationMember } from '../organizations/OrganizationProfileCard';
import { deriveOrganizationProfile } from '../../lib/organizationProfile';
import {
  GROUP_TYPE_LABELS,
  groupTypeMatchesCategory,
  type OrganizationCategory,
} from '../../lib/groupTypes';
import type { GroupType, UserRelationship } from '../organizations/OrganizationProfileCard';

const ADD_TOAST_MS = 4500;
const EXIT_ANIMATION_MS = 360;

interface GroupCandidate {
  id: string;
  proposed_name?: string;
  detected_members: string[];
  suggested_group_type: GroupType;
  suggested_user_relationship: UserRelationship;
  is_public_entity: boolean;
  confidence: number;
  occurrence_count: number;
  context?: string;
  metadata?: Record<string, unknown>;
}

interface OrgOption {
  id: string;
  name: string;
}

/** A short human "why this was detected" line, from the society-mapper metadata. */
const whyText = (c: GroupCandidate): string | null => {
  const meta = c.metadata ?? {};
  const anchor = meta.anchor as string | undefined;
  const signals = Array.isArray(meta.signals) ? (meta.signals as string[]) : [];
  const aiRefined = meta.llm_resolved === true;
  let base: string | null = null;
  if (anchor === 'employer') {
    base = 'Linked through workplace / agency mentions';
  } else if (anchor === 'co_occurrence') {
    base = signals.length
      ? `Recurring co-mentions (${signals.slice(0, 3).join(', ')})`
      : 'Recurring co-mentions across your entries';
  } else if (c.occurrence_count >= 2) {
    base = `Seen together ${c.occurrence_count} times`;
  }
  if (base && aiRefined) base += ' · refined by AI';
  return base;
};

interface GroupSuggestionsProps {
  /** Called after a candidate is accepted. Receives the created organization so
   *  the parent can render its card immediately and open it in the modal. */
  onGroupCreated?: (created?: Organization) => void;
  categoryFilter?: OrganizationCategory;
  searchTerm?: string;
  demoMode?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABELS = GROUP_TYPE_LABELS;
const typeLabel = (t: GroupType): string => TYPE_LABELS[t] ?? 'Group';

const TYPE_COLORS: Record<GroupType, string> = {
  friend_group: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  band:         'bg-purple-500/20 text-purple-300 border-purple-500/30',
  scene:        'bg-pink-500/20 text-pink-300 border-pink-500/30',
  crew:         'bg-orange-500/20 text-orange-300 border-orange-500/30',
  family:       'bg-red-500/20 text-red-300 border-red-500/30',
  sports_team:  'bg-green-500/20 text-green-300 border-green-500/30',
  company:      'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  club:         'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  nonprofit:    'bg-teal-500/20 text-teal-300 border-teal-500/30',
  martial_arts: 'bg-red-600/20 text-red-300 border-red-600/30',
  collective:   'bg-violet-500/20 text-violet-300 border-violet-500/30',
  community:    'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  institution:  'bg-slate-500/20 text-slate-300 border-slate-500/30',
  public_entity:'bg-yellow-600/20 text-yellow-300 border-yellow-600/30',
  brand:        'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
  vendor:       'bg-lime-500/20 text-lime-300 border-lime-500/30',
  other:        'bg-gray-500/20 text-gray-300 border-gray-500/30',
};
const typeColor = (t: GroupType): string => TYPE_COLORS[t] ?? 'bg-gray-500/20 text-gray-300 border-gray-500/30';

const BAD_MEMBER_NAMES = new Set(['Had', 'Do', 'Did', 'Just', 'She', 'He', 'They', 'My', 'From', 'The', 'This', 'That', 'San Diego', 'Smith Rock']);
const POLLUTED_CANDIDATE_TERMS = /\b(zephyrine|zephyrne|quillborne?|quillborn|quintessa|vexworth|smith rock|san diego|of debt)\b/i;

const cleanCandidate = (candidate: GroupCandidate): GroupCandidate => ({
  ...candidate,
  detected_members: candidate.detected_members.filter(member => !BAD_MEMBER_NAMES.has(member)),
});

const isPollutedCandidate = (candidate: GroupCandidate): boolean => {
  const combined = [
    candidate.proposed_name,
    candidate.context,
    ...candidate.detected_members,
  ].filter(Boolean).join(' ');

  if (POLLUTED_CANDIDATE_TERMS.test(combined)) return true;
  if (candidate.proposed_name && /^(?:of|in|on|at|to|from|with|for)\s+/i.test(candidate.proposed_name)) return true;
  return false;
};

const buildMessage = (c: GroupCandidate): string => {
  const times = c.occurrence_count === 2 ? 'twice' : `${c.occurrence_count} times`;
  if (c.proposed_name) {
    return `You've mentioned ${c.proposed_name} ${times}.`;
  }
  if (c.detected_members.length >= 2) {
    const names = c.detected_members.slice(0, 3).join(', ');
    const extra = c.detected_members.length > 3 ? ` and ${c.detected_members.length - 3} others` : '';
    return `You've mentioned ${names}${extra} together ${times}.`;
  }
  return `A recurring ${typeLabel(c.suggested_group_type).toLowerCase()} has been detected.`;
};

/** Primary headline for a suggested group card. */
const displayGroupName = (c: GroupCandidate): string => {
  if (c.proposed_name?.trim()) return c.proposed_name.trim();
  if (c.detected_members.length >= 2) {
    return `${c.detected_members.slice(0, 2).map(m => m.split(' ')[0]).join(' & ')} ${typeLabel(c.suggested_group_type)}`.trim();
  }
  return `New ${typeLabel(c.suggested_group_type)}`;
};

const buildSubtitle = (c: GroupCandidate): string => {
  return whyText(c) ?? buildMessage(c);
};

/** Build a full Organization card from an accepted candidate, so a card can
 *  render immediately (with members + a starting profile) without a round trip. */
const candidateToOrganization = (c: GroupCandidate, id?: string): Organization => {
  const now = new Date().toISOString();
  const orgId = id ?? `org-${c.id}`;
  const members: OrganizationMember[] = c.detected_members.map((name, i) => ({
    id: `${orgId}-member-${i}`,
    character_name: name,
    status: 'active',
  }));
  const fallbackName = c.detected_members.length
    ? `${c.detected_members.slice(0, 2).map(m => m.split(' ')[0]).join(' & ')} ${typeLabel(c.suggested_group_type)}`.trim()
    : `New ${typeLabel(c.suggested_group_type)}`;
  const name = c.proposed_name ?? fallbackName;
  const profile = deriveOrganizationProfile({
    name,
    group_type: c.suggested_group_type,
    members: c.detected_members,
    context: c.context,
  });

  return {
    id: orgId,
    name,
    aliases: [],
    type: 'other',
    group_type: c.suggested_group_type,
    membership_model: c.suggested_group_type === 'family' ? 'strict' : 'fuzzy',
    user_relationship: c.suggested_user_relationship,
    is_public_entity: c.is_public_entity,
    description: c.context,
    status: 'active',
    members,
    member_count: members.length,
    usage_count: c.occurrence_count,
    confidence: c.confidence,
    last_seen: now,
    created_at: now,
    updated_at: now,
    metadata: { profile, created_from_candidate: c.id },
    profile,
  };
};

const DEMO_GROUP_CANDIDATES: GroupCandidate[] = [
  {
    id: 'demo-group-whitmore-chen',
    proposed_name: 'Whitmore-Chen Family',
    detected_members: ['Aunt Maribel', 'Nico', 'Nana Elena'],
    suggested_group_type: 'family',
    suggested_user_relationship: 'member',
    is_public_entity: false,
    confidence: 0.94,
    occurrence_count: 7,
    context: 'Aunt Maribel, Nico, and Nana Elena keep appearing together around family dinners, hallway stories, and old photos.',
  },
  {
    id: 'demo-group-code-harbor',
    proposed_name: 'Code Harbor Academy',
    detected_members: ['Adrian Patel', 'Maya', 'Leo'],
    suggested_group_type: 'community',
    suggested_user_relationship: 'alumnus',
    is_public_entity: false,
    confidence: 0.89,
    occurrence_count: 5,
    context: 'Adrian keeps showing up as a mentor connected to the bootcamp, study group, and career transition memories.',
  },
  {
    id: 'demo-group-summit',
    proposed_name: 'Summit Staffing',
    detected_members: ['Sloane', 'Quinn'],
    suggested_group_type: 'company',
    suggested_user_relationship: 'referenced',
    is_public_entity: false,
    confidence: 0.86,
    occurrence_count: 4,
    context: 'Sloane and Quinn are both tied to paperwork, background checks, and Northwind Logistics onboarding.',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export const GroupSuggestions: React.FC<GroupSuggestionsProps> = ({ onGroupCreated, categoryFilter = 'all', searchTerm = '', demoMode = false }) => {
  const { success, error, ToastContainer } = useToast({ maxVisible: 1 });
  const [candidates, setCandidates] = useState<GroupCandidate[]>(() => demoMode ? DEMO_GROUP_CANDIDATES : []);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);
  const [mergeOpenFor, setMergeOpenFor] = useState<string | null>(null);
  const [orgOptions, setOrgOptions] = useState<OrgOption[]>([]);
  const [exiting, setExiting] = useState<Set<string>>(new Set());

  const loadOrgOptions = async () => {
    if (demoMode || orgOptions.length > 0) return;
    try {
      const res = await fetchJson<{ success: boolean; organizations: OrgOption[] }>('/api/organizations');
      if (res.success) setOrgOptions(res.organizations.map(o => ({ id: o.id, name: o.name })));
    } catch {
      // Non-fatal — merge target list is optional
    }
  };

  const handleMerge = async (candidateId: string, organizationId: string) => {
    setProcessing(candidateId);
    setMergeOpenFor(null);
    try {
      if (demoMode) {
        setCandidates(prev => prev.filter(c => c.id !== candidateId));
        return;
      }
      await fetchJson(`/api/group-candidates/${candidateId}/merge`, {
        method: 'POST',
        body: JSON.stringify({ organization_id: organizationId }),
      });
      setCandidates(prev => prev.filter(c => c.id !== candidateId));
      onGroupCreated?.();
    } catch (err) {
      console.error('Failed to merge candidate:', err);
    } finally {
      setProcessing(null);
    }
  };

  useEffect(() => {
    if (demoMode) {
      setCandidates(DEMO_GROUP_CANDIDATES);
      return;
    }
    void loadCandidates();
    const onUpdated = () => void loadCandidates();
    window.addEventListener('group-candidates-updated', onUpdated);
    return () => {
      window.removeEventListener('group-candidates-updated', onUpdated);
    };
  }, [demoMode]);

  // Fallback poll — real-time updates already arrive via the event above, so a
  // 5-min visibility-gated poll is plenty (was a 60s always-on poll = 1,440
  // req/day per open tab, firing even when the tab was hidden).
  useVisiblePolling(() => void loadCandidates(), 5 * 60_000, {
    immediate: false,
    enabled: !demoMode,
  });

  const loadCandidates = async () => {
    try {
      const res = await fetchJson<{ success: boolean; candidates: GroupCandidate[] }>(
        '/api/group-candidates?status=pending'
      );
      if (res.success) setCandidates(res.candidates.map(cleanCandidate));
    } catch {
      // Non-fatal — suggestions are optional
    }
  };

  const finishAccept = async (candidateId: string, created?: Organization) => {
    if (created) {
      success(`"${created.name}" added to your Groups book.`, ADD_TOAST_MS, 'group');
    }

    setExiting(prev => new Set(prev).add(candidateId));
    await new Promise(resolve => window.setTimeout(resolve, EXIT_ANIMATION_MS));

    setCandidates(prev => prev.filter(c => c.id !== candidateId));
    onGroupCreated?.(created);
  };

  const handleAccept = async (candidateId: string) => {
    const candidate = candidates.find(c => c.id === candidateId);
    setProcessing(candidateId);
    try {
      if (demoMode) {
        const created = candidate ? candidateToOrganization(cleanCandidate(candidate)) : undefined;
        await finishAccept(candidateId, created);
        return;
      }

      const res = await fetchJson<{ success: boolean; organization_id?: string }>(
        `/api/group-candidates/${candidateId}/accept`,
        { method: 'POST', body: JSON.stringify({}) }
      );

      // Always build a local card from the candidate as the floor — it carries
      // the detected members + a profile, so a card ALWAYS renders with at least
      // the detected characters even if the backend dropped members.
      const local = candidate
        ? candidateToOrganization(cleanCandidate(candidate), res.organization_id)
        : undefined;

      let created: Organization | undefined = local;
      if (res.organization_id) {
        try {
          const full = await fetchJson<{ success: boolean; organization: Organization }>(
            `/api/organizations/${res.organization_id}`
          );
          if (full.success && full.organization) {
            const authoritative = full.organization;
            // Keep whichever member list is richer (backend may have dropped them).
            const members =
              (authoritative.members?.length ?? 0) >= (local?.members?.length ?? 0)
                ? authoritative.members ?? []
                : local?.members ?? [];
            created = {
              ...authoritative,
              members,
              member_count: members.length || authoritative.member_count,
              profile: authoritative.profile ?? authoritative.metadata?.profile ?? local?.profile,
            };
          }
        } catch {
          // ignore — keep the local build
        }
      }

      await finishAccept(candidateId, created);
    } catch (err) {
      console.error('Failed to accept candidate:', err);
      error('Could not add group. Please try again.');
      setExiting(prev => {
        const next = new Set(prev);
        next.delete(candidateId);
        return next;
      });
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (candidateId: string) => {
    setProcessing(candidateId);
    try {
      if (demoMode) {
        setCandidates(prev => prev.filter(c => c.id !== candidateId));
        return;
      }
      await fetchJson(`/api/group-candidates/${candidateId}/reject`, { method: 'POST' });
      setCandidates(prev => prev.filter(c => c.id !== candidateId));
    } catch (err) {
      console.error('Failed to reject candidate:', err);
    } finally {
      setProcessing(null);
    }
  };

  const handleDismissLocal = (candidateId: string) => {
    setDismissed(prev => new Set([...prev, candidateId]));
  };

  const visible = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return candidates
      .map(cleanCandidate)
      .filter(c => !dismissed.has(c.id))
      .filter(c => !isPollutedCandidate(c))
      .filter(c => categoryFilter === 'all' || categoryFilter === 'recent' || groupTypeMatchesCategory(c.suggested_group_type, categoryFilter))
      .filter(c => c.proposed_name || c.detected_members.length >= 2 || c.is_public_entity)
      .filter(c => {
        if (!term) return true;
        return [
          c.proposed_name,
          c.suggested_group_type,
          c.context,
          ...c.detected_members,
        ].filter(Boolean).join(' ').toLowerCase().includes(term);
      });
  }, [candidates, categoryFilter, dismissed, searchTerm]);
  if (visible.length === 0) return null;

  return (
    <>
    <div className="mx-auto w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-purple-500/35 bg-gradient-to-br from-purple-950/35 via-black/50 to-black/60">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed(v => !v)}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-2 sm:px-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-purple-300" />
          <span className="truncate text-xs sm:text-sm font-semibold text-white">
            Groups detected in your chats
          </span>
          <span className="shrink-0 rounded-full bg-purple-500/25 px-2 py-0.5 text-[10px] font-mono text-purple-200">
            {visible.length}
          </span>
          {demoMode && (
            <span className="shrink-0 rounded-full border border-yellow-500/25 bg-yellow-500/10 px-1.5 py-0.5 text-[9px] text-yellow-200">
              Demo
            </span>
          )}
        </div>
        {collapsed
          ? <ChevronDown className="h-4 w-4 shrink-0 text-white/40" />
          : <ChevronUp className="h-4 w-4 shrink-0 text-white/40" />
        }
      </button>

      {/* Candidate cards — compact horizontal bars */}
      {!collapsed && (
        <div className="px-2.5 pb-3 sm:px-3 space-y-2">
          {demoMode && (
            <p className="text-[10px] leading-relaxed text-purple-200/70 rounded-md border border-purple-500/20 bg-purple-500/5 px-2.5 py-1.5">
              LoreBook found recurring groups in sample conversations. Tap Create to add them to your Organizations book.
            </p>
          )}
          <div className="space-y-2">
          {visible.map(c => {
            const groupName = displayGroupName(c);
            const isExpanded = expanded === c.id;
            const isExiting = exiting.has(c.id);
            const isProcessing = processing === c.id;
            return (
            <article
              key={c.id}
              className={`relative rounded-lg border border-purple-400/40 bg-gradient-to-r from-purple-900/20 via-black/50 to-black/60 px-2.5 py-2 sm:px-3 sm:py-2.5 shadow-[0_0_16px_rgba(168,85,247,0.1)] transition-all ${
                isExiting ? 'animate-romantic-exit pointer-events-none' : ''
              } ${isProcessing ? 'ring-1 ring-purple-400/45 ring-offset-1 ring-offset-black/80' : ''}`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-purple-400/35 bg-purple-500/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-purple-100">
                      <Users className="h-2.5 w-2.5" />
                      New
                    </span>
                    <h3 className="truncate text-sm font-semibold text-white leading-tight">
                      {groupName}
                    </h3>
                    <button
                      type="button"
                      onClick={() => handleDismissLocal(c.id)}
                      className="ml-auto shrink-0 rounded p-0.5 text-white/25 transition-colors hover:bg-white/10 hover:text-white/55 sm:hidden"
                      title="Dismiss"
                      aria-label="Dismiss suggestion"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>

                  <p className="mt-0.5 text-[10px] sm:text-[11px] text-white/50 leading-snug line-clamp-1">
                    {buildSubtitle(c)}
                  </p>

                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <Badge variant="outline" className={`h-5 px-1.5 py-0 text-[9px] ${typeColor(c.suggested_group_type)}`}>
                      {typeLabel(c.suggested_group_type)}
                    </Badge>
                    {c.is_public_entity && (
                      <Badge variant="outline" className="h-5 border-yellow-500/30 bg-yellow-500/15 px-1.5 py-0 text-[9px] text-yellow-300">
                        Public
                      </Badge>
                    )}
                    <span className="text-[9px] text-white/30 tabular-nums">
                      {Math.round(c.confidence * 100)}%
                    </span>
                    {c.detected_members.length > 0 && (
                      <>
                        <span className="text-white/15 hidden sm:inline">·</span>
                        <span className="hidden sm:inline truncate text-[10px] text-white/45 max-w-[12rem]">
                          {c.detected_members.slice(0, 3).join(', ')}
                          {c.detected_members.length > 3 ? ` +${c.detected_members.length - 3}` : ''}
                        </span>
                      </>
                    )}
                    {(c.context || c.detected_members.length > 3) && (
                      <button
                        type="button"
                        onClick={() => setExpanded(isExpanded ? null : c.id)}
                        className="text-[9px] font-medium text-purple-300/90 hover:text-purple-200"
                      >
                        {isExpanded ? 'Less' : 'Details'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="relative flex shrink-0 items-center gap-1 sm:pl-1">
                  <Button
                    size="sm"
                    onClick={() => void handleAccept(c.id)}
                    disabled={isProcessing || isExiting}
                    className="h-7 flex-1 sm:flex-none min-w-[5.25rem] border-0 bg-purple-600 px-2.5 text-[11px] text-white hover:bg-purple-500 shadow-[0_0_12px_rgba(147,51,234,0.28)]"
                  >
                    {isProcessing ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="mr-1 h-3 w-3" />
                    )}
                    {isProcessing ? '…' : 'Create'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const next = mergeOpenFor === c.id ? null : c.id;
                      setMergeOpenFor(next);
                      if (next) void loadOrgOptions();
                    }}
                    disabled={processing === c.id}
                    className="h-7 px-2 text-[11px] border-white/12 text-white/65 hover:bg-white/5"
                  >
                    Merge
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleReject(c.id)}
                    disabled={processing === c.id}
                    className="hidden h-7 px-2 text-[11px] text-white/40 hover:text-white/65 sm:inline-flex"
                  >
                    Not now
                  </Button>
                  <button
                    type="button"
                    onClick={() => handleDismissLocal(c.id)}
                    className="hidden shrink-0 rounded p-1 text-white/25 transition-colors hover:bg-white/10 hover:text-white/55 sm:block"
                    title="Dismiss"
                    aria-label="Dismiss suggestion"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="mt-2 space-y-1.5 border-t border-white/8 pt-2">
                  {c.detected_members.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {c.detected_members.map(m => (
                        <span key={m} className="rounded border border-white/10 bg-white/[0.05] px-1.5 py-px text-[10px] text-white/70">
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                  {c.context && (
                    <p className="text-[10px] italic leading-relaxed text-white/50 line-clamp-2">
                      &ldquo;{c.context}&rdquo;
                    </p>
                  )}
                </div>
              )}

              {mergeOpenFor === c.id && (
                <div className="z-20 mt-2 w-full overflow-hidden rounded-md border border-white/10 bg-zinc-900 shadow-xl max-h-36 overflow-y-auto">
                  <p className="border-b border-white/5 px-2.5 py-1.5 text-[10px] text-white/45">
                    Merge &ldquo;{groupName}&rdquo; into…
                  </p>
                  {orgOptions.length === 0 ? (
                    <p className="px-2.5 py-1.5 text-[10px] text-white/40">No existing groups</p>
                  ) : (
                    orgOptions.map(o => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => void handleMerge(c.id, o.id)}
                        className="w-full truncate px-2.5 py-2 text-left text-[11px] text-white/80 transition-colors hover:bg-white/10"
                      >
                        {o.name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </article>
            );
          })}
          </div>
        </div>
      )}
    </div>
    <ToastContainer />
    </>
  );
};
