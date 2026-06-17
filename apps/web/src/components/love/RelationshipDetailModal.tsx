// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { useState, useEffect, useCallback } from 'react';
import { X, Heart, Calendar, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, MessageSquare, BarChart3, List, Clock, Activity, RefreshCw, Sparkles, GitBranch, Brain } from 'lucide-react';
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

export const RelationshipDetailModal = ({ relationshipId, onClose, onUpdate }: RelationshipDetailModalProps) => {
  const { useMockData: shouldUseMockData } = useMockData();
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
  const [influence, setInfluence] = useState<any | null>(null);
  const [influenceLoading, setInfluenceLoading] = useState(false);
  const [influenceLoaded, setInfluenceLoaded] = useState(false);

  useEffect(() => {
    loadData();
  }, [relationshipId, shouldUseMockData]);

  // Load drift and cycles on-demand when Analytics tab is opened
  const loadPatterns = useCallback(async () => {
    if (patternsLoaded || shouldUseMockData) return;
    setPatternsLoading(true);
    try {
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
    if (influenceLoaded || shouldUseMockData) return;
    setInfluenceLoading(true);
    try {
      const data = await fetchJson<{ success: boolean } & Record<string, any>>(
        `/api/conversation/romantic-relationships/${relationshipId}/influence`
      ).catch(() => null);
      if (data?.success) setInfluence(data);
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
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-black via-purple-950 to-black border-pink-500/30" onClose={onClose}>
          <DialogHeader>
            <DialogTitle>Loading...</DialogTitle>
            <Button variant="ghost" onClick={onClose} className="p-2 h-9 w-9 sm:h-11 sm:w-11">
              <X className="h-5 w-5" />
            </Button>
          </DialogHeader>
          <div className="text-center text-white/60 py-12">
            <Heart className="w-12 h-12 mx-auto mb-4 text-pink-400/50 animate-pulse" />
            <p>Loading relationship details...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!relationship) {
    return (
      <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-black via-purple-950 to-black border-pink-500/30" onClose={onClose}>
          <DialogHeader>
            <DialogTitle>Not Found</DialogTitle>
            <Button variant="ghost" onClick={onClose} className="p-2 h-9 w-9 sm:h-11 sm:w-11">
              <X className="h-5 w-5" />
            </Button>
          </DialogHeader>
          <div className="text-center text-white/60 py-12">
            <p>Relationship not found</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const displayName = relationship.person_name || formatRelationshipType(relationship.relationship_type);
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

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-black via-purple-950 to-black border-pink-500/30" onClose={onClose}>
        <DialogHeader>
          <div className="flex items-center gap-3 flex-1">
            <Heart className="w-6 h-6 text-pink-400" />
            <DialogTitle className="flex items-center gap-3 text-2xl flex-1">
              <span className="text-white">{displayName}</span>
              <Badge variant="outline" className="ml-auto bg-pink-500/20 text-pink-300 border-pink-500/30">
                {formatRelationshipType(relationship.relationship_type)}
              </Badge>
            </DialogTitle>
          </div>
          <Button variant="ghost" onClick={onClose} className="p-2 h-9 w-9 sm:h-11 sm:w-11" aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <div className="overflow-x-auto overflow-y-hidden scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <TabsList className="inline-flex min-w-max sm:grid sm:w-full sm:grid-cols-7 bg-black/40 border border-border/50 flex-wrap sm:flex-nowrap">
              <TabsTrigger value="overview" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0">
                <Heart className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden min-[375px]:inline sm:inline">Overview</span>
                <span className="min-[375px]:hidden">Over</span>
              </TabsTrigger>
              <TabsTrigger value="timeline" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0">
                <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden min-[375px]:inline sm:inline">Timeline</span>
                <span className="min-[375px]:hidden">Time</span>
              </TabsTrigger>
              <TabsTrigger value="pros-cons" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0">
                <List className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden min-[375px]:inline sm:inline">Pros & Cons</span>
                <span className="min-[375px]:hidden">Pros</span>
              </TabsTrigger>
              <TabsTrigger value="analytics" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0">
                <BarChart3 className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden min-[375px]:inline sm:inline">Analytics</span>
                <span className="min-[375px]:hidden">Stats</span>
              </TabsTrigger>
              <TabsTrigger value="chat" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0">
                <MessageSquare className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden min-[375px]:inline sm:inline">Chat</span>
                <span className="min-[375px]:hidden">Chat</span>
              </TabsTrigger>
              <TabsTrigger value="their-connections" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0" data-testid="tab-their-connections">
                <GitBranch className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden min-[375px]:inline sm:inline">Their connections</span>
                <span className="min-[375px]:hidden">Links</span>
              </TabsTrigger>
              <TabsTrigger value="life-impact" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 flex-shrink-0">
                <Sparkles className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden min-[375px]:inline sm:inline">Life Impact</span>
                <span className="min-[375px]:hidden">Impact</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-6 space-y-6">
            {/* Scores Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg border border-pink-500/20 bg-pink-950/10">
                <p className="text-xs text-white/50 mb-1">Affection</p>
                <p className={`text-2xl font-bold ${getScoreColor(currentAnalytics.affectionScore)}`}>
                  {Math.round(currentAnalytics.affectionScore * 100)}%
                </p>
              </div>
              <div className="p-4 rounded-lg border border-pink-500/20 bg-pink-950/10">
                <p className="text-xs text-white/50 mb-1">Compatibility</p>
                <p className={`text-2xl font-bold ${getScoreColor(currentAnalytics.compatibilityScore)}`}>
                  {Math.round(currentAnalytics.compatibilityScore * 100)}%
                </p>
              </div>
              <div className="p-4 rounded-lg border border-pink-500/20 bg-pink-950/10">
                <p className="text-xs text-white/50 mb-1">Health</p>
                <p className={`text-2xl font-bold ${getScoreColor(currentAnalytics.healthScore)}`}>
                  {Math.round(currentAnalytics.healthScore * 100)}%
                </p>
              </div>
              <div className="p-4 rounded-lg border border-pink-500/20 bg-pink-950/10">
                <p className="text-xs text-white/50 mb-1">Intensity</p>
                <p className={`text-2xl font-bold ${getScoreColor(currentAnalytics.intensityScore)}`}>
                  {Math.round(currentAnalytics.intensityScore * 100)}%
                </p>
              </div>
            </div>

            {/* Attachment & Dynamics (Sprint AD signals) */}
            {(() => {
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

            {/* Red & Green Flags */}
            {(currentAnalytics.redFlags.length > 0 || currentAnalytics.greenFlags.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentAnalytics.redFlags.length > 0 && (
                  <div className="p-4 rounded-lg border border-red-500/30 bg-red-500/10">
                    <h3 className="font-semibold text-red-300 mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      Red Flags ({currentAnalytics.redFlags.length})
                    </h3>
                    <ul className="space-y-2">
                      {currentAnalytics.redFlags.map((flag, idx) => (
                        <li key={idx} className="text-sm text-white/80 flex items-start gap-2">
                          <span className="text-red-400 mt-1">⚠</span>
                          <span>{flag}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {currentAnalytics.greenFlags.length > 0 && (
                  <div className="p-4 rounded-lg border border-green-500/30 bg-green-500/10">
                    <h3 className="font-semibold text-green-300 mb-3 flex items-center gap-2">
                      <CheckCircle className="w-5 h-5" />
                      Green Flags ({currentAnalytics.greenFlags.length})
                    </h3>
                    <ul className="space-y-2">
                      {currentAnalytics.greenFlags.map((flag, idx) => (
                        <li key={idx} className="text-sm text-white/80 flex items-start gap-2">
                          <span className="text-green-400 mt-1">✓</span>
                          <span>{flag}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Insights */}
            {currentAnalytics.insights.length > 0 && (
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
          <TabsContent value="timeline" className="mt-6">
            <RelationshipTimeline
              relationshipId={relationshipId}
              dates={dates}
              relationship={relationship}
            />
          </TabsContent>

          {/* Pros & Cons Tab */}
          <TabsContent value="pros-cons" className="mt-6">
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
          <TabsContent value="analytics" className="mt-6 space-y-6">
            <RelationshipAnalytics
              relationshipId={relationshipId}
              analytics={currentAnalytics}
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
          <TabsContent value="chat" className="mt-6">
            <div className="space-y-4">
              <div className="p-5 rounded-lg border border-pink-500/20 bg-pink-950/10 space-y-4">
                <p className="text-sm text-white/70">
                  The main chat already knows everything about{' '}
                  <span className="text-pink-300 font-medium">{displayName}</span> — their history,
                  patterns, drift direction, and what's happened recently. Open it to get a real
                  conversation, not a mini window.
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    `How are things going with ${displayName}?`,
                    `What patterns do you see in my relationship with ${displayName}?`,
                    `I need to talk about what happened with ${displayName}.`,
                    `What should I know before my next interaction with ${displayName}?`,
                  ].map((starter) => (
                    <button
                      type="button"
                      key={starter}
                      onClick={() => {
                        onClose();
                        window.dispatchEvent(new CustomEvent('navigate-surface', {
                          detail: { surface: 'chat', context: starter }
                        }));
                      }}
                      className="text-left px-4 py-3 rounded-lg border border-pink-500/20 bg-black/40 hover:bg-pink-950/20 hover:border-pink-500/40 transition-colors text-sm text-white/70 hover:text-white/90"
                    >
                      "{starter}"
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    window.dispatchEvent(new CustomEvent('navigate-surface', {
                      detail: { surface: 'chat' }
                    }));
                  }}
                  className="w-full py-3 rounded-lg bg-pink-500/20 hover:bg-pink-500/30 border border-pink-500/30 text-pink-300 hover:text-pink-200 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  Open main chat →
                </button>
              </div>

              {/* Chat Messages */}
              <div className="space-y-4 max-h-[400px] overflow-y-auto p-4 rounded-lg border border-border/60 bg-black/40">
                {chatMessages.length === 0 ? (
                  <div className="text-center text-white/60 py-8">
                    <MessageSquare className="w-12 h-12 mx-auto mb-4 text-pink-400/30" />
                    <p>Start a conversation about this relationship</p>
                  </div>
                ) : (
                  chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg p-3 ${
                          msg.role === 'user'
                            ? 'bg-pink-500/20 text-white'
                            : 'bg-black/60 text-white/90 border border-border/60'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Chat Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleChatSubmit()}
                  placeholder="Message about this relationship..."
                  className="flex-1 px-4 py-2 rounded-lg bg-black/40 border border-border/60 text-white placeholder:text-white/40 focus:outline-none focus:border-pink-500/50"
                  disabled={chatLoading}
                />
                <Button
                  onClick={handleChatSubmit}
                  disabled={chatLoading || !chatInput.trim()}
                  className="bg-pink-500 hover:bg-pink-600"
                >
                  {chatLoading ? '...' : 'Send'}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Their connections — vicarious romantic periphery */}
          <TabsContent value="their-connections" className="mt-6">
            <TheirConnectionsPanel
              relationshipId={relationshipId}
              anchorName={displayName}
              onUpdate={onUpdate}
            />
          </TabsContent>

          {/* Life Impact Tab */}
          <TabsContent value="life-impact" className="mt-6 space-y-6">
            {influenceLoading && (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-6 w-6 text-pink-400 animate-spin" />
              </div>
            )}

            {!influenceLoading && !influence && !shouldUseMockData && (
              <div className="text-center py-12 text-white/40">
                <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No life impact data yet — keep adding entries to build the picture.</p>
              </div>
            )}

            {!influenceLoading && influence && (
              <>
                {/* Autobiographical Impact Score */}
                <div className="p-5 rounded-xl border border-pink-500/25 bg-pink-950/15 flex items-center gap-5">
                  <div className="text-center flex-shrink-0">
                    <p className="text-4xl font-bold text-pink-300">
                      {Math.round((influence.autobiographical_impact ?? 0) * 100)}
                    </p>
                    <p className="text-xs text-white/50 mt-1">Impact Score</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white mb-1">
                      {influence.impact_label ?? 'Unknown'} Autobiographical Impact
                    </p>
                    <p className="text-xs text-white/60 leading-relaxed">
                      How significantly this relationship shaped your life arcs, beliefs, and behavioral patterns.
                    </p>
                  </div>
                </div>

                {/* Life Arcs Influenced */}
                {influence.life_arcs_influenced?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-white/80 mb-3 flex items-center gap-2">
                      <GitBranch className="w-4 h-4 text-pink-400" />
                      Life Arcs Influenced
                    </h3>
                    <div className="space-y-2">
                      {influence.life_arcs_influenced.map((arc: any) => (
                        <div key={arc.id} className="p-3 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between">
                          <div>
                            <p className="text-sm text-white/85">{arc.title}</p>
                            {arc.arc_type && <p className="text-xs text-white/40 mt-0.5">{arc.arc_type}</p>}
                          </div>
                          {arc.confidence != null && (
                            <span className="text-xs text-pink-300 font-semibold">
                              {Math.round(arc.confidence * 100)}%
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Knowledge Crystallized */}
                {influence.knowledge_claims_crystallized?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-white/80 mb-3 flex items-center gap-2">
                      <Brain className="w-4 h-4 text-indigo-400" />
                      Knowledge Crystallized From This Relationship
                    </h3>
                    <div className="space-y-2">
                      {influence.knowledge_claims_crystallized.map((item: any) => (
                        <div key={item.id} className="p-3 rounded-lg bg-indigo-950/20 border border-indigo-500/20">
                          <p className="text-xs text-white/75 leading-snug">{item.evidence_summary}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Breakup Aftermath */}
                {influence.breakup_aftermath && (
                  <div>
                    <h3 className="text-sm font-semibold text-white/80 mb-3 flex items-center gap-2">
                      <TrendingDown className="w-4 h-4 text-orange-400" />
                      Aftermath
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {influence.breakup_aftermath.closure_level != null && (
                        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                          <p className="text-xs text-white/50 mb-1">Closure</p>
                          <p className="text-lg font-bold text-orange-300">
                            {Math.round(influence.breakup_aftermath.closure_level * 100)}%
                          </p>
                        </div>
                      )}
                      {influence.breakup_aftermath.recovery_status && (
                        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                          <p className="text-xs text-white/50 mb-1">Recovery</p>
                          <p className="text-sm font-semibold text-white/80 capitalize">
                            {influence.breakup_aftermath.recovery_status.replace(/_/g, ' ')}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Cross-relationship patterns */}
                {influence.relationship_patterns?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-white/80 mb-3 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-purple-400" />
                      Cross-Relationship Patterns
                    </h3>
                    <div className="space-y-2">
                      {influence.relationship_patterns.map((p: any, i: number) => (
                        <div key={i} className="p-3 rounded-lg bg-purple-950/20 border border-purple-500/20">
                          <p className="text-xs text-white/70">{p.pattern_description ?? p.pattern_type}</p>
                          {p.frequency && (
                            <p className="text-[10px] text-purple-400/60 mt-1">Occurred {p.frequency}× across relationships</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
