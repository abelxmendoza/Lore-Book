// =====================================================
// EVENT CARD EXAMPLE WITH LABELS
// Purpose: Show users what each element on an event card means
// =====================================================

import { Calendar, Clock, MapPin, Users, MessageSquare, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { format, parseISO } from 'date-fns';

interface EventCardExampleProps {
  onClose?: () => void;
}

export const EventCardExample: React.FC<EventCardExampleProps> = ({ onClose }) => {
  // Example event data
  const exampleEvent = {
    id: 'example-1',
    title: 'Weekend Hiking Trip',
    summary: 'Went hiking in the mountains with friends',
    type: 'recreation',
    start_time: new Date().toISOString(),
    end_time: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    confidence: 0.95,
    people: ['Alex', 'Sarah'],
    locations: ['Mountain Trail'],
    activities: ['hiking', 'outdoor'],
    source_count: 3,
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
    <div className="relative w-full max-w-5xl mx-auto">
      {/* Labels Grid Layout */}
      <div className="grid grid-cols-12 gap-4 mb-4">
        {/* Left Column - Labels */}
        <div className="col-span-3 space-y-3">
          <div className="bg-black/80 border border-primary/50 rounded-lg px-3 py-2 shadow-lg">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-semibold text-white">Event Icon</span>
            </div>
            <p className="text-[10px] text-white/60">Visual indicator for events</p>
          </div>

          <div className="bg-black/80 border border-green-500/50 rounded-lg px-3 py-2 shadow-lg">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs font-semibold text-white">Confidence</span>
            </div>
            <p className="text-[10px] text-white/60">High = certain, Low = uncertain</p>
          </div>

          <div className="bg-black/80 border border-primary/50 rounded-lg px-3 py-2 shadow-lg">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-semibold text-white">Event Title</span>
            </div>
            <p className="text-[10px] text-white/60">Main name of the event</p>
          </div>

          <div className="bg-black/80 border border-primary/50 rounded-lg px-3 py-2 shadow-lg">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-semibold text-white">Event Type</span>
            </div>
            <p className="text-[10px] text-white/60">Category (work, social, etc.)</p>
          </div>
        </div>

        {/* Middle Column - The Card */}
        <div className="col-span-6 relative">
          <Card className="group cursor-pointer transition-all duration-300 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/20 hover:-translate-y-1 bg-gradient-to-br from-black/60 via-black/40 to-black/60 border-2 border-primary/30 overflow-visible">
            {/* Header with Calendar Icon */}
            <div className="relative h-16 bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-pink-500/20 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
              <div className="relative z-10">
                <Calendar className="h-8 w-8 text-primary" />
              </div>
              
              {/* Confidence Badge */}
              <div className="absolute top-2 right-2 z-10">
                <Badge 
                  variant="outline"
                  className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] px-1.5 py-0.5 flex items-center gap-1"
                >
                  High
                </Badge>
              </div>
            </div>

            <CardHeader className="pb-1.5 pt-2.5 px-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-white truncate group-hover:text-primary transition-colors line-clamp-2">
                    {exampleEvent.title}
                  </h3>
                  {exampleEvent.type && (
                    <p className="text-xs text-white/50 mt-0.5 truncate">
                      {exampleEvent.type}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-white/30 group-hover:text-primary group-hover:translate-x-1 transition-all flex-shrink-0" />
              </div>
            </CardHeader>
            
            <CardContent className="space-y-2 pt-0 px-4 pb-3">
              {exampleEvent.summary && (
                <p className="text-xs text-white/70 line-clamp-2 leading-snug">{exampleEvent.summary}</p>
              )}
              
              {/* Metadata Row */}
              <div className="flex flex-wrap gap-2 text-[10px] text-white/50">
                <div className="flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  <span>{formatDate(exampleEvent.start_time)}</span>
                  {formatTime(exampleEvent.start_time) && (
                    <span className="text-white/40">· {formatTime(exampleEvent.start_time)}</span>
                  )}
                </div>
                {exampleEvent.people.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Users className="h-2.5 w-2.5" />
                    <span>{exampleEvent.people.length} {exampleEvent.people.length === 1 ? 'person' : 'people'}</span>
                  </div>
                )}
                {exampleEvent.locations.length > 0 && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-2.5 w-2.5" />
                    <span>{exampleEvent.locations.length} {exampleEvent.locations.length === 1 ? 'location' : 'locations'}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <MessageSquare className="h-2.5 w-2.5" />
                  <span>{exampleEvent.source_count} {exampleEvent.source_count === 1 ? 'source' : 'sources'}</span>
                </div>
              </div>

              {/* Activities/Tags */}
              {exampleEvent.activities && exampleEvent.activities.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1.5 border-t border-border/30">
                  {exampleEvent.activities.slice(0, 3).map((activity) => (
                    <Badge
                      key={activity}
                      variant="outline"
                      className="px-2 py-0.5 text-xs bg-primary/5 text-primary/80 border-primary/20 hover:bg-primary/10 transition-colors"
                    >
                      {activity}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Labels */}
        <div className="col-span-3 space-y-3">
          <div className="bg-black/80 border border-primary/50 rounded-lg px-3 py-2 shadow-lg">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-semibold text-white">Click to View</span>
            </div>
            <p className="text-[10px] text-white/60">Open full details & chat</p>
          </div>

          <div className="bg-black/80 border border-primary/50 rounded-lg px-3 py-2 shadow-lg">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-semibold text-white">Summary</span>
            </div>
            <p className="text-[10px] text-white/60">Brief description</p>
          </div>
        </div>
      </div>

      {/* Bottom Row - Metadata Labels */}
      <div className="grid grid-cols-5 gap-3 mt-4">
        <div className="bg-black/80 border border-primary/50 rounded-lg px-3 py-2 shadow-lg">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-3 w-3 text-primary" />
            <span className="text-xs font-semibold text-white">Date & Time</span>
          </div>
          <p className="text-[10px] text-white/60">When it happened</p>
        </div>

        <div className="bg-black/80 border border-primary/50 rounded-lg px-3 py-2 shadow-lg">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-3 w-3 text-primary" />
            <span className="text-xs font-semibold text-white">People</span>
          </div>
          <p className="text-[10px] text-white/60">Who was involved</p>
        </div>

        <div className="bg-black/80 border border-primary/50 rounded-lg px-3 py-2 shadow-lg">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="h-3 w-3 text-primary" />
            <span className="text-xs font-semibold text-white">Location</span>
          </div>
          <p className="text-[10px] text-white/60">Where it happened</p>
        </div>

        <div className="bg-black/80 border border-primary/50 rounded-lg px-3 py-2 shadow-lg">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="h-3 w-3 text-primary" />
            <span className="text-xs font-semibold text-white">Sources</span>
          </div>
          <p className="text-[10px] text-white/60">Messages mentioning this</p>
        </div>

        <div className="bg-black/80 border border-primary/50 rounded-lg px-3 py-2 shadow-lg">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-semibold text-white">Activities</span>
          </div>
          <p className="text-[10px] text-white/60">What you did</p>
        </div>
      </div>
    </div>
  );
};
