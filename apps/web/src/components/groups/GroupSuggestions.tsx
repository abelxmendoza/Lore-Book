// =====================================================
// GROUP SUGGESTIONS
// Purpose: Lightweight surface for group candidates awaiting review.
// Non-modal, non-blocking, dismissible.
// Shows only when occurrence_count >= 2 (threshold met).
// =====================================================

import { useState, useEffect } from 'react';
import { Users, X, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { fetchJson } from '../../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type GroupType =
  | 'friend_group' | 'band' | 'sports_team' | 'company' | 'club' | 'nonprofit'
  | 'family' | 'martial_arts' | 'scene' | 'crew' | 'collective'
  | 'institution' | 'public_entity' | 'other';

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
}

interface GroupSuggestionsProps {
  onGroupCreated?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<GroupType, string> = {
  friend_group: 'Friend Group', band: 'Band', sports_team: 'Sports Team',
  company: 'Company', club: 'Club', nonprofit: 'Nonprofit',
  family: 'Family', martial_arts: 'Martial Arts', scene: 'Scene',
  crew: 'Crew', collective: 'Collective', institution: 'Institution',
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
  institution:  'bg-slate-500/20 text-slate-300 border-slate-500/30',
  public_entity:'bg-yellow-600/20 text-yellow-300 border-yellow-600/30',
  other:        'bg-gray-500/20 text-gray-300 border-gray-500/30',
};
const typeColor = (t: GroupType): string => TYPE_COLORS[t] ?? 'bg-gray-500/20 text-gray-300 border-gray-500/30';

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

// ── Component ─────────────────────────────────────────────────────────────────

export const GroupSuggestions: React.FC<GroupSuggestionsProps> = ({ onGroupCreated }) => {
  const [candidates, setCandidates] = useState<GroupCandidate[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    void loadCandidates();
    const interval = setInterval(() => void loadCandidates(), 60_000);
    return () => clearInterval(interval);
  }, []);

  const loadCandidates = async () => {
    try {
      const res = await fetchJson<{ success: boolean; candidates: GroupCandidate[] }>(
        '/api/group-candidates?status=pending'
      );
      if (res.success) setCandidates(res.candidates);
    } catch {
      // Non-fatal — suggestions are optional
    }
  };

  const handleAccept = async (candidateId: string) => {
    setProcessing(candidateId);
    try {
      await fetchJson(`/api/group-candidates/${candidateId}/accept`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setCandidates(prev => prev.filter(c => c.id !== candidateId));
      onGroupCreated?.();
    } catch (err) {
      console.error('Failed to accept candidate:', err);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (candidateId: string) => {
    setProcessing(candidateId);
    try {
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

  const visible = candidates.filter(c => !dismissed.has(c.id));
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
                <div className="flex items-center gap-1 flex-shrink-0">
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
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
