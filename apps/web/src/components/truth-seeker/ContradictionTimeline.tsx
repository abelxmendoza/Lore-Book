import { useMemo } from 'react';
import { Calendar, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

type TimelineEvent = {
  id: string;
  date: string;
  type: 'original' | 'contradicting' | 'context';
  label: string;
  componentId?: string;
};

type ContradictionTimelineProps = {
  originalDate: string;
  contradictingDate: string;
  contextEvents?: Array<{ id: string; date: string; label: string }>;
  onEventClick?: (eventId: string) => void;
};

export const ContradictionTimeline = ({
  originalDate,
  contradictingDate,
  contextEvents = [],
  onEventClick,
}: ContradictionTimelineProps) => {
  const timelineEvents = useMemo(() => {
    const events: TimelineEvent[] = [
      {
        id: 'original',
        date: originalDate,
        type: 'original',
        label: 'Original Statement',
      },
      {
        id: 'contradicting',
        date: contradictingDate,
        type: 'contradicting',
        label: 'Contradicting Statement',
      },
      ...contextEvents.map(e => ({
        id: e.id,
        date: e.date,
        type: 'context' as const,
        label: e.label,
      })),
    ];

    return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [originalDate, contradictingDate, contextEvents]);

  const minDate = useMemo(() => {
    return Math.min(...timelineEvents.map(e => new Date(e.date).getTime()));
  }, [timelineEvents]);

  const maxDate = useMemo(() => {
    return Math.max(...timelineEvents.map(e => new Date(e.date).getTime()));
  }, [timelineEvents]);

  const getPosition = (date: string) => {
    const dateTime = new Date(date).getTime();
    const range = maxDate - minDate;
    if (range === 0) return 50;
    return ((dateTime - minDate) / range) * 100;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getEventColor = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'original':
        return 'bg-blue-500 border-blue-400';
      case 'contradicting':
        return 'bg-red-500 border-red-400';
      case 'context':
        return 'bg-gray-500 border-gray-400';
    }
  };

  return (
    <Card className="bg-black/40 border-border/60">
      <CardHeader>
        <CardTitle className="text-lg text-white flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Timeline Context
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative h-32">
          {/* Timeline Line */}
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-border/60 transform -translate-y-1/2" />

          {/* Events */}
          {timelineEvents.map((event) => {
            const position = getPosition(event.date);
            return (
              <div
                key={event.id}
                className="absolute top-1/2 transform -translate-y-1/2 -translate-x-1/2"
                style={{ left: `${position}%` }}
              >
                <div className="flex flex-col items-center">
                  <div
                    className={`w-4 h-4 rounded-full border-2 ${getEventColor(event.type)} cursor-pointer hover:scale-125 transition-transform ${
                      onEventClick ? '' : ''
                    }`}
                    onClick={() => onEventClick?.(event.id)}
                    title={event.label}
                  />
                  <div className="mt-2 text-xs text-white/60 whitespace-nowrap">
                    {formatDate(event.date)}
                  </div>
                  <div className="mt-1 text-xs text-white/80 font-medium max-w-[100px] text-center truncate">
                    {event.label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex gap-4 mt-6 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-blue-400" />
            <span className="text-white/60">Original</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-red-400" />
            <span className="text-white/60">Contradicting</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-500 border-2 border-gray-400" />
            <span className="text-white/60">Context</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

