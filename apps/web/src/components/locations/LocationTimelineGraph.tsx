import { useMemo } from 'react';
import { Calendar, MapPin } from 'lucide-react';
import type { TimelineEntry } from '../../hooks/useTimelineData';

type LocationTimelineGraphProps = {
  entries: TimelineEntry[];
  locationName: string;
};

type GraphNode = {
  id: string;
  title: string;
  date: Date;
  endDate?: Date;
  color: string;
  type: 'visit' | 'event';
  mood?: string;
};

// Generate dummy graph data - always generates data for demo purposes
const generateDummyGraphData = (entries: TimelineEntry[], locationName: string): GraphNode[] => {
  const now = new Date();
  const nodes: GraphNode[] = [];
  
  // Always generate dummy visits for demo (8-12 visits over past 3 months)
  const visitCount = entries.length > 0 ? entries.length : 8 + Math.floor(Math.random() * 5);
  const moods = ['excited', 'focused', 'calm', 'happy', 'anxious'];
  const visitTypes = [
    'Meeting',
    'Workshop',
    'Networking Event',
    'Conference',
    'Team Lunch',
    'Client Visit',
    'Training Session',
    'Social Gathering'
  ];
  
  // Use real entries if available, otherwise generate dummy
  if (entries.length > 0) {
    return entries.map((entry, index) => {
      const entryDate = new Date(entry.timestamp);
      const isMultiDay = entry.related_entry_ids.length > 2;
      
      return {
        id: entry.id,
        title: entry.title || entry.summary?.substring(0, 50) || `Visit to ${locationName}`,
        date: entryDate,
        endDate: isMultiDay ? new Date(entryDate.getTime() + 2 * 24 * 60 * 60 * 1000) : undefined,
        color: isMultiDay ? '#8b5cf6' : '#06b6d4',
        type: isMultiDay ? 'event' : 'visit',
        mood: entry.mood || undefined
      };
    }).sort((a, b) => a.date.getTime() - b.date.getTime());
  }
  
  // Generate dummy visits
  for (let i = 0; i < visitCount; i++) {
    const daysAgo = Math.floor(Math.random() * 90);
    const visitDate = new Date(now);
    visitDate.setDate(visitDate.getDate() - daysAgo);
    visitDate.setHours(9 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60), 0, 0);
    
    // Some visits might be multi-day events (30% chance)
    const isMultiDay = Math.random() > 0.7;
    const duration = isMultiDay ? Math.floor(Math.random() * 3) + 1 : 0;
    const endDate = duration > 0 ? new Date(visitDate) : undefined;
    if (endDate) {
      endDate.setDate(endDate.getDate() + duration);
    }
    
    const visitType = visitTypes[Math.floor(Math.random() * visitTypes.length)];
    const mood = moods[Math.floor(Math.random() * moods.length)];
    
    nodes.push({
      id: `dummy-visit-${i}`,
      title: isMultiDay 
        ? `${visitType} at ${locationName} (${duration} day${duration > 1 ? 's' : ''})`
        : `${visitType} at ${locationName}`,
      date: visitDate,
      endDate: endDate,
      color: isMultiDay ? '#8b5cf6' : '#06b6d4',
      type: isMultiDay ? 'event' : 'visit',
      mood: mood
    });
  }
  
  return nodes.sort((a, b) => a.date.getTime() - b.date.getTime());
};

