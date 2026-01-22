// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { useState, useEffect } from 'react';
import { X, Heart, Calendar, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, MessageSquare, BarChart3, List, Clock } from 'lucide-react';
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

  useEffect(() => {
    loadData();
  }, [relationshipId, shouldUseMockData]);

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
      if (rel) {
        // Load person name
        try {
          if (rel.person_type === 'character') {
            const charData = await fetchJson<{ name: string }>(
              `/api/characters/${rel.person_id}`
            ).catch(() => null);
            setRelationship({ ...rel, person_name: charData?.name || 'Unknown' });
          } else {
            setRelationship({ ...rel, person_name: 'Unknown' });
          }
        } catch {
          setRelationship(rel);
        }
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
          <Button variant="ghost" onClick={onClose} className="p-2 h-9 w-9 sm:h-11 sm:w-11">
            <X className="h-5 w-5" />
          </Button>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <div className="overflow-x-auto overflow-y-hidden scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <TabsList className="inline-flex min-w-max sm:grid sm:w-full sm:grid-cols-5 bg-black/40 border border-border/50 flex-wrap sm:flex-nowrap">
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
          <TabsContent value="analytics" className="mt-6">
            <RelationshipAnalytics
              relationshipId={relationshipId}
              analytics={currentAnalytics}
            />
          </TabsContent>

          {/* Chat Tab */}
          <TabsContent value="chat" className="mt-6">
            <div className="space-y-4">
              <div className="p-4 rounded-lg border border-primary/30 bg-primary/10">
                <p className="text-sm text-white/80">
                  Chat with me about this relationship! I can help you update pros/cons, rankings, or just talk about how things are going.
                </p>
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
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
