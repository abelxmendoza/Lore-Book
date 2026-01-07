// =====================================================
// EVENTS VIEW
// Purpose: Display AI-assembled events in timeline layout
// =====================================================

import { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, Users, Sparkles, AlertCircle, MessageSquare, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { fetchJson } from '../../lib/api';
import { format, parseISO } from 'date-fns';
import { EventDetailModal } from './EventDetailModal';
import { EventActionsMenu } from './EventActionsMenu';
import { EventMetaTags } from './EventMetaTags';

interface Event {
  id: string;
  title: string;
  summary: string | null;
  type: string | null;
  start_time: string;
  end_time: string | null;
  confidence: number;
  people: string[];
  locations: string[];
  activities: string[];
  source_count: number;
  created_at: string;
  updated_at: string;
}

export const EventsView: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventDetail, setEventDetail] = useState<Event | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJson<{ success: boolean; events: Event[] }>('/api/conversation/events');
      if (result.success) {
        setEvents(result.events || []);
      } else {
        setError('Failed to load events');
      }
    } catch (err: any) {
      console.error('Failed to load events:', err);
      setError(err.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'MMM d, yyyy h:mm a');
    } catch {
      return dateString;
    }
  };

  const formatDateShort = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'MMM d');
    } catch {
      return dateString;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.7) return 'text-green-400';
    if (confidence >= 0.4) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getConfidenceLabel = (confidence: number): string => {
    if (confidence >= 0.7) return 'High confidence';
    if (confidence >= 0.4) return 'Mixed';
    return 'Still forming';
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-white/10 rounded animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-white/10 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-5 h-5" />
              <p>{error}</p>
            </div>
            <Button onClick={loadEvents} className="mt-4" variant="outline">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleEventClick = async (event: Event) => {
    setLoadingDetail(true);
    try {
      const result = await fetchJson<{ success: boolean; event: Event }>(
        `/api/conversation/events/${event.id}`
      );
      if (result.success) {
        setEventDetail(result.event);
      }
    } catch (err: any) {
      console.error('Failed to load event detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  if (eventDetail) {
    return (
      <EventDetailModal
        event={eventDetail}
        onClose={() => {
          setEventDetail(null);
          loadEvents(); // Refresh events after closing
        }}
      />
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Events Timeline</h1>
        <p className="text-white/60 text-sm">
          AI-assembled events from your conversations
        </p>
      </div>

      <div className="space-y-4">
        {events.map(event => (
          <Card
            key={event.id}
            className="border-border/60 bg-black/40 hover:bg-black/60 transition-colors cursor-pointer"
            onClick={() => handleEventClick(event)}
          >
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold mb-1">{event.title}</h3>
                      {event.summary && (
                        <p className="text-sm text-white/70 line-clamp-2">{event.summary}</p>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={`${getConfidenceColor(event.confidence)} border-current`}
                      title={getConfidenceLabel(event.confidence)}
                    >
                      {getConfidenceLabel(event.confidence)} ({Math.round(event.confidence * 100)}%)
                    </Badge>
                  </div>

                  {/* Metadata */}
                  <div className="flex flex-wrap items-center gap-4 text-sm text-white/60">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />
                      <span>{formatDateShort(event.start_time)}</span>
                      {event.end_time && (
                        <span> - {formatDateShort(event.end_time)}</span>
                      )}
                    </div>

                    {event.people.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Users className="w-4 h-4" />
                        <span>{event.people.length} {event.people.length === 1 ? 'person' : 'people'}</span>
                      </div>
                    )}

                    {event.locations.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4" />
                        <span>{event.locations.length} {event.locations.length === 1 ? 'location' : 'locations'}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5">
                      <MessageSquare className="w-4 h-4" />
                      <span>{event.source_count} {event.source_count === 1 ? 'source' : 'sources'}</span>
                    </div>
                  </div>
                </div>

                <ChevronRight className="w-5 h-5 text-white/40 flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

