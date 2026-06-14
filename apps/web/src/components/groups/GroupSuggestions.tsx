// =====================================================
// GROUP SUGGESTIONS
// Purpose: Lightweight surface for group candidates awaiting review.
// Non-modal, non-blocking, dismissible.
// Shows only when occurrence_count >= 2 (threshold met).
// =====================================================

import { useState, useEffect, useMemo } from 'react';
import { Users, X, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { fetchJson } from '../../lib/api';
import type { Organization, OrganizationMember } from '../organizations/OrganizationProfileCard';
import { deriveOrganizationProfile } from '../../lib/organizationProfile';

// ── Types ─────────────────────────────────────────────────────────────────────

type GroupType =
  | 'friend_group' | 'band' | 'sports_team' | 'company' | 'club' | 'nonprofit'
  | 'family' | 'martial_arts' | 'scene' | 'crew' | 'collective'
  | 'community' | 'institution' | 'public_entity' | 'other';

type UserRelationship =
  | 'founder' | 'leader' | 'member' | 'former_member' | 'collaborator'
  | 'adjacent' | 'fan' | 'aware_of' | 'referenced' | 'alumnus';

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
  categoryFilter?: string;
  searchTerm?: string;
  demoMode?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<GroupType, string> = {
  friend_group: 'Friend Group', band: 'Band', sports_team: 'Sports Team',
  company: 'Company', club: 'Club', nonprofit: 'Nonprofit',
  family: 'Family', martial_arts: 'Martial Arts', scene: 'Scene',
  crew: 'Crew', collective: 'Collective', community: 'Community', institution: 'Institution',
  public_entity: 'Public Entity', other: 'Group',
};
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
  other:        'bg-gray-500/20 text-gray-300 border-gray-500/30',
};
const typeColor = (t: GroupType): string => TYPE_COLORS[t] ?? 'bg-gray-500/20 text-gray-300 border-gray-500/30';