export const LocationTimelineGraph = ({ entries, locationName }: LocationTimelineGraphProps) => {
  const nodes = useMemo(() => generateDummyGraphData(entries, locationName), [entries, locationName]);
  
  const minDate = useMemo(() => {
    if (nodes.length === 0) return new Date();
    return new Date(Math.min(...nodes.map(n => n.date.getTime())));
  }, [nodes]);

  const maxDate = useMemo(() => {
    if (nodes.length === 0) return new Date();
    const dates = nodes.map(n => n.endDate?.getTime() || n.date.getTime());
    return new Date(Math.max(...dates));
  }, [nodes]);

  const totalDays = useMemo(() => {
    return Math.max(1, Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)));
  }, [minDate, maxDate]);

  const getPosition = (date: Date) => {
    const daysSinceStart = (date.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24);
    return (daysSinceStart / totalDays) * 100;
  };

  const getWidth = (startDate: Date, endDate?: Date) => {
    if (!endDate) return 2;
    const days = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(2, (days / totalDays) * 100);
  };

  const moodColors: Record<string, string> = {
    excited: '#fbbf24',
    focused: '#60a5fa',
    calm: '#34d399',
    happy: '#fbbf24',
    anxious: '#a78bfa',
    default: '#06b6d4'
  };

  // Always show graph with dummy data if no nodes (shouldn't happen due to dummy generation)
  if (nodes.length === 0) {
    return (
      <div className="text-center py-12 text-white/60">
        <Calendar className="h-12 w-12 mx-auto mb-4 text-white/20" />
        <p className="text-lg font-medium mb-2">No visits recorded</p>
        <p className="text-sm">Visits to {locationName} will appear here</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-auto bg-black/20 rounded-lg border border-border/30">
      <div className="relative min-w-full p-4" style={{ height: `${Math.max(300, nodes.length * 70 + 80)}px` }}>
        {/* Time axis */}
        <div className="sticky top-0 z-10 bg-black/90 border-b border-border/60 pb-3 mb-4 rounded-t-lg">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold text-white">Visit Timeline</h4>
          </div>
          <div className="relative h-8">
            {[0, 25, 50, 75, 100].map((percent) => {
              const date = new Date(minDate.getTime() + (percent / 100) * totalDays * 24 * 60 * 60 * 1000);
              return (
                <div
                  key={percent}
                  className="absolute top-0 border-l border-white/20 h-full"
                  style={{ left: `${percent}%` }}
                >
                  <div className="absolute -top-5 left-0 transform -translate-x-1/2 text-xs text-white/60 whitespace-nowrap">
                    {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Timeline nodes */}
        <div className="relative space-y-3">
          {nodes.map((node, index) => {
            const left = getPosition(node.date);
            const width = node.endDate ? getWidth(node.date, node.endDate) : 2;
            const top = index * 70 + 20;
            const nodeColor = node.mood ? moodColors[node.mood] || moodColors.default : node.color;

            return (
              <div
                key={node.id}
                className="absolute group"
                style={{
                  left: `${left}%`,
                  top: `${top}px`,
                  width: node.endDate ? `${width}%` : '2px',
                  minWidth: node.endDate ? '60px' : '2px'
                }}
              >
                <div
                  className={`relative rounded-lg border-2 transition-all hover:scale-105 cursor-pointer ${
                    node.type === 'event'
                      ? 'bg-purple-500/20 border-purple-500/50 h-12'
                      : 'bg-cyan-500/20 border-cyan-500/50 h-10'
                  }`}
                  style={{ 
                    backgroundColor: `${nodeColor}20`, 
                    borderColor: `${nodeColor}50` 
                  }}
                >
                  <div className="flex items-center h-full px-3 gap-2">
                    {node.type === 'event' && (
                      <Calendar className="h-3 w-3 text-purple-400" />
                    )}
                    <span className="text-xs font-medium text-white truncate flex-1">
                      {node.title}
                    </span>
                    {node.mood && (
                      <span 
                        className="text-xs px-1.5 py-0.5 rounded bg-black/40 text-white/70"
                        style={{ backgroundColor: `${nodeColor}30` }}
                      >
                        {node.mood}
                      </span>
                    )}
                  </div>
                  {node.endDate && (
                    <div className="absolute -bottom-5 left-0 text-xs text-white/40 whitespace-nowrap">
                      {node.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {node.endDate && (
                        <> - {node.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
                      )}
                    </div>
                  )}
                  {!node.endDate && (
                    <div className="absolute -bottom-5 left-0 text-xs text-white/40 whitespace-nowrap">
                      {node.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Connection lines for multi-day events */}
        <svg className="absolute inset-0 pointer-events-none" style={{ height: '100%', width: '100%' }}>
          {nodes
            .filter((node) => node.endDate)
            .map((node, index) => {
              const left = getPosition(node.date);
              const width = getWidth(node.date, node.endDate);
              const top = index * 70 + 20 + (node.type === 'event' ? 24 : 20);
              const nodeColor = node.mood ? moodColors[node.mood] || moodColors.default : node.color;
              
              return (
                <line
                  key={`line-${node.id}`}
                  x1={`${left}%`}
                  y1={top}
                  x2={`${left + width}%`}
                  y2={top}
                  stroke={nodeColor}
                  strokeWidth="2"
                  strokeOpacity="0.4"
                />
              );
            })}
        </svg>
      </div>
    </div>
  );
};

