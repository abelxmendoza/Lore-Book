import { useState, useEffect } from 'react';
import { AlertTriangle, Target, TrendingUp, User, Heart, Palette, RefreshCw, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { fetchJson } from '../../lib/api';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';

type ContinuityEvent = {
  id: string;
  event_type: 'contradiction' | 'abandoned_goal' | 'arc_shift' | 'identity_drift' | 'emotional_transition' | 'thematic_drift';
  description: string;
  source_components: string[];
  severity: number;
  created_at: string;
  metadata?: Record<string, unknown>;
};

// Mock data for development
const MOCK_CONTINUITY_EVENTS: ContinuityEvent[] = [
  {
    id: '1',
    event_type: 'contradiction',
    description: 'You mentioned being "completely done with coding" in January but then wrote about "excited to start new project" in February',
    source_components: ['journal_entry_123', 'journal_entry_145'],
    severity: 7,
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    metadata: { entry1: 'Jan 15', entry2: 'Feb 3' }
  },
  {
    id: '2',
    event_type: 'identity_drift',
    description: 'Identity shift detected: Moving from "coder" to "creative" identity',
    source_components: ['identity_pulse', 'essence_profile'],
    severity: 6,
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: '3',
    event_type: 'abandoned_goal',
    description: 'Goal "Learn Spanish" was mentioned 5 times but no progress entries found',
    source_components: ['goal_tracker'],
    severity: 4,
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: '4',
    event_type: 'emotional_transition',
    description: 'Emotional arc shift: From "anxious" to "confident" over 2 weeks',
    source_components: ['emotional_intelligence'],
    severity: 5,
    created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  }
];

const MOCK_GOALS = {
  active: [
    {
      id: 'g1',
      event_type: 'abandoned_goal' as const,
      description: 'Build side project',
      source_components: ['goals'],
      severity: 3,
      created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    }
  ],
  abandoned: [
    {
      id: 'g2',
      event_type: 'abandoned_goal' as const,
      description: 'Learn Spanish',
      source_components: ['goals'],
      severity: 4,
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    }
  ]
};

const MOCK_CONTRADICTIONS: ContinuityEvent[] = [
  MOCK_CONTINUITY_EVENTS[0],
  {
    id: '5',
    event_type: 'contradiction',
    description: 'You said "I never drink coffee" but mentioned "morning coffee routine" in 3 entries',
    source_components: ['journal_entry_89', 'journal_entry_102', 'journal_entry_115'],
    severity: 8,
    created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString()
  }
];

export const ContinuityDashboard = () => {
  const [events, setEvents] = useState<ContinuityEvent[]>([]);
  const [goals, setGoals] = useState<{ active: ContinuityEvent[]; abandoned: ContinuityEvent[] }>({ active: [], abandoned: [] });
  const [contradictions, setContradictions] = useState<ContinuityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const { useMockData: isMockDataEnabled } = useMockData();

  useEffect(() => {
    loadData();
  }, [isMockDataEnabled]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [eventsData, goalsData, contradictionsData] = await Promise.all([
        fetchJson<{ events: ContinuityEvent[] }>('/api/continuity/events?limit=50', undefined, {
          useMockData: isMockDataEnabled,
          mockData: { events: MOCK_CONTINUITY_EVENTS },
        }).catch(() => {
          if (isMockDataEnabled) {
            return { events: MOCK_CONTINUITY_EVENTS };
          }
          return { events: [] };
        }),
        fetchJson<{ active: ContinuityEvent[]; abandoned: ContinuityEvent[] }>('/api/continuity/goals', undefined, {
          useMockData: isMockDataEnabled,
          mockData: MOCK_GOALS,
        }).catch(() => {
          if (isMockDataEnabled) {
            return MOCK_GOALS;
          }
          return { active: [], abandoned: [] };
        }),
        fetchJson<{ contradictions: ContinuityEvent[] }>('/api/continuity/contradictions', undefined, {
          useMockData: isMockDataEnabled,
          mockData: { contradictions: MOCK_CONTRADICTIONS },
        }).catch(() => {
          if (isMockDataEnabled) {
            return { contradictions: MOCK_CONTRADICTIONS };
          }
          return { contradictions: [] };
        }),
      ]);

      // Use real data if available, otherwise use mock data if toggle is on
      const useMockData = isMockDataEnabled && (!eventsData.events || eventsData.events.length === 0);
      
      setEvents(eventsData.events && eventsData.events.length > 0 ? eventsData.events : (useMockData ? MOCK_CONTINUITY_EVENTS : []));
      setGoals(goalsData && (goalsData.active.length > 0 || goalsData.abandoned.length > 0) ? goalsData : (useMockData ? MOCK_GOALS : { active: [], abandoned: [] }));
      setContradictions(contradictionsData.contradictions && contradictionsData.contradictions.length > 0 ? contradictionsData.contradictions : (useMockData ? MOCK_CONTRADICTIONS : []));
    } catch (error) {
      console.error('Failed to load continuity data:', error);
      // Use mock data if toggle is on
      if (shouldUseMock) {
        setEvents(MOCK_CONTINUITY_EVENTS);
        setGoals(MOCK_GOALS);
        setContradictions(MOCK_CONTRADICTIONS);
      } else {
        setEvents([]);
        setGoals({ active: [], abandoned: [] });
        setContradictions([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const runAnalysis = async () => {
    setRunning(true);
    try {
      await fetchJson('/api/continuity/run', { method: 'POST' });
      // Wait a bit then reload
      setTimeout(() => {
        loadData();
      }, 2000);
    } catch (error) {
      console.error('Failed to run continuity analysis:', error);
    } finally {
      setRunning(false);
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'contradiction':
        return <AlertTriangle className="h-5 w-5 text-red-400" />;
      case 'abandoned_goal':
        return <Target className="h-5 w-5 text-orange-400" />;
      case 'arc_shift':
        return <TrendingUp className="h-5 w-5 text-blue-400" />;
      case 'identity_drift':
        return <User className="h-5 w-5 text-purple-400" />;
      case 'emotional_transition':
        return <Heart className="h-5 w-5 text-pink-400" />;
      case 'thematic_drift':
        return <Palette className="h-5 w-5 text-green-400" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-gray-400" />;
    }
  };

  const getSeverityColor = (severity: number) => {
    if (severity >= 8) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (severity >= 5) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const summary = {
    contradictions: events.filter(e => e.event_type === 'contradiction').length,
    abandonedGoals: events.filter(e => e.event_type === 'abandoned_goal').length,
    arcShifts: events.filter(e => e.event_type === 'arc_shift').length,
    identityDrifts: events.filter(e => e.event_type === 'identity_drift').length,
    emotionalTransitions: events.filter(e => e.event_type === 'emotional_transition').length,
    thematicDrifts: events.filter(e => e.event_type === 'thematic_drift').length,
  };

  return (
    <div className="space-y-6">
      {/* Mock Data Banner */}
      {useMockData && (
        <div className="text-xs text-yellow-400/80 bg-yellow-500/10 border border-yellow-500/30 rounded px-3 py-2">
          📊 Showing mock data for demonstration. Real data will appear as you journal and contradictions are detected.
        </div>
      )}

      {/* Header */}
      <Card className="bg-gradient-to-r from-purple-900/30 to-fuchsia-900/30 border-purple-500/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <TrendingUp className="h-6 w-6 text-purple-400" />
              </div>
              <div>
                <CardTitle className="text-2xl text-white">Continuity Engine</CardTitle>
                <CardDescription className="text-white/70">
                  Track contradictions, goals, arc shifts, and identity changes
                </CardDescription>
              </div>
            </div>
            <Button
              onClick={runAnalysis}
              disabled={running}
              className="bg-primary/20 hover:bg-primary/30 text-primary border-primary/30"
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Run Analysis
                </>
              )}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-red-500/10 border-red-500/30">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/60">Contradictions</p>
                <p className="text-2xl font-bold text-red-400">{summary.contradictions}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-400/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-orange-500/10 border-orange-500/30">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/60">Abandoned Goals</p>
                <p className="text-2xl font-bold text-orange-400">{summary.abandonedGoals}</p>
              </div>
              <Target className="h-8 w-8 text-orange-400/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-blue-500/10 border-blue-500/30">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/60">Arc Shifts</p>
                <p className="text-2xl font-bold text-blue-400">{summary.arcShifts}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-400/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-purple-500/10 border-purple-500/30">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/60">Identity Drifts</p>
                <p className="text-2xl font-bold text-purple-400">{summary.identityDrifts}</p>
              </div>
              <User className="h-8 w-8 text-purple-400/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-pink-500/10 border-pink-500/30">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/60">Emotional Transitions</p>
                <p className="text-2xl font-bold text-pink-400">{summary.emotionalTransitions}</p>
              </div>
              <Heart className="h-8 w-8 text-pink-400/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-green-500/10 border-green-500/30">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/60">Thematic Drifts</p>
                <p className="text-2xl font-bold text-green-400">{summary.thematicDrifts}</p>
              </div>
              <Palette className="h-8 w-8 text-green-400/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Events Tabs */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-black/40">
          <TabsTrigger value="all">All Events</TabsTrigger>
          <TabsTrigger value="contradictions">Contradictions</TabsTrigger>
          <TabsTrigger value="goals">Goals</TabsTrigger>
          <TabsTrigger value="arcs">Arc Shifts</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4 mt-4">
          {events.length === 0 ? (
            <Card className="bg-black/40 border-border/60">
              <CardContent className="pt-6 text-center text-white/60">
                <p>No continuity events detected yet.</p>
                <p className="text-sm mt-2">Run analysis to detect contradictions, goals, and arc shifts.</p>
              </CardContent>
            </Card>
          ) : (
            events.map((event) => (
              <Card key={event.id} className="bg-black/40 border-border/60">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      {getEventIcon(event.event_type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={getSeverityColor(event.severity)}>
                            Severity: {event.severity}/10
                          </Badge>
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                            {event.event_type.replace('_', ' ')}
                          </Badge>
                        </div>
                        <span className="text-xs text-white/50">{formatDate(event.created_at)}</span>
                      </div>
                      <p className="text-white">{event.description}</p>
                      {event.source_components.length > 0 && (
                        <p className="text-xs text-white/50 mt-2">
                          {event.source_components.length} component{event.source_components.length > 1 ? 's' : ''} involved
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="contradictions" className="space-y-4 mt-4">
          {contradictions.length === 0 ? (
            <Card className="bg-black/40 border-border/60">
              <CardContent className="pt-6 text-center text-white/60">
                <p>No contradictions detected.</p>
              </CardContent>
            </Card>
          ) : (
            contradictions.map((event) => (
              <Card key={event.id} className="bg-red-500/10 border-red-500/30">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <AlertTriangle className="h-5 w-5 text-red-400 mt-1" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className={getSeverityColor(event.severity)}>
                          Severity: {event.severity}/10
                        </Badge>
                        <span className="text-xs text-white/50">{formatDate(event.created_at)}</span>
                      </div>
                      <p className="text-white">{event.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="goals" className="space-y-4 mt-4">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Abandoned Goals</h3>
              {goals.abandoned.length === 0 ? (
                <Card className="bg-black/40 border-border/60">
                  <CardContent className="pt-6 text-center text-white/60">
                    <p>No abandoned goals detected.</p>
                  </CardContent>
                </Card>
              ) : (
                goals.abandoned.map((goal) => (
                  <Card key={goal.id} className="bg-orange-500/10 border-orange-500/30 mb-3">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-4">
                        <Target className="h-5 w-5 text-orange-400 mt-1" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <Badge variant="outline" className={getSeverityColor(goal.severity)}>
                              Severity: {goal.severity}/10
                            </Badge>
                            <span className="text-xs text-white/50">{formatDate(goal.created_at)}</span>
                          </div>
                          <p className="text-white">{goal.description}</p>
                          {goal.metadata?.days_since_last_mention && (
                            <p className="text-xs text-white/50 mt-2">
                              Last mentioned {String(goal.metadata.days_since_last_mention)} days ago
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="arcs" className="space-y-4 mt-4">
          {events.filter(e => e.event_type === 'arc_shift').length === 0 ? (
            <Card className="bg-black/40 border-border/60">
              <CardContent className="pt-6 text-center text-white/60">
                <p>No arc shifts detected.</p>
              </CardContent>
            </Card>
          ) : (
            events
              .filter(e => e.event_type === 'arc_shift')
              .map((event) => (
                <Card key={event.id} className="bg-blue-500/10 border-blue-500/30">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <TrendingUp className="h-5 w-5 text-blue-400 mt-1" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant="outline" className={getSeverityColor(event.severity)}>
                            Severity: {event.severity}/10
                          </Badge>
                          <span className="text-xs text-white/50">{formatDate(event.created_at)}</span>
                        </div>
                        <p className="text-white">{event.description}</p>
                          {event.metadata?.old_topic && event.metadata?.new_topic && (
                            <div className="mt-2 flex items-center gap-2 text-xs text-white/70">
                              <span className="line-through">{String(event.metadata.old_topic)}</span>
                              <span>→</span>
                              <span className="font-semibold">{String(event.metadata.new_topic)}</span>
                            </div>
                          )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

