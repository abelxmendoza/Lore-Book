import { Calendar, Clock, MapPin, Users, Sparkles, MessageSquare, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { Tooltip } from '../ui/tooltip';
import { format, parseISO } from 'date-fns';

export type Event = {
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
  impact?: {
    type: 'direct_participant' | 'indirect_affected' | 'related_person_affected' | 'observer' | 'ripple_effect';
    connectionCharacter?: string;
    connectionType?: string;
    emotionalImpact?: 'positive' | 'negative' | 'neutral' | 'mixed';
    impactIntensity: number;
    impactDescription?: string;
  };
};

type EventProfileCardProps = {
  event: Event;
  onClick?: () => void;
};

export const EventProfileCard = ({ event, onClick }: EventProfileCardProps) => {
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.7) return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (confidence >= 0.4) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    return 'bg-red-500/20 text-red-400 border-red-500/30';
  };

  const getConfidenceLabel = (confidence: number): string => {
    if (confidence >= 0.7) return 'High';
    if (confidence >= 0.4) return 'Mixed';
    return 'Low';
  };

  const getImpactVariant = (type: string): 'default' | 'secondary' | 'outline' | 'destructive' => {
    switch (type) {
      case 'direct_participant':
        return 'default';
      case 'indirect_affected':
        return 'secondary';
      case 'related_person_affected':
        return 'outline';
      case 'observer':
        return 'outline';
      case 'ripple_effect':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getImpactLabel = (type: string): string => {
    switch (type) {
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

  const getImpactColor = (type: string): string => {
    switch (type) {
      case 'direct_participant':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'indirect_affected':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'related_person_affected':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'observer':
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      case 'ripple_effect':
        return 'bg-pink-500/20 text-pink-400 border-pink-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'MMM d, yyyy');
    } catch {
      return dateString;
    }
  };

  const formatTime = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'h:mm a');
    } catch {
      return '';
    }
  };

  return (
    <Card 
      className="group cursor-pointer transition-all duration-300 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/20 hover:-translate-y-1 bg-gradient-to-br from-black/60 via-black/40 to-black/60 border-border/50 overflow-hidden"
      onClick={onClick}
    >
      {/* Header with Calendar Icon */}
      <div className="relative h-16 bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-pink-500/20 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
        <div className="relative z-10">
          <Calendar className="h-8 w-8 text-primary" />
        </div>
        <div className="absolute top-2 right-2 z-10">
          <Tooltip 
            content={`${getConfidenceLabel(event.confidence)} confidence (${Math.round(event.confidence * 100)}%). Higher values mean the system is more certain about this event.`}
            side="left"
          >
            <Badge 
              variant="outline"
              className={`${getConfidenceColor(event.confidence)} text-[10px] px-1.5 py-0.5 flex items-center gap-1 cursor-help`}
            >
              {getConfidenceLabel(event.confidence)}
            </Badge>
          </Tooltip>
        </div>
      </div>

      <CardHeader className="pb-1.5 pt-2.5 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <Tooltip content="Event title - click to view full details" side="top">
              <h3 className="text-base font-semibold text-white truncate group-hover:text-primary transition-colors line-clamp-2 cursor-help">
                {event.title}
              </h3>
            </Tooltip>
            {event.type && (
              <Tooltip content={`Event category: ${event.type}`} side="top">
                <p className="text-xs text-white/50 mt-0.5 truncate cursor-help">
                  {event.type}
                </p>
              </Tooltip>
            )}
            {/* Impact Badge */}
            {event.impact && (
              <Tooltip 
                content={event.impact.impactDescription || getImpactLabel(event.impact.type)}
                side="top"
              >
                <Badge
                  variant={getImpactVariant(event.impact.type)}
                  className={`${getImpactColor(event.impact.type)} text-[10px] px-1.5 py-0.5 mt-1.5 inline-flex items-center gap-1 cursor-help`}
                >
                  {getImpactLabel(event.impact.type)}
                  {event.impact.connectionCharacter && (
                    <span className="text-white/60 text-[9px]">
                      (via {event.impact.connectionCharacter})
                    </span>
                  )}
                </Badge>
              </Tooltip>
            )}
          </div>
          <Tooltip content="Click to view full event details and chat" side="left">
            <ChevronRight className="h-3.5 w-3.5 text-white/30 group-hover:text-primary group-hover:translate-x-1 transition-all flex-shrink-0 cursor-help" />
          </Tooltip>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-2 pt-0 px-4 pb-3">
        {event.summary && (
          <Tooltip content="Brief summary of this event" side="top">
            <p className="text-xs text-white/70 line-clamp-2 leading-snug cursor-help">{event.summary}</p>
          </Tooltip>
        )}
        
              {/* Metadata Row */}
              <div className="flex flex-wrap gap-2 text-[10px] text-white/50">
                <Tooltip content="When this event happened" side="top">
                  <div className="flex items-center gap-1 cursor-help">
                    <Clock className="h-2.5 w-2.5" />
                    <span>{formatDate(event.start_time)}</span>
                    {formatTime(event.start_time) && (
                      <span className="text-white/40">· {formatTime(event.start_time)}</span>
                    )}
                  </div>
                </Tooltip>
                {event.people.length > 0 && (
                  <Tooltip content="People who were involved in this event" side="top">
                    <div className="flex items-center gap-1 cursor-help">
                      <Users className="h-2.5 w-2.5" />
                      <span>{event.people.length} {event.people.length === 1 ? 'person' : 'people'}</span>
                    </div>
                  </Tooltip>
                )}
                {event.locations.length > 0 && (
                  <Tooltip content="Where this event took place" side="top">
                    <div className="flex items-center gap-1 cursor-help">
                      <MapPin className="h-2.5 w-2.5" />
                      <span>{event.locations.length} {event.locations.length === 1 ? 'location' : 'locations'}</span>
                    </div>
                  </Tooltip>
                )}
                <Tooltip content="Number of messages or entries that mention this event" side="top">
                  <div className="flex items-center gap-1 cursor-help">
                    <MessageSquare className="h-2.5 w-2.5" />
                    <span>{event.source_count} {event.source_count === 1 ? 'source' : 'sources'}</span>
                  </div>
                </Tooltip>
              </div>

        {/* Activities/Tags */}
        {event.activities && event.activities.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1.5 border-t border-border/30">
            {event.activities.slice(0, 3).map((activity) => (
              <Tooltip key={activity} content={`Activity: ${activity}`} side="top">
                <Badge
                  variant="outline"
                  className="px-2 py-0.5 text-xs bg-primary/5 text-primary/80 border-primary/20 hover:bg-primary/10 transition-colors cursor-help"
                >
                  {activity}
                </Badge>
              </Tooltip>
            ))}
            {event.activities.length > 3 && (
              <Tooltip content={`${event.activities.length - 3} more activities`} side="top">
                <Badge variant="outline" className="px-2 py-0.5 text-xs text-white/40 border-border/30 cursor-help">
                  +{event.activities.length - 3}
                </Badge>
              </Tooltip>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

