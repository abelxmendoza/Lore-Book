// =====================================================
// LIFE ARC PANEL
// Purpose: Show recent moments and life arc narrative
// =====================================================

import { useState } from 'react';
import { Calendar, Clock, MapPin, Users, Sparkles, AlertCircle, TrendingUp, RefreshCw, Eye, MessageCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { useLifeArc, type Timeframe } from '../../hooks/useLifeArc';
import { format, parseISO } from 'date-fns';
import { EventDetailModal, type Event } from '../events/EventDetailModal';
import { StabilityCard } from './StabilityCard';

export const LifeArcPanel: React.FC = () => {
  const [timeframe, setTimeframe] = useState<Timeframe>('LAST_30_DAYS');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const { data, loading, error, refresh } = useLifeArc(timeframe);

  const humanizeTimeframe = (tf: Timeframe): string => {
    switch (tf) {
      case 'LAST_7_DAYS':
        return 'Last 7 days';
      case 'LAST_30_DAYS':
        return 'Last 30 days';
      case 'LAST_90_DAYS':
        return 'Last 90 days';
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'MMM d, yyyy');
    } catch {
      return dateString;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-400';
    if (confidence >= 0.6) return 'text-yellow-400';
    return 'text-red-400';
  };

  const handleEventClick = async (eventId: string) => {
    try {
      const { fetchJson } = await import('../../lib/api');
      const result = await fetchJson<{ success: boolean; event: Event }>(
        `/api/conversation/events/${eventId}`
      );
      if (result.success) {
        setSelectedEvent(result.event);
      }
    } catch (err: any) {
      console.error('Failed to load event:', err);
    }
  };

  if (loading) {
    return (
      <Card className="border-border/60 bg-black/40">
        <CardHeader>
          <CardTitle>Recent Moments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-24 bg-white/10 rounded animate-pulse" />
            <div className="h-32 bg-white/10 rounded animate-pulse" />
            <div className="h-24 bg-white/10 rounded animate-pulse" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="border-red-500/50 bg-red-500/10">
        <CardHeader>
          <CardTitle>Recent Moments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-red-400 mb-4">
            <AlertCircle className="w-5 h-5" />
            <p>{error || 'Failed to load life arc'}</p>
          </div>
          <Button onClick={refresh} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Check if this is a silence/stability state
  if (data?.is_silence && data.stability_state) {
    const stabilityMessages: Record<string, string> = {
      STABLE_EMPTY: 'Nothing notable stands out during this period.',
      STABLE_CONTINUATION: 'This period appears stable and consistent.',
      UNSTABLE_UNCLEAR: "There isn't enough clarity yet to draw conclusions.",
    };

    const stabilityExplanations: Record<string, string> = {
      STABLE_EMPTY: 'The system did not detect any events or data points in this timeframe.',
      STABLE_CONTINUATION: 'The system did not detect strong changes or patterns. This is normal and indicates stability.',
      UNSTABLE_UNCLEAR: 'The system detected conflicting information and needs more clarity before drawing conclusions.',
    };

    return (
      <>
        <Card className="border-border/60 bg-black/40">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Moments</CardTitle>
                <CardDescription>{humanizeTimeframe(data.timeframe)}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Tabs value={timeframe} onValueChange={(v) => setTimeframe(v as Timeframe)}>
                  <TabsList>
                    <TabsTrigger value="LAST_7_DAYS">7d</TabsTrigger>
                    <TabsTrigger value="LAST_30_DAYS">30d</TabsTrigger>
                    <TabsTrigger value="LAST_90_DAYS">90d</TabsTrigger>
                  </TabsList>
                </Tabs>
                <Button onClick={refresh} variant="ghost" size="sm">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Stability Card */}
            <StabilityCard
              stabilityState={data.stability_state}
              message={stabilityMessages[data.stability_state] || data.narrative_summary.text}
              explanation={stabilityExplanations[data.stability_state]}
            />
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <Card className="border-border/60 bg-black/40">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Moments</CardTitle>
              <CardDescription>{humanizeTimeframe(data.timeframe)}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Tabs value={timeframe} onValueChange={(v) => setTimeframe(v as Timeframe)}>
                <TabsList>
                  <TabsTrigger value="LAST_7_DAYS">7d</TabsTrigger>
                  <TabsTrigger value="LAST_30_DAYS">30d</TabsTrigger>
                  <TabsTrigger value="LAST_90_DAYS">90d</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button onClick={refresh} variant="ghost" size="sm">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Narrative Summary */}
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                What Stands Out
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-white/80 leading-relaxed">{data.narrative_summary.text}</p>
              <p className="text-xs text-white/40 mt-3">
                Observations based on {data.event_groups.significant_events.length} recent events
              </p>
            </CardContent>
          </Card>

          {/* Change Signals */}
          {(data.change_signals.first_time_people.length > 0 ||
            data.change_signals.first_time_locations.length > 0 ||
            data.change_signals.pattern_shifts.length > 0 ||
            data.change_signals.emotional_shifts.length > 0) && (
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Changes Detected
              </h3>
              <div className="flex flex-wrap gap-2">
                {data.change_signals.first_time_people.length > 0 && (
                  <Badge variant="outline" className="bg-blue-500/10 border-blue-500/30">
                    {data.change_signals.first_time_people.length} new people
                  </Badge>
                )}
                {data.change_signals.first_time_locations.length > 0 && (
                  <Badge variant="outline" className="bg-purple-500/10 border-purple-500/30">
                    {data.change_signals.first_time_locations.length} new places
                  </Badge>
                )}
                {data.change_signals.pattern_shifts.length > 0 && (
                  <Badge variant="outline" className="bg-yellow-500/10 border-yellow-500/30">
                    Patterns shifted
                  </Badge>
                )}
                {data.change_signals.emotional_shifts.length > 0 && (
                  <Badge variant="outline" className="bg-pink-500/10 border-pink-500/30">
                    Tone changed
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Significant Moments */}
          {data.event_groups.significant_events.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Notable Moments
              </h3>
              <div className="space-y-2">
                {data.event_groups.significant_events.slice(0, 5).map(event => {
                  // Find continuity notes for this event
                  const eventWithContinuity = data.events_with_continuity?.find(
                    e => e.id === event.id
                  );
                  return (
                    <div key={event.id}>
                      <Card
                        className="border-border/40 bg-black/20 hover:bg-black/40 cursor-pointer transition"
                        onClick={() => handleEventClick(event.id)}
                      >
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <h4 className="font-medium text-sm mb-1">{event.title}</h4>
                              {event.summary && (
                                <p className="text-xs text-white/60 line-clamp-2">{event.summary}</p>
                              )}
                              <div className="flex items-center gap-3 mt-2 text-xs text-white/40">
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>{formatDate(event.start_time)}</span>
                                </div>
                                {event.people.length > 0 && (
                                  <div className="flex items-center gap-1">
                                    <Users className="w-3 h-3" />
                                    <span>{event.people.length}</span>
                                  </div>
                                )}
                                {event.locations.length > 0 && (
                                  <div className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    <span>{event.locations.length}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className={`${getConfidenceColor(event.confidence)} border-current text-xs`}
                            >
                              {Math.round(event.confidence * 100)}%
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                      {/* Continuity Notes */}
                      {eventWithContinuity?.continuity_notes &&
                        eventWithContinuity.continuity_notes.length > 0 && (
                          <div className="mt-1 ml-4 pl-3 border-l border-border/30">
                            {eventWithContinuity.continuity_notes.map((note, idx) => (
                              <p key={idx} className="text-xs text-white/50 italic mb-1">
                                {note}
                              </p>
                            ))}
                          </div>
                        )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recurring Patterns */}
          {data.event_groups.recurring_patterns.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Recurring Themes
              </h3>
              <div className="space-y-2">
                {data.event_groups.recurring_patterns.map((pattern, idx) => (
                  <Card key={idx} className="border-border/40 bg-black/20">
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-sm">{pattern.label}</h4>
                          <p className="text-xs text-white/60 mt-1">
                            Appeared {pattern.frequency} {pattern.frequency === 1 ? 'time' : 'times'}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {pattern.frequency}x
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Unresolved Moments */}
          {data.event_groups.unresolved_events.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Unclear or Ongoing
              </h3>
              <p className="text-xs text-white/60 mb-3">
                Low-confidence or incomplete moments
              </p>
              <div className="space-y-2">
                {data.event_groups.unresolved_events.slice(0, 3).map(event => (
                  <Card
                    key={event.id}
                    className="border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/10 cursor-pointer transition"
                    onClick={() => handleEventClick(event.id)}
                  >
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h4 className="font-medium text-sm mb-1">{event.title}</h4>
                          {event.summary && (
                            <p className="text-xs text-white/60 line-clamp-2">{event.summary}</p>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className={`${getConfidenceColor(event.confidence)} border-current text-xs`}
                        >
                          {Math.round(event.confidence * 100)}%
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {data.event_groups.significant_events.length === 0 &&
            data.event_groups.recurring_patterns.length === 0 &&
            data.event_groups.unresolved_events.length === 0 && (
              <div className="text-center py-12 text-white/60">
                <Sparkles className="w-12 h-12 mx-auto mb-4 text-white/20" />
                <p className="text-sm">No notable events in this timeframe</p>
                <p className="text-xs text-white/40 mt-2">
                  Events are automatically created from your conversations
                </p>
              </div>
            )}
        </CardContent>
      </Card>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => {
            setSelectedEvent(null);
            refresh(); // Refresh after closing
          }}
        />
      )}
    </>
  );
};

