// =====================================================
// CHARACTER RELATIONSHIP TIMELINE
// Purpose: Show shared experiences and lore for a character
// =====================================================

import { useState, useEffect } from 'react';
import { Calendar, Users, BookOpen, Heart, Clock, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Button } from '../ui/button';
import { fetchJson } from '../../lib/api';
import { format, parseISO } from 'date-fns';
import { EventDetailModal } from '../events/EventDetailModal';
import type { Event } from '../events/EventProfileCard';

type TimelineEvent = {
  id: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventSummary?: string;
  eventType?: string;
  timelineType: 'shared_experience' | 'lore' | 'mentioned_in';
  characterRole?: string;
  userWasPresent: boolean;
  impactType?: string;
  connectionCharacter?: string;
  emotionalImpact?: string;
  confidence: number;
};

interface CharacterRelationshipTimelineProps {
  characterId: string;
}

export const CharacterRelationshipTimeline: React.FC<CharacterRelationshipTimelineProps> = ({
  characterId,
}) => {
  const [sharedExperiences, setSharedExperiences] = useState<TimelineEvent[]>([]);
  const [lore, setLore] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(false);

  useEffect(() => {
    loadTimelines();
  }, [characterId]);

  const loadTimelines = async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{
        success: boolean;
        timelines: {
          sharedExperiences: TimelineEvent[];
          lore: TimelineEvent[];
        };
      }>(`/api/conversation/characters/${characterId}/timelines`);

      if (data.success) {
        setSharedExperiences(data.timelines.sharedExperiences);
        setLore(data.timelines.lore);
      } else {
        // Use mock data if API fails or returns empty
        generateMockTimelineData();
      }
    } catch (error) {
      console.error('Failed to load timelines:', error);
      // Use mock data on error
      generateMockTimelineData();
    } finally {
      setLoading(false);
    }
  };

  const generateMockTimelineData = () => {
    const now = Date.now();
    const mockShared: TimelineEvent[] = [
      {
        id: 'mock-shared-1',
        eventId: 'mock-event-1',
        eventTitle: 'Birthday Party Celebration',
        eventDate: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
        eventSummary: 'Celebrated birthday together with friends and family',
        eventType: 'social',
        timelineType: 'shared_experience',
        characterRole: 'participant',
        userWasPresent: true,
        impactType: 'direct_participant',
        emotionalImpact: 'positive',
        confidence: 0.9,
      },
      {
        id: 'mock-shared-2',
        eventId: 'mock-event-2',
        eventTitle: 'Coffee Meetup',
        eventDate: new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString(),
        eventSummary: 'Met for coffee and caught up on life',
        eventType: 'social',
        timelineType: 'shared_experience',
        characterRole: 'participant',
        userWasPresent: true,
        impactType: 'direct_participant',
        emotionalImpact: 'positive',
        confidence: 0.85,
      },
      {
        id: 'mock-shared-3',
        eventId: 'mock-event-3',
        eventTitle: 'Work Project Collaboration',
        eventDate: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
        eventSummary: 'Worked together on an important project',
        eventType: 'work',
        timelineType: 'shared_experience',
        characterRole: 'participant',
        userWasPresent: true,
        impactType: 'direct_participant',
        emotionalImpact: 'neutral',
        confidence: 0.8,
      },
    ];

    const mockLore: TimelineEvent[] = [
      {
        id: 'mock-lore-1',
        eventId: 'mock-event-4',
        eventTitle: 'Got Promoted at Work',
        eventDate: new Date(now - 45 * 24 * 60 * 60 * 1000).toISOString(),
        eventSummary: 'Received a promotion to senior position',
        eventType: 'work',
        timelineType: 'lore',
        characterRole: 'subject',
        userWasPresent: false,
        impactType: 'related_person_affected',
        emotionalImpact: 'positive',
        confidence: 0.75,
      },
      {
        id: 'mock-lore-2',
        eventId: 'mock-event-5',
        eventTitle: 'Moved to New Apartment',
        eventDate: new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString(),
        eventSummary: 'Relocated to a new neighborhood',
        eventType: 'personal',
        timelineType: 'lore',
        characterRole: 'subject',
        userWasPresent: false,
        impactType: 'observer',
        emotionalImpact: 'neutral',
        confidence: 0.7,
      },
      {
        id: 'mock-lore-3',
        eventId: 'mock-event-6',
        eventTitle: 'Started New Hobby',
        eventDate: new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString(),
        eventSummary: 'Began learning photography and joined a local club',
        eventType: 'personal',
        timelineType: 'lore',
        characterRole: 'subject',
        userWasPresent: false,
        impactType: 'observer',
        emotionalImpact: 'positive',
        confidence: 0.65,
      },
      {
        id: 'mock-lore-4',
        eventId: 'mock-event-7',
        eventTitle: 'Family Gathering',
        eventDate: new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString(),
        eventSummary: 'Attended family reunion with extended relatives',
        eventType: 'family',
        timelineType: 'lore',
        characterRole: 'participant',
        userWasPresent: false,
        impactType: 'related_person_affected',
        connectionCharacter: 'Family',
        emotionalImpact: 'positive',
        confidence: 0.8,
      },
    ];

    setSharedExperiences(mockShared);
    setLore(mockLore);
  };

  const handleEventClick = async (eventId: string) => {
    setLoadingEvent(true);
    try {
      const result = await fetchJson<{ success: boolean; event: Event }>(
        `/api/conversation/events/${eventId}`
      );
      if (result.success) {
        setSelectedEvent(result.event);
      }
    } catch (error) {
      console.error('Failed to load event:', error);
    } finally {
      setLoadingEvent(false);
    }
  };

  const rebuildTimelines = async () => {
    setLoading(true);
    try {
      await fetchJson(`/api/conversation/characters/${characterId}/rebuild-timelines`, {
        method: 'POST',
      });
      await loadTimelines();
    } catch (error) {
      console.error('Failed to rebuild timelines:', error);
    } finally {
      setLoading(false);
    }
  };

  const getImpactColor = (impactType?: string) => {
    switch (impactType) {
      case 'direct_participant':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'indirect_affected':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'related_person_affected':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      case 'observer':
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
      case 'ripple_effect':
        return 'bg-pink-500/20 text-pink-300 border-pink-500/30';
      default:
        return 'bg-white/10 text-white/70 border-white/20';
    }
  };

  const getImpactLabel = (impactType?: string) => {
    switch (impactType) {
      case 'direct_participant':
        return 'You were there';
      case 'indirect_affected':
        return 'Affects you';
      case 'related_person_affected':
        return 'Affects someone close';
      case 'observer':
        return 'You mentioned this';
      case 'ripple_effect':
        return 'Ripple effect';
      default:
        return 'Related event';
    }
  };

  const renderTimelineEvent = (event: TimelineEvent) => {
    return (
      <div
        key={event.id}
        className="p-4 rounded-lg border border-white/10 bg-black/20 hover:bg-black/30 cursor-pointer transition-colors mb-3"
        onClick={() => handleEventClick(event.eventId)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="font-semibold text-white">{event.eventTitle}</h4>
              {event.impactType && (
                <Badge variant="outline" className={`text-xs ${getImpactColor(event.impactType)}`}>
                  {getImpactLabel(event.impactType)}
                </Badge>
              )}
              {event.connectionCharacter && (
                <Badge variant="outline" className="text-xs bg-orange-500/20 text-orange-300 border-orange-500/30">
                  via {event.connectionCharacter}
                </Badge>
              )}
            </div>
            {event.eventSummary && (
              <p className="text-sm text-white/70 mb-2 line-clamp-2">{event.eventSummary}</p>
            )}
            <div className="flex items-center gap-4 text-xs text-white/50">
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{format(parseISO(event.eventDate), 'MMM d, yyyy')}</span>
              </div>
              {event.characterRole && (
                <Badge variant="outline" className="text-xs">
                  {event.characterRole}
                </Badge>
              )}
              {event.emotionalImpact && (
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    event.emotionalImpact === 'positive'
                      ? 'bg-green-500/20 text-green-300'
                      : event.emotionalImpact === 'negative'
                      ? 'bg-red-500/20 text-red-300'
                      : 'bg-gray-500/20 text-gray-300'
                  }`}
                >
                  {event.emotionalImpact}
                </Badge>
              )}
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-white/40 flex-shrink-0" />
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <Card className="border-border/60 bg-black/40">
        <CardContent className="p-6">
          <div className="text-center text-white/60">Loading timelines...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-border/60 bg-black/40">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Relationship Timeline
              </CardTitle>
              <CardDescription>
                {sharedExperiences.length} shared experiences • {lore.length} stories (lore)
              </CardDescription>
            </div>
            <Button onClick={rebuildTimelines} variant="outline" size="sm">
              Rebuild
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="shared" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="shared" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Shared Experiences ({sharedExperiences.length})
              </TabsTrigger>
              <TabsTrigger value="lore" className="flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                Their Story / Lore ({lore.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="shared" className="mt-0">
              {sharedExperiences.length === 0 ? (
                <div className="text-center text-white/60 py-8">
                  <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No shared experiences yet</p>
                  <p className="text-sm mt-2">Events you both participated in will appear here</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {sharedExperiences.map(renderTimelineEvent)}
                </div>
              )}
            </TabsContent>

            <TabsContent value="lore" className="mt-0">
              {lore.length === 0 ? (
                <div className="text-center text-white/60 py-8">
                  <BookOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No lore/stories yet</p>
                  <p className="text-sm mt-2">Stories about them that you weren't part of will appear here</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {lore.map(renderTimelineEvent)}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => {
            setSelectedEvent(null);
            loadTimelines();
          }}
        />
      )}
    </>
  );
};