const CATEGORY_TYPES: Record<string, GroupType[]> = {
  crews: ['friend_group', 'crew'],
  bands: ['band'],
  scenes: ['scene'],
  communities: ['community'],
  companies: ['company'],
  clubs: ['club', 'collective'],
  nonprofits: ['nonprofit'],
  sports_teams: ['sports_team', 'martial_arts'],
  family: ['family'],
  public_entities: ['public_entity', 'institution'],
};

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
    id: 'demo-group-ashford-luna',
    proposed_name: 'Ashford-Luna Family',
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
    detected_members: ['Adrian Patel', 'Maya', 'Reese'],
    suggested_group_type: 'community',
    suggested_user_relationship: 'alumnus',
    is_public_entity: false,
    confidence: 0.89,
    occurrence_count: 5,
    context: 'Adrian keeps showing up as a mentor connected to the bootcamp, study group, and career transition memories.',
  },
  {
    id: 'demo-group-brighthire',
    proposed_name: 'BrightHire Staffing',
    detected_members: ['Dana', 'Reese'],
    suggested_group_type: 'company',
    suggested_user_relationship: 'referenced',
    is_public_entity: false,
    confidence: 0.86,
    occurrence_count: 4,
    context: 'Dana and Reese are both tied to paperwork, background checks, and Northstar Logistics onboarding.',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export const GroupSuggestions: React.FC<GroupSuggestionsProps> = ({ onGroupCreated, categoryFilter = 'all', searchTerm = '', demoMode = false }) => {
  const [candidates, setCandidates] = useState<GroupCandidate[]>(() => demoMode ? DEMO_GROUP_CANDIDATES : []);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);
  const [mergeOpenFor, setMergeOpenFor] = useState<string | null>(null);
  const [orgOptions, setOrgOptions] = useState<OrgOption[]>([]);

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
    const interval = setInterval(() => void loadCandidates(), 60_000);
    const onUpdated = () => void loadCandidates();
    window.addEventListener('group-candidates-updated', onUpdated);
    return () => {
      clearInterval(interval);
      window.removeEventListener('group-candidates-updated', onUpdated);
    };
  }, [demoMode]);

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

  const handleAccept = async (candidateId: string) => {
    const candidate = candidates.find(c => c.id === candidateId);
    setProcessing(candidateId);
    try {
      if (demoMode) {
        const created = candidate ? candidateToOrganization(cleanCandidate(candidate)) : undefined;
        setCandidates(prev => prev.filter(c => c.id !== candidateId));
        onGroupCreated?.(created);
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

      setCandidates(prev => prev.filter(c => c.id !== candidateId));
      onGroupCreated?.(created);
    } catch (err) {
      console.error('Failed to accept candidate:', err);
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
    const allowedTypes = CATEGORY_TYPES[categoryFilter];
    const term = searchTerm.trim().toLowerCase();

    return candidates
      .map(cleanCandidate)
      .filter(c => !dismissed.has(c.id))
      .filter(c => !isPollutedCandidate(c))
      .filter(c => !allowedTypes || allowedTypes.includes(c.suggested_group_type))
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
    <div className="border border-purple-500/30 rounded-lg bg-black/60 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-medium text-white">
            Group Suggestions
          </span>
          <span className="text-xs bg-purple-500/30 text-purple-300 px-2 py-0.5 rounded-full">
            {visible.length}
          </span>
        </div>
        {collapsed
          ? <ChevronDown className="h-4 w-4 text-white/40" />
          : <ChevronUp className="h-4 w-4 text-white/40" />
        }
      </button>

      {/* Candidates */}
      {!collapsed && (
        <div className="divide-y divide-white/5">
          {visible.map(c => (
            <div key={c.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Main message */}
                  <p className="text-sm text-white/90 leading-relaxed">
                    {buildMessage(c)}
                  </p>

                  {/* Type + relationship badges */}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge variant="outline" className={`text-xs px-2 py-0.5 ${typeColor(c.suggested_group_type)}`}>
                      {typeLabel(c.suggested_group_type)}
                    </Badge>
                    {c.is_public_entity && (
                      <Badge variant="outline" className="text-xs px-2 py-0.5 bg-yellow-500/20 text-yellow-300 border-yellow-500/30">
                        Public Entity
                      </Badge>
                    )}
                    <span className="text-xs text-white/30">
                      {Math.round(c.confidence * 100)}% confidence
                    </span>
                  </div>

                  {/* Expandable: member list + context */}
                  {expanded === c.id && (
                    <div className="mt-3 space-y-2">
                      {whyText(c) && (
                        <div>
                          <p className="text-xs text-white/50 mb-1">Why this was detected</p>
                          <p className="text-xs text-white/60">{whyText(c)}</p>
                        </div>
                      )}
                      {c.detected_members.length > 0 && (
                        <div>
                          <p className="text-xs text-white/50 mb-1">Detected members</p>
                          <div className="flex flex-wrap gap-1">
                            {c.detected_members.map(m => (
                              <span key={m} className="text-xs bg-white/10 text-white/70 px-2 py-0.5 rounded">
                                {m}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {c.context && (
                        <div>
                          <p className="text-xs text-white/50 mb-1">From</p>
                          <p className="text-xs text-white/50 italic line-clamp-2">
                            "{c.context}"
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Toggle details */}
                  <button
                    onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                    className="text-xs text-purple-400 hover:text-purple-300 mt-2 transition-colors"
                  >
                    {expanded === c.id ? 'Less' : 'Details'}
                  </button>
                </div>

                {/* Actions */}
                <div className="relative flex items-center gap-1 flex-shrink-0">
                  <Button
                    size="sm"
                    onClick={() => void handleAccept(c.id)}
                    disabled={processing === c.id}
                    className="h-7 px-2 bg-purple-600/80 hover:bg-purple-600 text-white border-0"
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    {processing === c.id ? '…' : 'Create'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const next = mergeOpenFor === c.id ? null : c.id;
                      setMergeOpenFor(next);
                      if (next) void loadOrgOptions();
                    }}
                    disabled={processing === c.id}
                    className="h-7 px-2 text-white/50 hover:text-white/80"
                    title="Merge into an existing group"
                  >
                    Merge
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleReject(c.id)}
                    disabled={processing === c.id}
                    className="h-7 px-2 text-white/40 hover:text-white/70"
                  >
                    Not now
                  </Button>
                  <button
                    onClick={() => handleDismissLocal(c.id)}
                    className="text-white/20 hover:text-white/50 transition-colors p-1"
                    title="Dismiss"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>

                  {/* Merge target dropdown */}
                  {mergeOpenFor === c.id && (
                    <div className="absolute right-0 top-9 z-20 w-56 max-h-56 overflow-y-auto rounded-md border border-white/10 bg-zinc-900 shadow-xl">
                      <p className="px-3 py-2 text-xs text-white/40 border-b border-white/5">Merge into…</p>
                      {orgOptions.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-white/40">No existing groups</p>
                      ) : (
                        orgOptions.map(o => (
                          <button
                            key={o.id}
                            onClick={() => void handleMerge(c.id, o.id)}
                            className="w-full text-left px-3 py-2 text-xs text-white/80 hover:bg-white/10 transition-colors truncate"
                          >
                            {o.name}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
