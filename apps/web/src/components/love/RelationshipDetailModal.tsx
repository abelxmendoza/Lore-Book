// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { useState, useEffect, useCallback } from 'react';
import { X, Heart, Calendar, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, MessageSquare, BarChart3, List, Clock, Activity, RefreshCw, Sparkles, GitBranch, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { fetchJson } from '../../lib/api';
import { useMockData } from '../../contexts/MockDataContext';
import { 
  getMockRomanticRelationshipById,
  getMockDateEvents,
  getMockRelationshipAnalytics
} from '../../mocks/romanticRelationships';
import { ProsConsView } from './ProsConsView';
import { RelationshipTimeline } from './RelationshipTimeline';
import { RelationshipAnalytics } from './RelationshipAnalytics';
import { TheirConnectionsPanel } from './TheirConnectionsPanel';
import { RelationshipFlagsPanel } from './RelationshipFlagsPanel';
import { RelationshipLifeImpactPanel } from './RelationshipLifeImpactPanel';
import { getMockRelationshipInfluence } from '../../mocks/romanticLifeImpact';
import type { MockRelationshipInfluence } from '../../mocks/romanticLifeImpact';
import { openChatWithFocus } from '../../lib/openChatWithFocus';
import { openCharacterBookModal } from '../../lib/openCharacterBookModal';
import {
  getRomanticDemoProfile,
  getRomanticDemoPatterns,
  metricLabel,
  pickMetricValue,
} from '../../mocks/romanticDemoProfiles';
import { CHAT_FOCUS_SOURCE_LABELS } from '../../types/chatFocus';
import {
  useDeleteRomanticRelationshipMutation,
  useUpdateRomanticRelationshipMutation,
} from '../../store/api/entitiesApi';

interface RelationshipDetailModalProps {
  relationshipId: string;
  onClose: () => void;
  onUpdate?: () => void;
}

type RelationshipData = {
  id: string;
  person_id: string;
  person_type: 'character' | 'omega_entity';
  person_name?: string;
  relationship_type: string;
  status: string;
  is_current: boolean;
  affection_score: number;
  emotional_intensity: number;
  compatibility_score: number;
  relationship_health: number;
  is_situationship: boolean;
  exclusivity_status?: string;
  strengths: string[];
  weaknesses: string[];
  pros: string[];
  cons: string[];
  red_flags: string[];
  green_flags: string[];
  start_date?: string;
  end_date?: string;
  created_at: string;
  metadata?: {
    signals?: {
      obsession_score?: number;
      attachment_intensity?: number;
      evidence_strength?: number;
      signal_strength?: 'low' | 'moderate' | 'high';
    };
  } & Record<string, unknown>;
};

type RelationshipAnalyticsData = {
  relationshipId: string;
  personId: string;
  personName: string;
  affectionScore: number;
  compatibilityScore: number;
  healthScore: number;
  intensityScore: number;
  strengths: string[];
  weaknesses: string[];
  pros: string[];
  cons: string[];
  redFlags: string[];
  greenFlags: string[];
  insights: string[];
  recommendations: string[];
  affectionTrend: string;
  healthTrend: string;
  calculatedAt: string;
};

type DateEvent = {
  id: string;
  date_type: string;
  date_time: string;
  location?: string;
  description?: string;
  sentiment?: number;
  was_positive?: boolean;
};

const RELATIONSHIP_TABS = [
  { value: 'overview', label: 'Overview', shortLabel: 'Overview', icon: Heart },
  { value: 'timeline', label: 'Timeline', shortLabel: 'Time', icon: Clock },
  { value: 'pros-cons', label: 'Pros & Cons', shortLabel: 'Pros', icon: List },
  { value: 'analytics', label: 'Analytics', shortLabel: 'Stats', icon: BarChart3 },
  { value: 'chat', label: 'Chat', shortLabel: 'Chat', icon: MessageSquare },
  { value: 'their-connections', label: 'Their connections', shortLabel: 'Links', icon: GitBranch },
  { value: 'life-impact', label: 'Life Impact', shortLabel: 'Impact', icon: Sparkles },
] as const;

export const RelationshipDetailModal = ({ relationshipId, onClose, onUpdate }: RelationshipDetailModalProps) => {
  const { useMockData: shouldUseMockData } = useMockData();
  const [updateRomanticRelationship] = useUpdateRomanticRelationshipMutation();
  const [deleteRomanticRelationship] = useDeleteRomanticRelationshipMutation();
  const [relationship, setRelationship] = useState<RelationshipData | null>(null);
  const [analytics, setAnalytics] = useState<RelationshipAnalyticsData | null>(null);
  const [dates, setDates] = useState<DateEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [drift, setDrift] = useState<any | null>(null);
  const [cycles, setCycles] = useState<any[]>([]);
  const [patternsLoading, setPatternsLoading] = useState(false);
  const [patternsLoaded, setPatternsLoaded] = useState(false);
  const [influence, setInfluence] = useState<MockRelationshipInfluence | null>(null);
  const [influenceLoading, setInfluenceLoading] = useState(false);
  const [influenceLoaded, setInfluenceLoaded] = useState(false);
  const [crudBusy, setCrudBusy] = useState(false);
  const [crudError, setCrudError] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState('wrong_person_or_not_real');
  const [deleteReasonNote, setDeleteReasonNote] = useState('');

  useEffect(() => {
    loadData();
    setInfluence(null);
    setInfluenceLoaded(false);
  }, [relationshipId, shouldUseMockData]);

  // Load drift and cycles on-demand when Analytics tab is opened
  const loadPatterns = useCallback(async () => {
    if (patternsLoaded) return;
    setPatternsLoading(true);
    try {
      if (shouldUseMockData) {
        const demoPatterns = getRomanticDemoPatterns(relationshipId);
        setDrift(demoPatterns?.drift ?? null);
        setCycles(demoPatterns?.cycles ?? []);
        setPatternsLoaded(true);
        return;
      }
      const [driftData, cyclesData] = await Promise.all([
        fetchJson<{ success: boolean; currentDrift: any; driftHistory: any[] }>(
          `/api/conversation/romantic-relationships/${relationshipId}/drift`
        ).catch(() => null),
        fetchJson<{ success: boolean; cycles: any[]; cycleHistory: any[] }>(
          `/api/conversation/romantic-relationships/${relationshipId}/cycles`
        ).catch(() => null),
      ]);
      if (driftData?.success) setDrift(driftData.currentDrift ?? null);
      if (cyclesData?.success) {
        // Prefer live detected cycles, fall back to stored history
        const activeCycles = cyclesData.cycles?.length > 0
          ? cyclesData.cycles
          : (cyclesData.cycleHistory || []).filter((c: any) => c.is_active);
        setCycles(activeCycles);
      }
      setPatternsLoaded(true);
    } catch {
      // Non-fatal — Patterns section shows empty state
    } finally {
      setPatternsLoading(false);
    }
  }, [relationshipId, patternsLoaded, shouldUseMockData]);

  useEffect(() => {
    if (activeTab === 'analytics') loadPatterns();
  }, [activeTab, loadPatterns]);

  const loadInfluence = useCallback(async () => {
    if (influenceLoaded) return;
    setInfluenceLoading(true);
    try {
      if (shouldUseMockData) {
        setInfluence(getMockRelationshipInfluence(relationshipId) ?? null);
        setInfluenceLoaded(true);
        return;
      }
      const data = await fetchJson<{ success: boolean } & Record<string, unknown>>(
        `/api/conversation/romantic-relationships/${relationshipId}/influence`
      ).catch(() => null);
      if (data?.success) setInfluence(data as MockRelationshipInfluence);
      setInfluenceLoaded(true);
    } catch {
      // non-fatal
    } finally {
      setInfluenceLoading(false);
    }
  }, [relationshipId, influenceLoaded, shouldUseMockData]);

  useEffect(() => {
    if (activeTab === 'life-impact') loadInfluence();
  }, [activeTab, loadInfluence]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Use mock data if enabled
      if (shouldUseMockData) {
        const mockRel = getMockRomanticRelationshipById(relationshipId);
        if (mockRel) {
          setRelationship(mockRel as RelationshipData);
          const mockAnalytics = getMockRelationshipAnalytics(relationshipId);
          if (mockAnalytics) {
            setAnalytics(mockAnalytics);
          }
          const mockDates = getMockDateEvents(relationshipId);
          setDates(mockDates);
          setInfluence(getMockRelationshipInfluence(relationshipId) ?? null);
          setInfluenceLoaded(true);
        }
        setLoading(false);
        return;
      }

      // Load real relationship data
      const relData = await fetchJson<{ success: boolean; relationships: RelationshipData[] }>(
        `/api/conversation/romantic-relationships`
      ).catch(() => ({ success: false, relationships: [] }));

      const rel = relData.relationships?.find(r => r.id === relationshipId);
      if (rel && rel.person_name) {
        setRelationship(rel);
      }

      // Load analytics and dates
      const [analyticsData, datesData] = await Promise.all([
        fetchJson<{ success: boolean; analytics: RelationshipAnalyticsData }>(
          `/api/conversation/romantic-relationships/${relationshipId}/analytics`
        ).catch(() => ({ success: false, analytics: null })),
        fetchJson<{ success: boolean; dates: DateEvent[] }>(
          `/api/conversation/romantic-relationships/${relationshipId}/dates`
        ).catch(() => ({ success: false, dates: [] })),
      ]);

      if (analyticsData.success && analyticsData.analytics) {
        setAnalytics(analyticsData.analytics);
      }
      if (datesData.success) {
        setDates(datesData.dates || []);
      }
    } catch (error) {
      console.error('Failed to load relationship data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChatSubmit = async () => {
    if (!chatInput.trim() || chatLoading) return;

    const userMessage = { role: 'user' as const, content: chatInput, timestamp: new Date() };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setChatLoading(true);

    try {
      // Call chat endpoint with relationship context
      const response = await fetchJson<{ answer: string; updated?: boolean }>(
        `/api/conversation/romantic-relationships/${relationshipId}/chat`,
        {
          method: 'POST',
          body: JSON.stringify({
            message: chatInput,
            conversationHistory: chatMessages.map(msg => ({ role: msg.role, content: msg.content }))
          })
        }
      );

      const assistantMessage = { 
        role: 'assistant' as const, 
        content: response.answer || 'I understand. How can I help you with this relationship?', 
        timestamp: new Date() 
      };
      setChatMessages(prev => [...prev, assistantMessage]);

      // If relationship was updated, reload data
      if (response.updated) {
        await loadData();
        onUpdate?.();
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = { 
        role: 'assistant' as const, 
        content: 'Sorry, I encountered an error. Please try again.', 
        timestamp: new Date() 
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setChatLoading(false);
    }
  };

  const updateRelationshipStatus = async (
    status: 'active' | 'on_break' | 'ended' | 'complicated' | 'paused',
    reason: string,
  ) => {
    if (!relationship || shouldUseMockData) return;
    setCrudBusy(true);
    setCrudError(null);
    try {
      const now = new Date().toISOString();
      const result = await updateRomanticRelationship({
        id: relationship.id,
        values: {
          status,
          is_current: status === 'active' || status === 'complicated',
          ...(status === 'ended' ? { end_date: now } : {}),
          ...(status === 'active' ? { end_date: null } : {}),
          reason,
        },
      }).unwrap() as { relationship?: RelationshipData };
      if (result.relationship) setRelationship(result.relationship);
      await loadData();
      onUpdate?.();
    } catch (error) {
      setCrudError(error instanceof Error ? error.message : 'Could not update relationship');
    } finally {
      setCrudBusy(false);
    }
  };

  const deleteRelationship = async () => {
    if (!relationship || shouldUseMockData) return;
    setCrudBusy(true);
    setCrudError(null);
    try {
      await deleteRomanticRelationship({
        id: relationship.id,
        reason: deleteReason,
        reason_note: deleteReasonNote.trim() || undefined,
      }).unwrap();
      onUpdate?.();
      onClose();
    } catch (error) {
      setCrudError(error instanceof Error ? error.message : 'Could not delete relationship');
    } finally {
      setCrudBusy(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.7) return 'text-green-400';
    if (score >= 0.5) return 'text-yellow-400';
    return 'text-red-400';
  };

  const formatRelationshipType = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (loading) {
    return (
      <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="border-pink-500/30 bg-gradient-to-br from-black via-purple-950 to-black" onClose={onClose}>
          <DialogHeader>
            <DialogTitle>Loading...</DialogTitle>
            <Button variant="ghost" onClick={onClose} className="p-2 h-9 w-9 sm:h-11 sm:w-11 shrink-0">
              <X className="h-5 w-5" />
            </Button>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 pb-4 sm:pb-6">
            <div className="text-center text-white/60 py-12">
              <Heart className="w-12 h-12 mx-auto mb-4 text-pink-400/50 animate-pulse" />
              <p>Loading relationship details...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!relationship) {
    return (
      <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="border-pink-500/30 bg-gradient-to-br from-black via-purple-950 to-black" onClose={onClose}>
          <DialogHeader>
            <DialogTitle>Not Found</DialogTitle>
            <Button variant="ghost" onClick={onClose} className="p-2 h-9 w-9 sm:h-11 sm:w-11 shrink-0">
              <X className="h-5 w-5" />
            </Button>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 pb-4 sm:pb-6">
            <div className="text-center text-white/60 py-12">
              <p>Relationship not found</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const displayName = relationship.person_name || formatRelationshipType(relationship.relationship_type);
  const demoProfile = shouldUseMockData ? getRomanticDemoProfile(relationshipId) : undefined;
  const primaryMetrics = demoProfile?.primaryMetrics ?? (['affection', 'compatibility', 'health', 'intensity'] as const);
  const flagsFirst = demoProfile?.overviewEmphasis === 'flags';

  const openRelationshipChat = (starter?: string) => {
    onClose();
    openChatWithFocus({
      entityId: relationship.person_id,
      entityName: displayName,
      entityType: 'character',
      relationshipId: relationship.id,
      relationshipName: displayName,
      sourceSurface: 'love',
      sourceLabel: CHAT_FOCUS_SOURCE_LABELS.love,
      knowledgeScope: 'romantic relationship — feelings, patterns, and connection',
      initialPrompt: starter,
      baseline: {
        affectionScore: Math.round(relationship.affection_score * 100),
        healthScore: Math.round(relationship.relationship_health * 100),
        connectionScore: Math.round((relationship.metadata?.signals?.attachment_intensity ?? relationship.emotional_intensity) * 100),
      },
    });
  };

  const currentAnalytics = analytics || {
    relationshipId: relationship.id,
    personId: relationship.person_id,
    personName: displayName,
    affectionScore: relationship.affection_score,
    compatibilityScore: relationship.compatibility_score,
    healthScore: relationship.relationship_health,
    intensityScore: relationship.emotional_intensity,
    strengths: relationship.strengths,
    weaknesses: relationship.weaknesses,
    pros: relationship.pros,
    cons: relationship.cons,
    redFlags: relationship.red_flags,
    greenFlags: relationship.green_flags,
    insights: [],
    recommendations: [],
    affectionTrend: 'stable',
    healthTrend: 'stable',
    calculatedAt: new Date().toISOString()
  };

  const tabPanelClass =
    'mt-3 sm:mt-6 min-w-0 max-w-full overflow-x-hidden focus-visible:outline-none data-[state=inactive]:hidden';

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-pink-500/30 bg-gradient-to-br from-black via-purple-950 to-black" onClose={onClose}>
        <DialogHeader>
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <Heart className="w-5 h-5 sm:w-6 sm:h-6 text-pink-400 shrink-0" />
            <DialogTitle className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 flex-1 min-w-0 !text-lg sm:!text-2xl">
              <span className="text-white truncate">{displayName}</span>
              <Badge variant="outline" className="w-fit max-w-full truncate bg-pink-500/20 text-pink-300 border-pink-500/30 sm:ml-auto">
                {formatRelationshipType(relationship.relationship_type)}
              </Badge>
            </DialogTitle>
          </div>
          <Button variant="ghost" onClick={onClose} className="p-2 h-9 w-9 sm:h-11 sm:w-11 shrink-0" aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0 overflow-hidden px-4 sm:px-6 pb-4 sm:pb-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
          <TabsList
            className="grid w-full max-w-full h-auto shrink-0 grid-cols-4 md:grid-cols-7 gap-0.5 p-1 bg-black/40 border border-border/50"
            aria-label="Relationship sections"
          >
            {RELATIONSHIP_TABS.map(({ value, label, shortLabel, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                data-testid={value === 'their-connections' ? 'tab-their-connections' : undefined}
                aria-label={label}
                className="flex flex-col md:flex-row items-center justify-center gap-px md:gap-2 rounded-md px-0.5 py-1 md:px-3 md:py-2 min-h-[34px] md:min-h-0 text-[8px] md:text-sm font-medium leading-none touch-manipulation data-[state=active]:bg-pink-500/20 data-[state=active]:text-pink-200 data-[state=active]:border data-[state=active]:border-pink-500/30"
              >
                <Icon className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0" />
                <span className="w-full text-center truncate md:w-auto md:whitespace-nowrap">
                  <span className="md:hidden">{shortLabel}</span>
                  <span className="hidden md:inline">{label}</span>
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain overflow-x-hidden mt-1 sm:mt-2 pr-0.5 -mr-0.5">
          {/* Overview Tab */}
          <TabsContent value="overview" className={`${tabPanelClass} space-y-4 sm:space-y-6`}>
            {demoProfile && (
              <div className="rounded-xl border border-pink-500/25 bg-gradient-to-r from-pink-950/25 via-purple-950/15 to-black/30 p-3 sm:p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[10px] sm:text-xs border-pink-500/30 text-pink-200 bg-pink-500/10">
                    {demoProfile.showcaseTag}
                  </Badge>
                </div>
                <p className="text-sm sm:text-base text-white/90 leading-relaxed">{demoProfile.headline}</p>
              </div>
            )}

            {flagsFirst && (
              <RelationshipFlagsPanel
                redFlags={currentAnalytics.redFlags}
                greenFlags={currentAnalytics.greenFlags}
                compact
              />
            )}

            {/* Primary scores — varies per demo persona (not always four boxes) */}
            <div
              className={`grid gap-3 sm:gap-4 ${
                primaryMetrics.length <= 2
                  ? 'grid-cols-2'
                  : primaryMetrics.length === 3
                    ? 'grid-cols-3'
                    : 'grid-cols-2 md:grid-cols-4'
              }`}
            >
              {primaryMetrics.map((key) => (
                <div key={key} className="p-3 sm:p-4 rounded-lg border border-pink-500/20 bg-pink-950/10">
                  <p className="text-[10px] sm:text-xs text-white/50 mb-1">{metricLabel(key)}</p>
                  <p className={`text-xl sm:text-2xl font-bold ${getScoreColor(pickMetricValue(key, currentAnalytics))}`}>
                    {Math.round(pickMetricValue(key, currentAnalytics) * 100)}%
                  </p>
                </div>
              ))}
            </div>

            {/* Attachment & Dynamics — hidden for thin early-stage demos */}
            {demoProfile?.showAttachmentDynamics !== false && (() => {
              const sig = relationship.metadata?.signals;
              if (!sig) return null;
              const attachment = sig.attachment_intensity ?? 0;
              const obsession = sig.obsession_score ?? 0;
              const lvl = (v: number) => (v >= 0.66 ? 'High' : v >= 0.4 ? 'Moderate' : 'Low');
              const stillLearning = sig.signal_strength === 'low';
              return (
                <div className="p-4 rounded-lg border border-border/60 bg-black/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">Attachment & Dynamics</p>
                    {stillLearning && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full border border-white/15 bg-white/[0.04] text-white/55">
                        Still learning
                      </span>
                    )}
                  </div>
                  {/* Attachment intensity bar */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-white/50">Attachment intensity</span>
                      <span className="text-pink-300 font-medium">{lvl(attachment)}</span>
                    </div>
                    <div className="h-2 bg-white/8 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-pink-500 to-rose-400 rounded-full" style={{ width: `${Math.round(attachment * 100)}%` }} />
                    </div>
                  </div>
                  {/* Fixation / obsession signal */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-white/50">Fixation signal</span>
                      <span className={obsession >= 0.6 ? 'text-orange-300 font-medium' : 'text-white/60'}>{lvl(obsession)}</span>
                    </div>
                    <div className="h-2 bg-white/8 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${obsession >= 0.6 ? 'bg-orange-500/70' : 'bg-white/25'}`} style={{ width: `${Math.round(obsession * 100)}%` }} />
                    </div>
                    {obsession >= 0.6 && (
                      <p className="text-[11px] text-orange-300/70 mt-1">Strong fixation — intensity persists more than the connection returns.</p>
                    )}
                  </div>
                  <p className="text-[10px] text-white/30">A relationship dynamic inferred from your conversations — not a label.</p>
                </div>
              );
            })()}

            {/* Status and Dates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border border-border/60 bg-black/40">
                <h3 className="text-sm font-semibold text-white mb-3">Status</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-white/70 text-sm">Status:</span>
                    <Badge variant="outline" className="bg-green-500/20 text-green-300 border-green-500/30">
                      {relationship.status}
                    </Badge>
                  </div>
                  {relationship.is_situationship && (
                    <div className="flex items-center justify-between">
                      <span className="text-white/70 text-sm">Type:</span>
                      <Badge variant="outline" className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                        Situationship
                      </Badge>
                    </div>
                  )}
                  {relationship.exclusivity_status && (
                    <div className="flex items-center justify-between">
                      <span className="text-white/70 text-sm">Exclusivity:</span>
                      <Badge variant="outline">{relationship.exclusivity_status}</Badge>
                    </div>
                  )}
                </div>
              </div>
              <div className="p-4 rounded-lg border border-border/60 bg-black/40">
                <h3 className="text-sm font-semibold text-white mb-3">Timeline</h3>
                <div className="space-y-2 text-sm">
                  {relationship.start_date && (
                    <div className="flex items-center gap-2 text-white/70">
                      <Calendar className="w-4 h-4" />
                      <span>Started: {new Date(relationship.start_date).toLocaleDateString()}</span>
                    </div>
                  )}
                  {relationship.end_date && (
                    <div className="flex items-center gap-2 text-white/70">
                      <Calendar className="w-4 h-4" />
                      <span>Ended: {new Date(relationship.end_date).toLocaleDateString()}</span>
                    </div>
                  )}
                  {!relationship.end_date && relationship.start_date && (
                    <div className="flex items-center gap-2 text-green-300">
                      <TrendingUp className="w-4 h-4" />
                      <span>Ongoing</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {!shouldUseMockData && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 p-4 space-y-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Correct this relationship</h3>
                    <p className="text-xs text-white/45">Use this when the relationship status is wrong or the row should not be in Love & Relationships.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={crudBusy}
                      onClick={() => void updateRelationshipStatus('active', 'user_restored_relationship_active')}
                      className="border-green-500/30 bg-green-500/10 text-green-100 hover:bg-green-500/20"
                    >
                      Active
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={crudBusy}
                      onClick={() => void updateRelationshipStatus('paused', 'user_paused_relationship')}
                      className="border-yellow-500/30 bg-yellow-500/10 text-yellow-100 hover:bg-yellow-500/20"
                    >
                      Pause
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={crudBusy}
                      onClick={() => void updateRelationshipStatus('ended', 'user_marked_relationship_ended')}
                      className="border-red-500/30 bg-red-500/10 text-red-100 hover:bg-red-500/20"
                    >
                      Mark ended
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
                  <select
                    className="min-h-[36px] rounded-md border border-white/10 bg-black/40 px-3 text-xs text-white"
                    value={deleteReason}
                    onChange={(event) => setDeleteReason(event.target.value)}
                    disabled={crudBusy}
                  >
                    <option value="wrong_person_or_not_real">Wrong person or not real</option>
                    <option value="no_romantic_interest">No romantic interest</option>
                    <option value="duplicate_or_should_merge">Duplicate or should merge</option>
                    <option value="not_relevant_to_my_life">Not relevant</option>
                    <option value="privacy_cleanup">Privacy cleanup</option>
                    <option value="other">Other</option>
                  </select>
                  <input
                    className="min-h-[36px] rounded-md border border-white/10 bg-black/40 px-3 text-xs text-white placeholder:text-white/30"
                    value={deleteReasonNote}
                    onChange={(event) => setDeleteReasonNote(event.target.value)}
                    placeholder="Optional note"
                    disabled={crudBusy}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={crudBusy}
                    onClick={() => void deleteRelationship()}
                    className="border-red-500/30 bg-red-500/10 text-red-100 hover:bg-red-500/20"
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Delete wrong row
                  </Button>
                </div>

                {crudError && (
                  <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                    {crudError}
                  </p>
                )}
              </div>
            )}

            {/* Red & Green Flags — default order when not flags-first */}
            {!flagsFirst && (
              <RelationshipFlagsPanel
                redFlags={currentAnalytics.redFlags}
                greenFlags={currentAnalytics.greenFlags}
                compact={primaryMetrics.length <= 2}
              />
            )}

            {/* Tailored insight — one line when story-mode analytics */}
            {demoProfile && currentAnalytics.insights[0] && (
              <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 sm:p-4">
                <p className="text-xs sm:text-sm text-white/75 leading-relaxed">{currentAnalytics.insights[0]}</p>
              </div>
            )}

            {/* Extra insights only in full analytics mode */}
            {!demoProfile && currentAnalytics.insights.length > 0 && (
              <div className="p-4 rounded-lg border border-primary/30 bg-primary/10">
                <h3 className="font-semibold text-primary mb-3">AI Insights</h3>
                <ul className="space-y-2">
                  {currentAnalytics.insights.map((insight, idx) => (
                    <li key={idx} className="text-sm text-white/80">• {insight}</li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className={tabPanelClass}>
            <RelationshipTimeline
              relationshipId={relationshipId}
              dates={dates}
              relationship={{
                ...relationship,
                person_id: relationship.person_id,
                person_name: displayName,
              }}
              scores={{
                affectionScore: currentAnalytics.affectionScore,
                healthScore: currentAnalytics.healthScore,
                intensityScore: currentAnalytics.intensityScore,
                compatibilityScore: currentAnalytics.compatibilityScore,
              }}
              onOpenCharacterTimeline={() => {
                if (!relationship.person_id) return;
                onClose();
                openCharacterBookModal({ characterId: relationship.person_id, tab: 'timeline' });
              }}
            />
          </TabsContent>

          {/* Pros & Cons Tab */}
          <TabsContent value="pros-cons" className={tabPanelClass}>
            <ProsConsView
              relationshipId={relationshipId}
              pros={currentAnalytics.pros}
              cons={currentAnalytics.cons}
              redFlags={currentAnalytics.redFlags}
              greenFlags={currentAnalytics.greenFlags}
              onUpdate={loadData}
            />
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className={`${tabPanelClass} space-y-4 sm:space-y-6`}>
            <RelationshipAnalytics
              relationshipId={relationshipId}
              analytics={currentAnalytics}
              variant={demoProfile?.analyticsVariant ?? 'full'}
            />

            {/* Patterns Section — drift + active cycles */}
            <div className="border border-purple-500/20 rounded-lg bg-purple-950/10 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-purple-400" />
                  Relationship Patterns
                </h3>
                {patternsLoading && (
                  <RefreshCw className="w-3 h-3 text-white/40 animate-spin" />
                )}
              </div>

              {!patternsLoaded && !patternsLoading && (
                <p className="text-xs text-white/40">Loading pattern analysis…</p>
              )}

              {patternsLoaded && !drift && cycles.length === 0 && (
                <p className="text-xs text-white/40">No patterns detected yet. Keep logging interactions and the system will identify recurring dynamics.</p>
              )}

              {/* Drift signal */}
              {drift && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-white/60 uppercase tracking-wider">Drift Signal</p>
                  <div className="flex items-center gap-3">
                    {drift.driftType === 'growing_closer' || drift.driftType === 'reconnecting' ? (
                      <TrendingUp className="w-4 h-4 text-green-400 flex-shrink-0" />
                    ) : drift.driftType === 'drifting_apart' || drift.driftType === 'breaking_up' ? (
                      <TrendingDown className="w-4 h-4 text-red-400 flex-shrink-0" />
                    ) : (
                      <Activity className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                    )}
                    <div>
                      <p className="text-sm text-white/80 capitalize">
                        {(drift.driftType as string).replace(/_/g, ' ')}
                        {drift.driftStrength != null && (
                          <span className="text-white/50 ml-1">— {Math.round(drift.driftStrength * 100)}% strength</span>
                        )}
                      </p>
                      {drift.timeSinceLastMentionDays != null && drift.timeSinceLastMentionDays < 999 && (
                        <p className="text-xs text-white/40">{drift.timeSinceLastMentionDays} days since last mention</p>
                      )}
                    </div>
                    {(drift.driftType === 'breaking_up') && (
                      <AlertTriangle className="w-4 h-4 text-red-400 ml-auto flex-shrink-0" />
                    )}
                  </div>
                </div>
              )}

              {/* Active cycles */}
              {cycles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-white/60 uppercase tracking-wider">Active Cycles</p>
                  {cycles.map((cycle: any, i: number) => {
                    const isNegative = ['toxic_pattern', 'negative_loop', 'on_again_off_again', 'push_pull', 'hot_cold'].includes(cycle.cycleType ?? cycle.cycle_type);
                    return (
                      <div key={i} className={`rounded-md p-3 border ${isNegative ? 'border-red-500/20 bg-red-950/20' : 'border-green-500/20 bg-green-950/10'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          {isNegative
                            ? <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0" />
                            : <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0" />
                          }
                          <span className="text-xs font-medium text-white/80 capitalize">
                            {((cycle.cycleType ?? cycle.cycle_type) as string).replace(/_/g, '-')}
                          </span>
                          <span className="text-xs text-white/40 ml-auto">
                            {Math.round((cycle.cycleStrength ?? cycle.cycle_strength ?? 0) * 100)}% · {cycle.cycleFrequency ?? cycle.cycle_frequency ?? 'irregular'}
                          </span>
                        </div>
                        {(cycle.patternDescription ?? cycle.pattern_description) && (
                          <p className="text-xs text-white/60 pl-5">
                            {(cycle.patternDescription ?? cycle.pattern_description) as string}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Chat Tab — directs to main chat with full relationship context */}
          <TabsContent value="chat" className={`${tabPanelClass} flex flex-col min-h-[min(52vh,520px)] max-h-none sm:max-h-[calc(90vh-14rem)]`}>
            <div className="flex-shrink-0 space-y-2 sm:space-y-4 pb-2 sm:pb-0">
              <div className="p-3 sm:p-5 rounded-lg border border-pink-500/20 bg-pink-950/10 space-y-2 sm:space-y-4">
                <p className="text-xs sm:text-sm text-white/70 leading-relaxed">
                  The main chat already knows everything about{' '}
                  <span className="text-pink-300 font-medium">{displayName}</span> — their history,
                  patterns, drift direction, and what's happened recently.
                </p>
                <div className="grid grid-cols-1 gap-1.5 sm:gap-2">
                  {[
                    `How are things going with ${displayName}?`,
                    `What patterns do you see with ${displayName}?`,
                    `I need to talk about what happened with ${displayName}.`,
                    `What should I know before my next interaction with ${displayName}?`,
                  ].map((starter) => (
                    <button
                      type="button"
                      key={starter}
                      onClick={() => openRelationshipChat(starter)}
                      className="text-left px-3 sm:px-4 py-2 sm:py-3 rounded-lg border border-pink-500/20 bg-black/40 hover:bg-pink-950/20 hover:border-pink-500/40 transition-colors text-xs sm:text-sm text-white/70 hover:text-white/90 break-words"
                    >
                      &ldquo;{starter}&rdquo;
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => openRelationshipChat()}
                  className="w-full py-2.5 sm:py-3 rounded-lg bg-pink-500/20 hover:bg-pink-500/30 border border-pink-500/30 text-pink-300 hover:text-pink-200 text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  Open main chat →
                </button>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-2 sm:space-y-4 p-2 sm:p-4 mt-2 rounded-lg border border-border/60 bg-black/40">
              {chatMessages.length === 0 ? (
                <div className="text-center text-white/60 py-6 sm:py-8 px-2">
                  <MessageSquare className="w-8 h-8 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-4 text-pink-400/30" />
                  <p className="text-xs sm:text-sm">Start a conversation about this relationship</p>
                </div>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex min-w-0 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[min(100%,16rem)] sm:max-w-[80%] rounded-lg p-2.5 sm:p-3 min-w-0 ${
                        msg.role === 'user'
                          ? 'bg-pink-500/20 text-white'
                          : 'bg-black/60 text-white/90 border border-border/60'
                      }`}
                    >
                      <p className="text-xs sm:text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Chat Input */}
            <div className="flex-shrink-0 flex flex-col sm:flex-row gap-2 pt-2 sm:pt-3 mt-auto">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleChatSubmit()}
                placeholder="Message about this relationship..."
                className="flex-1 min-w-0 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg bg-black/40 border border-border/60 text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-pink-500/50"
                disabled={chatLoading}
              />
              <Button
                onClick={handleChatSubmit}
                disabled={chatLoading || !chatInput.trim()}
                className="bg-pink-500 hover:bg-pink-600 w-full sm:w-auto shrink-0 text-sm py-2"
              >
                {chatLoading ? '...' : 'Send'}
              </Button>
            </div>
          </TabsContent>

          {/* Their connections — vicarious romantic periphery */}
          <TabsContent value="their-connections" className={tabPanelClass}>
            <TheirConnectionsPanel
              relationshipId={relationshipId}
              anchorName={displayName}
              anchorCharacterId={relationship.person_id}
              onCloseModal={onClose}
              onUpdate={onUpdate}
            />
          </TabsContent>

          {/* Life Impact Tab */}
          <TabsContent value="life-impact" className={`${tabPanelClass} space-y-4 sm:space-y-6`}>
            {influenceLoading && (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-6 w-6 text-pink-400 animate-spin" />
              </div>
            )}

            {!influenceLoading && !influence && !shouldUseMockData && (
              <div className="text-center py-12 text-white/40 px-4">
                <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No life impact data yet — keep adding entries to build the picture.</p>
              </div>
            )}

            {!influenceLoading && influence && (
              <RelationshipLifeImpactPanel influence={influence} personName={displayName} />
            )}
          </TabsContent>
          </div>
        </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};
